# src/main.py
import config
from stock_analyzer import StockAnalyzer
from ai_analyst import GroqAnalyst
from telegram_sender import TelegramSender
from ranking_engine import PythonRankingEngine
import sys
import time
import datetime
import os
from pymongo import MongoClient
from dotenv import load_dotenv
import asyncio
import aiohttp

# Load env variables at startup
load_dotenv()

async def process_single_stock(symbol: str, index: int, total_stocks: int, session: aiohttp.ClientSession, analyzer, groq, telegram, ranking_engine, signals_col, now, groq_lock=None):
    print(f"[{index}/{total_stocks}] Analyzing {symbol}...")
    try:
        # Determine market
        market = "EGX" if symbol.endswith(".CA") else "US"

        # 1. Fetch & Analyze Data (run in thread to prevent blocking event loop)
        try:
            stock_data = await asyncio.to_thread(analyzer.analyze_stock, symbol)
        except Exception as e:
            print(f"Failed to fetch or analyze data for {symbol}: {e}")
            return {"status": "failed", "symbol": symbol}

        if stock_data is None:
            print(f"Skipped {symbol}: In a macro downtrend.")
            return {"status": "skipped", "symbol": symbol}

        # 2. Get AI Analysis
        analysis = None
        retries = 3
        for attempt in range(retries):
            try:
                if groq_lock:
                    async with groq_lock:
                        try:
                            analysis = await groq.analyze(stock_data, session)
                            await asyncio.sleep(4.0)
                        except Exception as inner_e:
                            if "429" in str(inner_e):
                                print(f"[INFO] Groq 429 rate limit hit for {symbol}. Cooling down for 15.0s inside lock...")
                                await asyncio.sleep(15.0)
                            raise inner_e
                else:
                    analysis = await groq.analyze(stock_data, session)
                    await asyncio.sleep(4.0)
                break
            except Exception as e:
                if "429" in str(e) and attempt < retries - 1:
                    print(f"[INFO] Retrying {symbol} (attempt {attempt+1}/{retries})...")
                else:
                    raise e
        
        if not analysis:
            print(f"Failed to get AI analysis for {symbol}.")
            return {"status": "failed", "symbol": symbol}

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

        # Score the signal using the ranking engine
        scores = ranking_engine.score_signal(
            entry=entry_price,
            tp=take_profit,
            sl=stop_loss,
            close=stock_data.get("close", 0),
            indicators=db_indicators,
            ai_confidence=ai_confidence
        )

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
            "status": "Pending" if signal_type == "BUY" else "Expired",
            "isNearTP": False,
            "indicators": db_indicators,
            "aiConfidence": ai_confidence,
            "aiRisk": ai_risk,
            "explanationArabic": explanation_arabic,
            "scoreMetrics": scores,
            "createdAt": now,
            "updatedAt": now
        }

        # Save to MongoDB via Upsert based on symbol (run in thread)
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
            # Send Telegram alert for BUY signals (run in thread)
            message = telegram.format_message(stock_data, analysis)
            success = await asyncio.to_thread(telegram.send_message, message)
            if not success:
                print(f"Failed to send Telegram message for {symbol}.")
            else:
                print(f"BUY signal sent to Telegram for {symbol}.")
            return {"status": "success", "symbol": symbol, "is_buy": True, "inserted_id": inserted_id}
        else:
            print(f"{symbol}: {signal_type} - saved to DB (skipped Telegram).")
            return {"status": "success", "symbol": symbol, "is_buy": False}

    except Exception as e:
        err_msg = str(e)
        if "429" in err_msg:
            print(f"[WARNING] Groq rate limit hit for {symbol}. Skipping...")
        else:
            print(f"Unexpected error processing {symbol}: {e}")
        return {"status": "failed", "symbol": symbol}

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
    day_of_week = now.weekday() # Monday=0, ..., Sunday=6

    # EGX Market is open Sunday-Thursday
    # US Market is open Monday-Friday
    # Sunday (6): only EGX stocks
    # Monday-Thursday (0, 1, 2, 3): both EGX and US stocks
    # Friday (4): only US stocks
    # Saturday (5): closed (no stocks to analyze today)
    egx_open = day_of_week in (6, 0, 1, 2, 3)
    us_open = day_of_week in (0, 1, 2, 3, 4)

    if not egx_open and not us_open:
        print("[INFO] All markets are closed today. Skipping execution.")
        return

    all_stocks = config.US_STOCKS + config.EGX_STOCKS
    stocks_to_analyze = []
    for symbol in all_stocks:
        is_egx = symbol.endswith(".CA")
        if is_egx and not egx_open:
            continue
        if not is_egx and not us_open:
            continue
        stocks_to_analyze.append(symbol)

    if not stocks_to_analyze:
        print("[INFO] No stocks to analyze for the open markets today.")
        return

    total_stocks = len(stocks_to_analyze)
    # Concurrency limiter
    semaphore = asyncio.Semaphore(1)
    groq_lock = asyncio.Lock()

    print(f"Planning to analyze {total_stocks} stocks sequentially...")
    
    async def worker(symbol, index, session):
        async with semaphore:
            return await process_single_stock(
                symbol=symbol,
                index=index,
                total_stocks=total_stocks,
                session=session,
                analyzer=analyzer,
                groq=groq,
                telegram=telegram,
                ranking_engine=ranking_engine,
                signals_col=signals_col,
                now=now,
                groq_lock=groq_lock
            )

    results = []
    async with aiohttp.ClientSession() as session:
        tasks = []
        for i, symbol in enumerate(stocks_to_analyze):
            # Sleep 2.0s between spawning tasks to pace requests
            if i > 0:
                await asyncio.sleep(2.0)
            task = asyncio.create_task(worker(symbol, i + 1, session))
            tasks.append(task)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)

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
                "context": "Analyzer",
                "createdAt": now
            }
        )
    except Exception as e:
        print(f"Error logging to MongoDB: {e}")

    print(f"Finished. Analyzed: {total_stocks}, BUY signals: {buy_signals}, Failed: {failed_stocks}, Skipped: {skipped_stocks}")

    # 4. Update Old Signal Prices Daily
    print("Running daily signal price updater...")
    try:
        from price_updater import SignalPriceUpdater
        updater = SignalPriceUpdater()
        await updater.update_active_and_pending_signals()
    except Exception as e:
        print(f"Error running daily signal price updater: {e}")

    # 5. Run Trade Tracker (auto-close on TP/SL and update current PnL)
    print("Running active portfolio trade tracker...")
    try:
        from trade_tracker import AsyncTradeTracker
        tracker = AsyncTradeTracker()
        await tracker.run_tracking_cycle()
    except Exception as e:
        print(f"Error running portfolio trade tracker: {e}")

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