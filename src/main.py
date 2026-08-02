# src/main.py
import config
from stock_analyzer import StockAnalyzer
from ai_analyst import GroqAnalyst
from telegram_sender import TelegramSender
from ranking_engine import PythonRankingEngine
import sys
import time
import datetime
from datetime import date
import os
from pymongo import MongoClient
from dotenv import load_dotenv
import asyncio
import aiohttp
from market_holidays import is_egx_open, is_us_open
from price_updater import run_price_update
from sharia_filter import check_sharia_compliance

# Load env variables at startup
load_dotenv()

async def main_async(custom_symbols: list = None):
    try:
        config.validate_config()
    except ValueError as e:
        print(f"Configuration error: {e}")
        sys.exit(1)

    print("Starting SignalMind stock analysis process...")

    analyzer = StockAnalyzer(config)
    groq = GroqAnalyst(config)
    telegram = TelegramSender(config)
    ranking_engine = PythonRankingEngine()

    # MongoDB setup
    db_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")
    try:
        client = MongoClient(db_uri, serverSelectionTimeoutMS=3000)
        # Verify connectivity immediately by pinging the admin database
        client.admin.command('ping')
        
        try:
            db = client.get_default_database()
        except Exception:
            db = None
            
        if db is None:
            db = client["signalmind"]
            
        signals_col = db["signals"]
        logs_col = db["systemlogs"]
        print("[SUCCESS] Successfully connected to MongoDB")
    except Exception as e:
        print("\n[ERROR] MongoDB connection error! Please verify that your MONGODB_URI is correct and your database server is running.")
        print(f"Details: {e}\n")
        sys.exit(1)

    now = datetime.datetime.now(datetime.timezone.utc)
    day_of_week = now.weekday()

    # Read market target from environment
    market_target = os.environ.get("MARKET_TARGET", "BOTH")
    context_str = f"Analyzer_{market_target}"

    # --- DST Time Guard for US Market Open Alignment ---
    is_scheduled = os.environ.get("GITHUB_EVENT_NAME") == "schedule"
    try:
        from zoneinfo import ZoneInfo
        ny_now = datetime.datetime.now(ZoneInfo("America/New_York"))
    except Exception:
        import pytz
        ny_now = datetime.datetime.now(pytz.timezone("America/New_York"))

    ny_time_str = ny_now.strftime("%I:%M %p %Z (%Y-%m-%d)")

    if is_scheduled and market_target in ("US", "BOTH") and not custom_symbols:
        is_in_open_window = (ny_now.hour == 9 and 15 <= ny_now.minute <= 50)
        if not is_in_open_window:
            print(f"[INFO] Skipped: Outside DST-adjusted market open window (Current NY time: {ny_time_str}). This is an expected DST guard skip.")
            return

    # Prevent duplicate runs on the same day (UTC date) - bypassed for manual custom symbol scans
    if not custom_symbols:
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + datetime.timedelta(days=1)
        try:
            existing_run = await asyncio.to_thread(
                logs_col.find_one,
                {
                    "context": context_str,
                    "level": "info",
                    "createdAt": {"$gte": today_start, "$lt": today_end}
                }
            )
            if existing_run:
                print("[INFO] Already ran today, skipping analysis.")
                return
        except Exception as e:
            print(f"[WARNING] Error checking for duplicate run: {e}")

    today_date = date.today()

    stocks_to_analyze = []

    if custom_symbols:
        stocks_to_analyze = custom_symbols
        print(f"[INFO] Running Quick Scan for {len(custom_symbols)} custom symbols: {custom_symbols}")
    elif market_target == "US":
        if is_us_open(today_date):
            stocks_to_analyze = config.US_STOCKS
            print(f"[INFO] Running US-only analysis")
        else:
            print(f"[INFO] US market closed today. Skipping.")
            holiday_msg = "🏖️ SignalMind\nUS market closed today (Holiday/Weekend)\nPrices updated for existing signals ✅"
            await asyncio.to_thread(telegram.send_message, holiday_msg)
            sys.exit(0)

    elif market_target == "EGX":
        # Temporarily paused EGX market
        print(f"[INFO] EGX market is temporarily paused. Skipping.")
        holiday_msg = "🏖️ SignalMind\nEGX market is temporarily paused ✅"
        await asyncio.to_thread(telegram.send_message, holiday_msg)
        sys.exit(0)

    else:  # BOTH
        if is_us_open(today_date):
            stocks_to_analyze += config.US_STOCKS
        # Temporarily paused EGX market
        # if is_egx_open(today_date):
        #     stocks_to_analyze += config.EGX_STOCKS
        if not stocks_to_analyze:
            print(f"[INFO] Both markets closed today. Skipping.")
            holiday_msg = "🏖️ SignalMind\nBoth markets closed today (Holiday/Weekend)\nPrices updated for existing signals ✅"
            await asyncio.to_thread(telegram.send_message, holiday_msg)
            sys.exit(0)

    total_stocks = len(stocks_to_analyze)
    groq_lock = asyncio.Lock()

    # Chunking & Rate Limiting: Process tickers in batches of 10 with a 2.5s cooldown delay
    CHUNK_SIZE = 10
    CHUNK_DELAY_SEC = 2.5
    chunks = [stocks_to_analyze[i:i + CHUNK_SIZE] for i in range(0, len(stocks_to_analyze), CHUNK_SIZE)]
    print(f"Planning to analyze {total_stocks} stocks in {len(chunks)} batches of {CHUNK_SIZE}...")

    results = []
    generated_buy_docs = []
    technically_valid_stocks = []
    screened_candidates = []  # List of tuples: (stock_data, screen_res)

    async with aiohttp.ClientSession() as session:
        print("\n=== STAGE 1 (Part 1): Technical Indicator Filtering ===")
        for chunk_idx, chunk in enumerate(chunks):
            print(f"\n--- Technical Filtering Batch {chunk_idx + 1}/{len(chunks)} ({len(chunk)} tickers) ---")
            for symbol in chunk:
                try:
                    market = "EGX" if symbol.endswith(".CA") else "US"
                    currency = "EGP" if market == "EGX" else "USD"

                    # Deduplication Check
                    existing_signal = await asyncio.to_thread(
                        signals_col.find_one,
                        {
                            "symbol": symbol,
                            "status": {"$regex": "^(active|pending)$", "$options": "i"}
                        }
                    )
                    if existing_signal:
                        print(f"Skipped {symbol}: Active/Pending signal already exists")
                        results.append({"status": "skipped", "symbol": symbol})
                        continue

                    # Filter 0: Dynamic Sharia Compliance Filter (Debt & Cash Ratios <= 33%)
                    is_sharia, sharia_reason = await asyncio.to_thread(check_sharia_compliance, symbol, db)
                    if not is_sharia:
                        print(f"Skipped {symbol}: {sharia_reason}")
                        results.append({"status": "skipped", "symbol": symbol})
                        continue

                    # Fetch stock data
                    df_raw = await asyncio.to_thread(analyzer.fetch_data, symbol)
                    if df_raw is None or df_raw.empty:
                        print(f"[ERROR] Skipping {symbol}: No data.")
                        results.append({"status": "failed", "symbol": symbol})
                        continue

                    # Calculate indicators
                    df_indicators = await asyncio.to_thread(analyzer.calculate_indicators, df_raw)
                    stock_data = analyzer.get_latest_data(df_indicators)
                    stock_data['symbol'] = symbol
                    stock_data['market'] = market
                    stock_data['currency'] = currency

                    # Filter 1: Volume
                    MIN_VOLUME = 1000000
                    vol_avg = float(stock_data.get("volume_avg", 0) or stock_data.get("volume", 0) or 0)
                    if vol_avg < MIN_VOLUME:
                        print(f"Skipped {symbol}: Volume {vol_avg:,.0f} < {MIN_VOLUME:,.0f}")
                        results.append({"status": "skipped", "symbol": symbol})
                        continue

                    # Filter 2: RSI
                    rsi = float(stock_data.get("rsi", 50) or 50)
                    if rsi < 40 or rsi > 70:
                        print(f"Skipped {symbol}: RSI {rsi:.1f} outside 40-70")
                        results.append({"status": "skipped", "symbol": symbol})
                        continue

                    # Filter 3: SMA50
                    close_price = float(stock_data.get("close", 0) or 0)
                    sma50 = float(stock_data.get("sma_50", 0) or stock_data.get("ema_50", 0) or 0)
                    if sma50 > 0 and close_price < sma50:
                        print(f"Skipped {symbol}: Price {close_price:.2f} < SMA50 {sma50:.2f}")
                        results.append({"status": "skipped", "symbol": symbol})
                        continue

                    # Filter 4: Macro Trend
                    if analyzer.is_in_macro_downtrend(stock_data):
                        print(f"Skipped {symbol}: Macro downtrend.")
                        results.append({"status": "skipped", "symbol": symbol})
                        continue

                    # Filter 4b: Weekly Trend Filter
                    if analyzer.is_in_weekly_downtrend(stock_data):
                        print(f"Skipped {symbol}: Clear weekly downtrend (Weekly Close & EMA20 < EMA50).")
                        results.append({"status": "skipped", "symbol": symbol})
                        continue

                    # Filter 5: Python Levels & Validation
                    levels = analyzer.calculate_trading_levels(stock_data)
                    stock_data.update(levels)

                    is_valid, validation_reason = analyzer.validate_trading_levels(
                        entry=levels['entry_price'],
                        sl=levels['stop_loss'],
                        tp=levels['take_profit'],
                        resistance=float(stock_data.get('resistance', 0) or 0)
                    )
                    if not is_valid:
                        print(f"Skipped {symbol}: Level validation failure - {validation_reason}")
                        results.append({"status": "skipped", "symbol": symbol})
                        continue

                    technically_valid_stocks.append(stock_data)

                except Exception as e:
                    print(f"[ERROR] Technical filter failed for {symbol}: {e}")
                    results.append({"status": "failed", "symbol": symbol})

            if chunk_idx < len(chunks) - 1:
                await asyncio.sleep(0.5)

        print(f"\n=== STAGE 1 (Part 2): Batch Fast Screening (llama-3.1-8b-instant) ===")
        print(f"Running batch AI screening on {len(technically_valid_stocks)} technically valid stocks in groups of 10...")

        SCREEN_BATCH_SIZE = 10
        stock_batches = [technically_valid_stocks[i:i + SCREEN_BATCH_SIZE] for i in range(0, len(technically_valid_stocks), SCREEN_BATCH_SIZE)]

        for b_idx, s_batch in enumerate(stock_batches, 1):
            print(f"--- Fast Screening Batch {b_idx}/{len(stock_batches)} ({len(s_batch)} stocks) ---")
            async with groq_lock:
                batch_evals = await groq.quick_screen_batch(s_batch, session)
                await asyncio.sleep(1.0)

            eval_map = {res['symbol']: res for res in batch_evals}
            for s_data in s_batch:
                sym = s_data['symbol']
                screen_res = eval_map.get(sym, {"symbol": sym, "score": 5, "passed": False, "reason": "Missing batch eval"})
                if screen_res.get('passed'):
                    print(f"✅ [STAGE 1 PASSED] {sym}: Score={screen_res.get('score')}/10 ({screen_res.get('reason')})")
                    screened_candidates.append((s_data, screen_res))
                else:
                    print(f"❌ [STAGE 1 REJECTED] {sym}: Score={screen_res.get('score')}/10 ({screen_res.get('reason')})")
                    results.append({"status": "skipped", "symbol": sym})

        # Sort passed candidates by Stage 1 score descending
        passed_candidates = [item for item in screened_candidates if item[1].get('passed', False)]
        passed_candidates.sort(key=lambda x: x[1].get('score', 0), reverse=True)

        # Pick Top 10 passed candidates for Stage 2 deep analysis
        top_10_candidates = passed_candidates[:10]

        print(f"\n=======================================================")
        print(f"🏆 STAGE 1 SUMMARY: {len(passed_candidates)} stocks passed fast screening.")
        print(f"🎯 Selected Top {len(top_10_candidates)} candidates for STAGE 2 Deep Analysis.")
        print(f"=======================================================\n")

        print("=== STAGE 2: Deep Technical Analysis (llama-3.3-70b-versatile) ===")
        for cand_idx, (stock_data, screen_res) in enumerate(top_10_candidates, 1):
            symbol = stock_data['symbol']
            close_price = stock_data['close']
            market = stock_data['market']
            currency = stock_data['currency']

            print(f"\n--- Stage 2 Deep Analysis ({cand_idx}/{len(top_10_candidates)}): {symbol} (Screen Score: {screen_res.get('score')}) ---")

            try:
                async with groq_lock:
                    analysis = await groq.analyze(stock_data, session)
                    await asyncio.sleep(2.5)

                if not analysis:
                    print(f"Failed Stage 2 AI analysis for {symbol}.")
                    results.append({"status": "failed", "symbol": symbol})
                    continue

                # Fetch 60m intraday precision data for DAY_TRADE level calculation
                intraday_data = await asyncio.to_thread(analyzer.get_intraday_data, symbol)
                if intraday_data:
                    intraday_levels = analyzer.calculate_trading_levels(stock_data, intraday_data=intraday_data)
                    is_valid, val_reason = analyzer.validate_trading_levels(
                        entry=intraday_levels['entry_price'],
                        sl=intraday_levels['stop_loss'],
                        tp=intraday_levels['take_profit'],
                        resistance=float(intraday_data.get('intraday_resistance', stock_data.get('resistance', 0)))
                    )
                    if is_valid:
                        stock_data.update(intraday_levels)
                        print(f"[INTRADAY PRECISION] Applied 60m intraday levels for {symbol}: Entry=${intraday_levels['entry_price']}, SL=${intraday_levels['stop_loss']}, TP=${intraday_levels['take_profit']}")

                # Enforce pre-calculated 100% Python trading levels
                analysis['entry_price'] = stock_data['entry_price']
                analysis['stop_loss'] = stock_data['stop_loss']
                analysis['take_profit'] = stock_data['take_profit']

                # Structure indicators for DB model
                db_indicators = {
                    "close": stock_data.get("close"),
                    "rsi": stock_data.get("rsi"),
                    "macdLine": stock_data.get("macd_line"),
                    "macdSignal": stock_data.get("macd_signal"),
                    "sma20": stock_data.get("sma_20"),
                    "sma50": stock_data.get("sma_50"),
                    "ema20": stock_data.get("ema_20"),
                    "ema50": stock_data.get("ema_50"),
                    "ema200": stock_data.get("ema_200"),
                    "support": stock_data.get("support"),
                    "resistance": stock_data.get("resistance"),
                    "bbHigh": stock_data.get("bb_high"),
                    "bbLow": stock_data.get("bb_low"),
                    "bbMid": stock_data.get("bb_mid"),
                    "stochRsiK": stock_data.get("stoch_rsi_k"),
                    "stochRsiD": stock_data.get("stoch_rsi_d"),
                    "volume": stock_data.get("volume"),
                    "volumeAvg": stock_data.get("volume_avg")
                }

                signal_type = analysis.get('signal', 'HOLD')
                entry_price = float(analysis.get('entry_price', stock_data.get('close', 0)))
                take_profit = float(analysis.get('take_profit', 0))
                stop_loss = float(analysis.get('stop_loss', 0))
                ai_confidence = analysis.get('confidence', 'Medium')
                ai_risk = analysis.get('risk', 'Medium')
                explanation_arabic = analysis.get('explanation_arabic', '')
                timeframe = analysis.get('timeframe', 'يومي')
                signal_strength = analysis.get('signal_strength', 'متوسطة')

                scores = ranking_engine.score_signal(
                    entry=entry_price,
                    tp=take_profit,
                    sl=stop_loss,
                    close=stock_data.get("close", 0),
                    indicators=db_indicators,
                    ai_confidence=ai_confidence
                )

                # Entry Tolerance (0.3% buffer)
                ENTRY_TOLERANCE_PCT = 0.003
                actual_entry_price = close_price
                status = "PENDING"

                if signal_type == "BUY":
                    acceptable_entry_max = entry_price * (1 + ENTRY_TOLERANCE_PCT)
                    if close_price <= acceptable_entry_max:
                        status = "ACTIVE"
                elif signal_type == "SELL":
                    acceptable_entry_min = entry_price * (1 - ENTRY_TOLERANCE_PCT)
                    if close_price >= acceptable_entry_min:
                        status = "ACTIVE"

                rrr_val = round((take_profit - entry_price) / max(entry_price - stop_loss, 0.0001), 2)
                weekly_trend_str = "BEARISH" if analyzer.is_in_weekly_downtrend(stock_data) else "BULLISH"

                signal_doc = {
                    "symbol": symbol,
                    "market": market,
                    "signalType": signal_type,
                    "entryPrice": entry_price,
                    "actualEntryPrice": actual_entry_price,
                    "stopLoss": stop_loss,
                    "takeProfit": take_profit,
                    "currentPrice": close_price,
                    "maxPriceReached": close_price,
                    "status": status,
                    "isNearTP": False,
                    "indicators": db_indicators,
                    "aiConfidence": ai_confidence,
                    "aiRisk": ai_risk,
                    "explanationArabic": explanation_arabic,
                    "scoreMetrics": scores,
                    "currency": currency,
                    "timeframe": timeframe,
                    "signalStrength": signal_strength,
                    "featureSnapshot": {
                        "generationSource": "main_pipeline",
                        "quickScreenScore": screen_res.get("score"),
                        "stage2Confidence": ai_confidence,
                        "rsi": stock_data.get("rsi"),
                        "weeklyTrend": weekly_trend_str,
                        "rrr": rrr_val,
                        "shariaDebtRatio": stock_data.get("sharia_debt_ratio", 0.0),
                        "volumeAvg": stock_data.get("volume_avg", 0)
                    },
                    "createdAt": now,
                    "updatedAt": now
                }

                if status == "ACTIVE":
                    signal_doc["activatedAt"] = now

                if signal_type == 'BUY':
                    generated_buy_docs.append(signal_doc)
                    results.append({"status": "success", "symbol": symbol, "is_buy": True})
                else:
                    print(f"{symbol}: {signal_type} evaluated as candidate.")
                    results.append({"status": "success", "symbol": symbol, "is_buy": False})

            except Exception as e:
                err_msg = str(e)
                if "429" in err_msg:
                    print(f"[WARNING] Rate limit hit for {symbol}. Skipping...")
                else:
                    print(f"[ERROR] Skipping {symbol}: Details: {e}")
                results.append({"status": "failed", "symbol": symbol})
            finally:
                await asyncio.sleep(1.0)

            # Delay between batches to prevent 429 rate limit errors
            if chunk_idx < len(chunks) - 1:
                print(f"[RATE LIMIT GUARD] Cooldown delay of {CHUNK_DELAY_SEC}s between batches...")
                await asyncio.sleep(CHUNK_DELAY_SEC)

    failed_stocks = 0
    skipped_stocks = 0

    for res in results:
        if isinstance(res, Exception):
            failed_stocks += 1
            continue

        if not res or res.get("status") == "failed":
            failed_stocks += 1
        elif res.get("status") == "skipped":
            skipped_stocks += 1

    # --- STRICT FILTER & CAP: Sort by Strength/Score and Slice TOP 5 Signals Only ---
    generated_buy_docs.sort(key=lambda x: x.get("scoreMetrics", {}).get("totalScore", 0), reverse=True)
    top_5_signals = generated_buy_docs[:5]

    print(f"\n🏆 Selected Top {len(top_5_signals)} Quantitative BUY Signals out of {len(generated_buy_docs)} candidates.")

    # --- DATABASE INSERT: Only Save Top 5 Capped Signals to MongoDB ---
    inserted_ids = []
    buy_signals = len(top_5_signals)
    buy_symbols = []

    for sig_doc in top_5_signals:
        sym = sig_doc["symbol"]
        buy_symbols.append(sym)
        res = await asyncio.to_thread(
            signals_col.insert_one,
            sig_doc
        )
        inserted_id = res.inserted_id
        if inserted_id:
            inserted_ids.append(inserted_id)
        print(f"[DATABASE INSERT] Inserted new capped signal for {sym} (ID: {inserted_id})")

    # --- TELEGRAM BOT AGGREGATION: Send ONE aggregated message for Top 5 Signals ---
    if top_5_signals:
        print("[TELEGRAM AGGREGATOR] Sending Top 5 Signals in single aggregated message...")
        await asyncio.to_thread(telegram.send_top_signals_aggregated, top_5_signals)

    # 3. Post-Process: Calculate Ranks for Today's BUY Signals
    if inserted_ids:
        print("Recalculating ranks for today's BUY signals...")
        try:
            today_buys = list(signals_col.find({"_id": {"$in": inserted_ids}}))
            
            # Sort by totalScore descending
            today_buys.sort(key=lambda x: x["scoreMetrics"]["totalScore"], reverse=True)
            
            # Update each with rank
            for index, sig in enumerate(today_buys):
                rank = index + 1
                signals_col.update_one(
                    {"_id": sig["_id"]},
                    {"$set": {"scoreMetrics.rank": rank}}
                )
                print(f"Ranked {sig['symbol']}: Rank #{rank} (Score: {sig['scoreMetrics']['totalScore']})")
        except Exception as e:
            print(f"Error ranking signals: {e}")

    # Send daily summary (in thread)
    await asyncio.to_thread(telegram.send_summary, total_stocks, buy_signals, buy_symbols)

    # Send error alert only if real failures > 50%
    if total_stocks > 0 and failed_stocks > 0 and (failed_stocks / total_stocks) > 0.5:
        print("More than 50% of stocks failed. Sending error alert.")
        await asyncio.to_thread(telegram.send_error_alert, total_stocks, failed_stocks)

    # Log execution status in system logs (in thread)
    try:
        await asyncio.to_thread(
            logs_col.insert_one,
            {
                "level": "info",
                "message": f"Daily runner finished. Analyzed: {total_stocks}, BUY signals: {buy_signals}, Failed: {failed_stocks}, Skipped: {skipped_stocks}",
                "context": f"Analyzer_{market_target}",
                "createdAt": now
            }
        )
    except Exception as e:
        print(f"Error logging to MongoDB: {e}")

    print(f"Finished. Analyzed: {total_stocks}, BUY signals: {buy_signals}, Failed: {failed_stocks}, Skipped: {skipped_stocks}")

    # (Price updater and trade tracker are now run externally as separate steps in the pipeline workflow)
    # # 4. Update Old Signal Prices Daily
    # print("Running daily signal price updater...")
    # try:
    #     from price_updater import SignalPriceUpdater
    #     updater = SignalPriceUpdater()
    #     await updater.update_active_and_pending_signals()
    # except Exception as e:
    #     print(f"Error running daily signal price updater: {e}")
    # 
    # # 5. Run Trade Tracker (auto-close on TP/SL and update current PnL)
    # print("Running active portfolio trade tracker...")
    # try:
    #     from trade_tracker import AsyncTradeTracker
    #     tracker = AsyncTradeTracker()
    #     await tracker.run_tracking_cycle()
    # except Exception as e:
    #     print(f"Error running portfolio trade tracker: {e}")

    # 6. Run AI Feedback Loop (automatically after main completes on Fridays)
    if day_of_week == 4:
        print("Running AI self-assessment feedback loop...")
        try:
            from feedback_loop import AIFeedbackLoop
            loop = AIFeedbackLoop()
            count = loop.get_closed_trades_count()
            if count >= 3:
                await asyncio.sleep(10.0)  # Sleep 10s to clear rate limits
                await asyncio.to_thread(loop.run_weekly_assessment)
            else:
                print(f"Skipping feedback loop: insufficient closed trades ({count} found, need 3+)")
        except Exception as e:
            print(f"Error running AI feedback loop: {e}")
    else:
        print(f"Today is not Friday (day_of_week: {day_of_week}). Skipping AI self-assessment feedback loop.")

