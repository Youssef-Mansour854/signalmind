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

async def process_single_stock(symbol: str, index: int, total_stocks: int, session: aiohttp.ClientSession, analyzer, groq, telegram, ranking_engine, signals_col, now):
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
        analysis = await groq.analyze(stock_data, session)
        
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

    # EGX Market (.CA): Friday (4) and Saturday (5)
    # US Market: Saturday (5) and Sunday (6)
    egx_open = day_of_week not in (4, 5)
    us_open = day_of_week not in (5, 6)

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

    print(f"Planning to analyze {total_stocks} stocks sequentially...")
    
    results = []
    async with aiohttp.ClientSession() as session:
        for i, symbol in enumerate(stocks_to_analyze):
            async with semaphore:
                res = await process_single_stock(
                    symbol=symbol,
                    index=i+1,
                    total_stocks=total_stocks,
                    session=session,
                    analyzer=analyzer,
                    groq=groq,
                    telegram=telegram,
                    ranking_engine=ranking_engine,
                    signals_col=signals_col,
                    now=now
                )
            results.append(res)
            # Sleep 15.0s to pace requests under Groq's limits, except for the last stock
            if i < total_stocks - 1:
                await asyncio.sleep(15.0)

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

def main():
    asyncio.run(main_async())

if __name__ == "__main__":
    main()