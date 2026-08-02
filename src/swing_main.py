import os
import sys
import asyncio
import argparse
import aiohttp
from typing import List, Dict, Any
from datetime import datetime, timezone
from pymongo import MongoClient

from src.config import US_STOCKS, EGX_STOCKS, INDICATOR_PARAMS, GROQ_MODEL, GROQ_API_KEYS
from src.stock_analyzer import StockAnalyzer
from src.swing_analyzer import SwingAnalyzer
from src.ai_analyst import GroqAnalyst
from src.ranking_engine import PythonRankingEngine
from src.sharia_filter import check_sharia_compliance
from src.telegram_sender import TelegramSender

class SwingConfig:
    STOCKS = {"US": US_STOCKS, "EGX": EGX_STOCKS}
    INDICATOR_PARAMS = INDICATOR_PARAMS
    GROQ_MODEL = GROQ_MODEL
    GROQ_FAST_MODEL = getattr(sys.modules['src.config'], 'GROQ_FAST_MODEL', 'llama-3.1-8b-instant')
    GROQ_API_KEYS = GROQ_API_KEYS
    DISCLAIMER_TEXT = getattr(sys.modules['src.config'], 'DISCLAIMER_TEXT', 'هذه التوصيات للأغراض التعليمية فقط وليست نصيحة مالية')
    TELEGRAM_BOT_TOKEN = getattr(sys.modules['src.config'], 'TELEGRAM_BOT_TOKEN', None)
    TELEGRAM_CHAT_ID = getattr(sys.modules['src.config'], 'TELEGRAM_CHAT_ID', None)