LOCK_FILE = "signalmind.lock"

def is_process_running(pid: int) -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        import subprocess
        try:
            output = subprocess.check_output(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                creationflags=subprocess.CREATE_NO_WINDOW
            ).decode("utf-8", errors="ignore")
            return str(pid) in output
        except Exception:
            return True
    else:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

def main():
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    import argparse
    parser = argparse.ArgumentParser(description="SignalMind Stock Analysis Engine")
    parser.add_argument("--symbols", type=str, default=None, help="Comma-separated list of symbols to analyze (e.g. AAPL,MSFT,TSLA)")
    args, _ = parser.parse_known_args()

    custom_symbols = None
    if args.symbols:
        custom_symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]

    if os.path.exists(LOCK_FILE):
        try:
            with open(LOCK_FILE, "r") as f:
                content = f.read().strip()
                if content.isdigit():
                    pid = int(content)
                    if is_process_running(pid):
                        print(f"[ERROR] Another instance of SignalMind is already running (PID: {pid}). Exiting.")
                        sys.exit(1)
                    else:
                        print(f"[INFO] Found stale lock file for PID {pid} (process not running). Overwriting...")
                else:
                    print("[INFO] Found invalid lock file. Overwriting...")
        except Exception as e:
            print(f"[WARNING] Could not read existing lock file: {e}. Overwriting...")

    # Create the lock file
    try:
        with open(LOCK_FILE, "w") as f:
            f.write(str(os.getpid()))
    except Exception as e:
        print(f"[ERROR] Could not create lock file: {e}")
        sys.exit(1)

    try:
        asyncio.run(main_async(custom_symbols=custom_symbols))
    finally:
        if os.path.exists(LOCK_FILE):
            try:
                with open(LOCK_FILE, "r") as f:
                    content = f.read().strip()
                if content.isdigit() and int(content) == os.getpid():
                    os.remove(LOCK_FILE)
            except Exception as e:
                print(f"[ERROR] Could not remove lock file: {e}")

if __name__ == "__main__":
    main()