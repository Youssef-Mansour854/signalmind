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

# Load env variables at startup
load_dotenv()

async def main_async():
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

    # Prevent duplicate runs on the same day (UTC date)
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
        #if existing_run:
            #print("Already ran today, skipping")
            #return
    except Exception as e:
        print(f"[WARNING] Error checking for duplicate run: {e}")

    today_date = date.today()

    stocks_to_analyze = []

    if market_target == "US":
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

    print(f"Planning to analyze {total_stocks} stocks sequentially...")

    results = []
    async with aiohttp.ClientSession() as session:
        for i, symbol in enumerate(stocks_to_analyze):
            index = i + 1
            print(f"[{index}/{total_stocks}] Analyzing {symbol}...")

            # 1. Strict Variable Reset
            current_price = None
            entry_price = None
            stop_loss = None
            take_profit = None
            ai_analysis_result = None
            signal_type = None
            currency = None
            signal_strength = None
            
            # Extra variables to prevent any possible leakage
            stock_data = None
            analysis = None
            db_indicators = None
            scores = None
            status = None
            signal_doc = None
            market = None

            # 2. yfinance Validation & Fallback inside try...except block
            try:
                # Determine market and currency
                market = "EGX" if symbol.endswith(".CA") else "US"
                currency = "EGP" if market == "EGX" else "USD"

                # Fetch stock data using analyzer
                df_raw = await asyncio.to_thread(analyzer.fetch_data, symbol)
                
                # Check if data is empty (rate limits or invalid symbol)
                if df_raw is None or df_raw.empty:
                    print(f"[ERROR] Skipping {symbol}: No data or error occurred.")
                    results.append({"status": "failed", "symbol": symbol})
                    continue

                # Calculate indicators
                df_indicators = await asyncio.to_thread(analyzer.calculate_indicators, df_raw)
                
                # Extract latest state of indicators
                stock_data = analyzer.get_latest_data(df_indicators)
                stock_data['symbol'] = symbol

                # Macro trend filter
                if analyzer.is_in_macro_downtrend(stock_data):
                    print(f"Skipped {symbol}: In a macro downtrend.")
                    results.append({"status": "skipped", "symbol": symbol})
                    continue

                # 3. Get AI Analysis
                retries = 3
                for attempt in range(retries):
                    try:
                        async with groq_lock:
                            analysis = await groq.analyze(stock_data, session)
                            # Pacing inside lock to avoid rate limits
                            await asyncio.sleep(4.0)
                        break
                    except Exception as inner_e:
                        if "429" in str(inner_e) and attempt < retries - 1:
                            print(f"[INFO] Groq 429 rate limit hit for {symbol}. Cooling down for 15.0s inside lock...")
                            await asyncio.sleep(15.0)
                            print(f"[INFO] Retrying {symbol} (attempt {attempt+2}/{retries})...")
                        else:
                            raise inner_e

                if not analysis:
                    print(f"Failed to get AI analysis for {symbol}.")
                    results.append({"status": "failed", "symbol": symbol})
                    continue

                # Server-side validation for realistic entry price
                if 'entry_price' in analysis:
                    try:
                        ai_entry = float(analysis['entry_price'])
                    except (TypeError, ValueError):
                        ai_entry = 0
                    close_price = float(stock_data.get('close', 0))
                    if ai_entry >= close_price * 0.99:
                        entry_price_val = round(close_price * 0.985, 2)
                        analysis['entry_price'] = entry_price_val
                        
                        try:
                            ai_sl = float(analysis.get('stop_loss', 0))
                        except (TypeError, ValueError):
                            ai_sl = 0
                        if ai_sl >= entry_price_val:
                            ai_sl = round(entry_price_val * 0.96, 2)
                            analysis['stop_loss'] = ai_sl
                            
                        try:
                            ai_tp = float(analysis.get('take_profit', 0))
                        except (TypeError, ValueError):
                            ai_tp = 0
                        if ai_tp <= entry_price_val:
                            risk = entry_price_val - ai_sl
                            analysis['take_profit'] = round(entry_price_val + (risk * 1.5), 2)

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
                ai_analysis_result = analysis

                # Score the signal using the ranking engine
                scores = ranking_engine.score_signal(
                    entry=entry_price,
                    tp=take_profit,
                    sl=stop_loss,
                    close=stock_data.get("close", 0),
                    indicators=db_indicators,
                    ai_confidence=ai_confidence
                )

                # Determine status and initial activation
                status = "Expired"
                if signal_type == "BUY":
                    current_price = float(stock_data.get("close", 0))
                    if current_price <= entry_price * 1.03:
                        status = "Active"
                    else:
                        status = "Pending"

                # DB Document
                signal_doc = {
                    "symbol": symbol,
                    "market": market,
                    "signalType": signal_type,
                    "entryPrice": entry_price,
                    "stopLoss": stop_loss,
                    "takeProfit": take_profit,
                    "currentPrice": float(stock_data.get("close", 0)),
                    "maxPriceReached": float(stock_data.get("close", 0)),
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
                    "createdAt": now,
                    "updatedAt": now
                }

                if status == "Active":
                    signal_doc["activatedAt"] = now

                # Save to MongoDB via Upsert based on symbol
                res = await asyncio.to_thread(
                    signals_col.update_one,
                    {"symbol": symbol},
                    {"$set": signal_doc},
                    upsert=True
                )
                upserted_id = res.upserted_id
                if not upserted_id:
                    existing_doc = await asyncio.to_thread(signals_col.find_one, {"symbol": symbol}, {"_id": 1})
                    inserted_id = existing_doc["_id"] if existing_doc else None
                else:
                    inserted_id = upserted_id
                
                if signal_type == 'BUY':
                    # Send Telegram alert for BUY signals
                    message = telegram.format_message(stock_data, analysis)
                    success = await asyncio.to_thread(telegram.send_message, message)
                    if not success:
                        print(f"Failed to send Telegram message for {symbol}.")
                    else:
                        print(f"BUY signal sent to Telegram for {symbol}.")
                    results.append({"status": "success", "symbol": symbol, "is_buy": True, "inserted_id": inserted_id})
                else:
                    print(f"{symbol}: {signal_type} - saved to DB (skipped Telegram).")
                    results.append({"status": "success", "symbol": symbol, "is_buy": False})

            except Exception as e:
                err_msg = str(e)
                if "429" in err_msg:
                    print(f"[WARNING] Groq rate limit hit for {symbol}. Skipping...")
                else:
                    print(f"[ERROR] Skipping {symbol}: No data or error occurred. Details: {e}")
                results.append({"status": "failed", "symbol": symbol})
                continue
            
            finally:
                # Anti-Ban Delay (Rate Limiting) to prevent blocking IP
                await asyncio.sleep(1.5)

    failed_stocks = 0
    skipped_stocks = 0
    buy_signals = 0
    buy_symbols = []
    inserted_ids = []

    for res in results:
        if isinstance(res, Exception):
            failed_stocks += 1
            print(f"Task generated an unhandled exception: {res}")
            continue

        if not res or res.get("status") == "failed":
            failed_stocks += 1
        elif res.get("status") == "skipped":
            skipped_stocks += 1
        elif res.get("status") == "success":
            if res.get("is_buy"):
                buy_signals += 1
                buy_symbols.append(res.get("symbol"))
                inserted_ids.append(res.get("inserted_id"))

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
        asyncio.run(main_async())
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