async def process_swing_market(market: str = "US", target_trade_type: str = "SWING_MONTHLY"):
    """
    Main pipeline for Weekly & Long-Term Swing Trading signals.
    - target_trade_type: "SWING_MONTHLY" or "SWING_YEAR_END"
    """
    # --- DST Time Guard for US Market Close Alignment ---
    is_scheduled = os.environ.get("GITHUB_EVENT_NAME") == "schedule"
    if is_scheduled and market == "US":
        try:
            from zoneinfo import ZoneInfo
            ny_now = datetime.now(ZoneInfo("America/New_York"))
        except Exception:
            import pytz
            ny_now = datetime.now(pytz.timezone("America/New_York"))

        ny_time_str = ny_now.strftime("%I:%M %p %Z (%Y-%m-%d)")
        is_in_close_window = (ny_now.hour == 16 and 0 <= ny_now.minute <= 50)
        if not is_in_close_window:
            print(f"[INFO] Skipped: Outside DST-adjusted US market close window (Current NY time: {ny_time_str}). Expected DST guard skip.")
            return

    print(f"\n========================================================")
    print(f"[START] STARTING SWING PIPELINE [{target_trade_type}] FOR {market} MARKET")
    print(f"========================================================\n")

    config = SwingConfig()
    stock_analyzer = StockAnalyzer(config)
    swing_analyzer = SwingAnalyzer(config)
    ai_analyst = GroqAnalyst(config)
    ranking_engine = PythonRankingEngine()
    notifier = TelegramSender(config)

    # MongoDB connection
    db_uri = os.environ.get("MONGODB_URI")
    if not db_uri:
        from dotenv import load_dotenv
        load_dotenv(r"c:\Users\mms2024\Desktop\signalmind\.env")
        db_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")

    client = MongoClient(db_uri)
    db = client.get_default_database() if client.get_default_database() is not None else client["signalmind"]
    signals_col = db["signals"]

    # Select stock universe
    symbols = SwingConfig.STOCKS.get(market, [])
    if not symbols:
        print(f"[ERROR] No stocks found for market {market}")
        return

    print(f"[INFO] Loaded {len(symbols)} stocks for analysis.")

    timeframe_label = "شهري" if target_trade_type == "SWING_MONTHLY" else "استثمار سنوي"
    candidates: List[Dict[str, Any]] = []

    for symbol in symbols:
        # 1. Deduplication Check scoped strictly by tradeType
        existing_signal = signals_col.find_one({
            "symbol": symbol,
            "tradeType": target_trade_type,
            "status": {"$regex": "^(active|pending)$", "$options": "i"}
        })

        if existing_signal:
            print(f"[SKIP] {symbol}: Active/Pending {target_trade_type} signal already exists.")
            continue

        # 2. Fetch daily stock data
        try:
            df_daily = stock_analyzer.fetch_data(symbol)
            if df_daily is None or len(df_daily) < 30:
                print(f"[SKIP] {symbol}: Insufficient historical data.")
                continue
        except Exception as e:
            print(f"[ERROR] Fetching data for {symbol}: {e}")
            continue

        # 3. Calculate weekly swing indicators
        swing_data = swing_analyzer.get_latest_swing_data(df_daily, symbol)
        if not swing_data:
            print(f"[SKIP] {symbol}: Failed to calculate weekly indicators.")
            continue

        swing_data['market'] = market

        # 4. Sharia Compliance Check (US stocks)
        if market == 'US':
            try:
                is_compliant, reason = check_sharia_compliance(symbol, db)
                if not is_compliant:
                    print(f"[SKIP] {symbol}: Non-compliant with Sharia financial thresholds ({reason}).")
                    continue
            except Exception as e:
                print(f"[WARNING] Sharia check error for {symbol}: {e}")

        # 5. Swing Screening Heuristics differentiated by tradeType
        weekly_rsi = swing_data.get('weekly_rsi', 50)
        close = swing_data.get('close', 0)
        support_6m = swing_data.get('support_6m', 0)
        sma_20 = swing_data.get('weekly_sma_20')
        sma_50 = swing_data.get('weekly_sma_50')
        sma_200 = swing_data.get('weekly_sma_200')

        if target_trade_type == "SWING_MONTHLY":
            # Medium-term weekly swing: RSI < 65, Price > 6M Support, Price > Weekly SMA20 (or SMA50)
            if weekly_rsi >= 65 or close <= support_6m:
                print(f"[SKIP] {symbol}: Failed MONTHLY screening (RSI: {weekly_rsi:.1f}, Close: {close}, 6M Sup: {support_6m})")
                continue
            if sma_20 and close < sma_20:
                print(f"[SKIP] {symbol}: Failed MONTHLY screening (Close {close:.2f} < Weekly SMA20 {sma_20:.2f})")
                continue
        else:
            # SWING_YEAR_END (Annual Investment): Multi-year structural trend (Price > SMA200/SMA50 & RSI < 58 for value accumulation)
            if weekly_rsi >= 58 or close <= support_6m:
                print(f"[SKIP] {symbol}: Failed YEAR_END screening (RSI: {weekly_rsi:.1f} >= 58 or Close <= 6M Sup)")
                continue
            if sma_200 and close < sma_200:
                print(f"[SKIP] {symbol}: Failed YEAR_END screening (Close {close:.2f} < Weekly SMA200 {sma_200:.2f})")
                continue

        # Validate quantitative levels
        is_valid, val_reason = swing_analyzer.validate_swing_levels(
            swing_data['entry_price'], swing_data['stop_loss'], swing_data['take_profit'], swing_data['resistance_6m']
        )
        if not is_valid:
            print(f"[SKIP] {symbol}: Invalid swing levels -> {val_reason}")
            continue

        candidates.append(swing_data)

    print(f"\n[INFO] {len(candidates)} candidate stocks passed quantitative weekly screening.")

    if not candidates:
        print("[INFO] No candidates passed screening. Pipeline finished.")
        return

    # 6. Stage 2 AI Analysis
    analyzed_signals: List[Dict[str, Any]] = []
    async with aiohttp.ClientSession() as session:
        for cand in candidates:
            try:
                ai_res = await ai_analyst.analyze_swing(cand, session, target_trade_type=target_trade_type)
                if not ai_res or ai_res.get('signal') != 'BUY':
                    print(f"[SKIP] {cand['symbol']}: AI decision was {ai_res.get('signal') if ai_res else 'None'}")
                    continue

                cand.update(ai_res)
                analyzed_signals.append(cand)
            except Exception as e:
                print(f"[ERROR] Stage 2 AI analysis for {cand['symbol']}: {e}")

    print(f"\n[INFO] {len(analyzed_signals)} BUY swing signals generated by AI.")

    if not analyzed_signals:
        print("[INFO] No BUY signals approved by AI. Pipeline finished.")
        return

    # 7. Score and rank signals using PythonRankingEngine
    for cand in analyzed_signals:
        indicators = {
            "rsi": cand.get("weekly_rsi"),
            "macdLine": cand.get("weekly_macd_line"),
            "macdSignal": cand.get("weekly_macd_signal"),
            "support": cand.get("support_6m"),
            "resistance": cand.get("resistance_6m")
        }
        scores = ranking_engine.score_signal(
            entry=cand["entry_price"],
            tp=cand["take_profit"],
            sl=cand["stop_loss"],
            close=cand["close"],
            indicators=indicators,
            ai_confidence=cand.get("confidence", "High")
        )
        cand["scoreMetrics"] = scores

    ranked_signals = sorted(analyzed_signals, key=lambda x: x["scoreMetrics"]["totalScore"], reverse=True)[:5]
    for idx, s in enumerate(ranked_signals, start=1):
        s["scoreMetrics"]["rank"] = idx

    # 8. Save signals to MongoDB
    now_utc = datetime.now(timezone.utc)
    for signal_item in ranked_signals:
        # Build feature snapshot for future optimization reviews
        feature_snapshot = {
            "quickScreenScore": 8,
            "stage2Confidence": signal_item.get("aiConfidenceScore", 80),
            "rsi": signal_item.get("weekly_rsi", 50),
            "weeklyTrendStatus": "bullish" if signal_item.get("close", 0) > signal_item.get("weekly_sma_50", 0) else "neutral",
            "calculatedRRR": round((signal_item["take_profit"] - signal_item["entry_price"]) / max(0.01, signal_item["entry_price"] - signal_item["stop_loss"]), 2),
            "shariaDebtRatio": signal_item.get("sharia_details", {}).get("debt_ratio", 0),
            "shariaCashRatio": signal_item.get("sharia_details", {}).get("cash_ratio", 0),
            "generationSource": "swing_pipeline",
            "createdAt": now_utc
        }

        signal_doc = {
            "symbol": signal_item["symbol"],
            "market": market,
            "tradeType": target_trade_type,
            "signalType": "BUY",
            "entryPrice": signal_item["entry_price"],
            "actualEntryPrice": signal_item["entry_price"],
            "stopLoss": signal_item["stop_loss"],
            "takeProfit": signal_item["take_profit"],
            "currentPrice": signal_item["close"],
            "maxPriceReached": signal_item["close"],
            "status": "ACTIVE",
            "timeframe": timeframe_label,
            "signalStrength": signal_item.get("signal_strength", "قوية"),
            "explanationArabic": signal_item.get("explanation_arabic", signal_item.get("reasoning_ar", "")),
            "featureSnapshot": feature_snapshot,
            "scoreMetrics": signal_item.get("scoreMetrics", {
                "riskRewardRatio": feature_snapshot["calculatedRRR"],
                "confluenceScore": 85,
                "aiConfidenceScore": 85,
                "totalScore": 85,
                "rank": 1
            }),
            "createdAt": now_utc,
            "updatedAt": now_utc
        }

        inserted = signals_col.insert_one(signal_doc)
        signal_doc["_id"] = str(inserted.inserted_id)
        print(f"[SUCCESS] Saved [{target_trade_type}] signal for {signal_doc['symbol']} (ID: {inserted.inserted_id})")

    # Send aggregated Telegram notification for Top Signals
    try:
        if notifier.has_credentials():
            notifier.send_top_signals_aggregated(ranked_signals[:5], trade_type=target_trade_type)
    except Exception as te:
        print(f"[WARNING] Failed to send Telegram notification: {te}")

    print(f"\n========================================================")
    print(f"[OK] PIPELINE COMPLETE: Processed {len(ranked_signals)} [{target_trade_type}] signals.")
    print(f"========================================================\n")

def main():
    parser = argparse.ArgumentParser(description="SignalMind Swing Trading Pipeline")
    parser.add_argument("--market", type=str, default="US", choices=["US", "EGX"], help="Target market")
    parser.add_argument("--trade_type", type=str, default="SWING_MONTHLY", choices=["SWING_MONTHLY", "SWING_YEAR_END"], help="Swing trade duration type")
    args = parser.parse_args()

    asyncio.run(process_swing_market(market=args.market, target_trade_type=args.trade_type))

if __name__ == "__main__":
    main()
