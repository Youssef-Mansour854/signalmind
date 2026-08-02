# src/performance_review.py
import os
import sys
import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

# Ensure root directory is in sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import config
from trade_tracker import evaluate_trade_outcome
from telegram_sender import TelegramSender

load_dotenv()

MIN_TOTAL_CLOSED_TRADES = 30
MIN_BUCKET_SAMPLE_SIZE = 10

def connect_to_mongodb():
    db_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")
    try:
        client = MongoClient(db_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        db = client.get_default_database()
        if db is None or db.name == "admin":
            db = client["signalmind"]
        return db
    except Exception as e:
        print(f"[ERROR] Performance Review: MongoDB connection error: {e}")
        return None

def run_performance_review():
    print("Starting SignalMind Weekly Performance Review & Filter Analysis...")
    db = connect_to_mongodb()
    if db is None:
        sys.exit(1)

    signals_col = db["signals"]
    portfolio_col = db["user_portfolio"]
    reviews_col = db["performance_reviews"]
    telegram = TelegramSender(config)

    # 1. Fetch closed signals (case-insensitive status regex)
    closed_signals_query = {
        "status": {"$regex": "^(hit_tp|hit_sl|expired|executed|success|failed|closed|invalidated)$", "$options": "i"}
    }
    closed_signals = list(signals_col.find(closed_signals_query))

    # Also check closed portfolio trades if any exist without signal match
    closed_portfolio_query = {
        "status": {"$regex": "^(hit_tp|hit_sl|expired|executed|success|failed|closed)$", "$options": "i"}
    }
    closed_portfolio = list(portfolio_col.find(closed_portfolio_query))

    # Combine signals and portfolio items (deduplicating by signalId)
    signal_ids_seen = set()
    combined_closed_trades = []

    for sig in closed_signals:
        sig_id_str = str(sig.get("_id"))
        signal_ids_seen.add(sig_id_str)
        # Try to attach portfolio metadata if available
        port_item = portfolio_col.find_one({"signalId": sig["_id"], "status": {"$regex": "^(hit_tp|hit_sl|expired|executed|success|failed|closed)$", "$options": "i"}})
        merged_trade = {**sig}
        if port_item:
            merged_trade.update(port_item)
        combined_closed_trades.append(merged_trade)

    for port in closed_portfolio:
        sig_id = port.get("signalId")
        if sig_id and str(sig_id) in signal_ids_seen:
            continue
        combined_closed_trades.append(port)

    total_closed = len(combined_closed_trades)

    # --- SAFETY GUARD 1: Global Minimum Sample Size Check (30 trades) ---
    if total_closed < MIN_TOTAL_CLOSED_TRADES:
        msg = f"Not enough data yet ({total_closed}/{MIN_TOTAL_CLOSED_TRADES} trades) - skipping analysis"
        print(f"[INFO] {msg}")
        return {
            "status": "skipped",
            "reason": msg,
            "total_closed": total_closed,
            "required": MIN_TOTAL_CLOSED_TRADES
        }

    print(f"[INFO] Found {total_closed} closed trades. Calculating baseline metrics...")

    # Calculate Global Baseline Metrics using unified evaluate_trade_outcome helper
    global_wins = 0
    global_gross_profit = 0.0
    global_gross_loss = 0.0

    for trade in combined_closed_trades:
        is_win, pnl = evaluate_trade_outcome(trade)
        if is_win:
            global_wins += 1
            global_gross_profit += max(0.0, pnl)
        else:
            global_gross_loss += abs(min(0.0, pnl))

    global_win_rate = (global_wins / total_closed) * 100
    global_pf = (global_gross_profit / global_gross_loss) if global_gross_loss > 0 else (999.0 if global_gross_profit > 0 else 0.0)

    # Bucketing Buckets
    buckets = {
        "rsi_30_40": [],
        "rsi_41_50": [],
        "rsi_51_60": [],
        "rsi_61_70": [],
        "screen_score_low": [],     # < 7
        "screen_score_med": [],     # 7 - 8
        "screen_score_high": [],    # 9 - 10
        "rrr_low": [],              # < 1.5
        "rrr_med": [],              # 1.5 - 2.0
        "rrr_high": [],             # > 2.0
        "ai_conf_high": [],
        "ai_conf_medium": [],
        "ai_conf_low": [],
        "weekly_bullish": [],
        "weekly_bearish": []
    }

    for trade in combined_closed_trades:
        snapshot = trade.get("featureSnapshot") or {}
        indicators = trade.get("indicators") or {}
        gen_source = snapshot.get("generationSource", "main_pipeline")

        # RSI
        rsi = snapshot.get("rsi") or indicators.get("rsi")
        if rsi is not None:
            if 30 <= rsi <= 40: buckets["rsi_30_40"].append(trade)
            elif 40 < rsi <= 50: buckets["rsi_41_50"].append(trade)
            elif 50 < rsi <= 60: buckets["rsi_51_60"].append(trade)
            elif 60 < rsi <= 70: buckets["rsi_61_70"].append(trade)

        # Quick Screen Score (Only for main_pipeline generation source)
        if gen_source == "main_pipeline":
            score = snapshot.get("quickScreenScore")
            if score is not None:
                if score < 7: buckets["screen_score_low"].append(trade)
                elif 7 <= score <= 8: buckets["screen_score_med"].append(trade)
                elif score >= 9: buckets["screen_score_high"].append(trade)

        # Stage 2 AI Confidence (Only for main_pipeline generation source)
        if gen_source == "main_pipeline":
            conf = snapshot.get("stage2Confidence") or trade.get("aiConfidence")
            if conf == "High": buckets["ai_conf_high"].append(trade)
            elif conf == "Medium": buckets["ai_conf_medium"].append(trade)
            elif conf == "Low": buckets["ai_conf_low"].append(trade)

        # RRR
        rrr = snapshot.get("rrr") or trade.get("scoreMetrics", {}).get("riskRewardRatio")
        if rrr is not None:
            if rrr < 1.5: buckets["rrr_low"].append(trade)
            elif 1.5 <= rrr <= 2.0: buckets["rrr_med"].append(trade)
            elif rrr > 2.0: buckets["rrr_high"].append(trade)

        # Weekly Trend
        trend = snapshot.get("weeklyTrend")
        if trend == "BULLISH": buckets["weekly_bullish"].append(trade)
        elif trend == "BEARISH": buckets["weekly_bearish"].append(trade)

    # Analyze Buckets with SAFETY GUARD 2: Minimum 10 trades per bucket
    recommendations = []
    bucket_stats = {}

    for bucket_name, trade_list in buckets.items():
        sample_size = len(trade_list)
        if sample_size < MIN_BUCKET_SAMPLE_SIZE:
            # Skip bucket due to small sample size
            continue

        b_wins = 0
        b_gp = 0.0
        b_gl = 0.0
        for t in trade_list:
            is_w, pnl = evaluate_trade_outcome(t)
            if is_w:
                b_wins += 1
                b_gp += max(0.0, pnl)
            else:
                b_gl += abs(min(0.0, pnl))

        b_wr = (b_wins / sample_size) * 100
        b_pf = (b_gp / b_gl) if b_gl > 0 else (999.0 if b_gp > 0 else 0.0)

        diff_wr = b_wr - global_win_rate

        bucket_stats[bucket_name] = {
            "sample_size": sample_size,
            "win_rate": round(b_wr, 2),
            "profit_factor": round(b_pf, 2),
            "diff_from_global": round(diff_wr, 2)
        }

        # Generate Sugestions based on notable statistical divergence (>= 10% difference)
        if diff_wr <= -10.0:
            recommendations.append(
                f"⚠️ فئة `{bucket_name}` أظهرت نسبة نجاح ضعيفة ({b_wr:.1f}% مقابل المتوسط العام {global_win_rate:.1f}% على عينة {sample_size} صفقة). يُقترح رفع معايير الفلترة لهذه الفئة."
            )
        elif diff_wr >= 10.0:
            recommendations.append(
                f"🌟 فئة `{bucket_name}` أظهرت أداءً ممتازاً بنسبة نجاح ({b_wr:.1f}% مقابل المتوسط العام {global_win_rate:.1f}% على عينة {sample_size} صفقة). يُفضل التركيز عليها."
            )

    report_time = datetime.datetime.now(datetime.timezone.utc)

    # Format Human-Readable Report
    report_text = f"📊 **تقرير المراجعة الدورية وتطوير الفلاتر (Suggest-Only)**\n"
    report_text += f"🗓️ التاريخ: {report_time.strftime('%Y-%m-%d')}\n"
    report_text += f"📦 إجمالي الصفقات المحللة: {total_closed}\n"
    report_text += f"🎯 نسبة النجاح العامة: {global_win_rate:.1f}%\n"
    report_text += f"📈 معامل الربحية العام (Profit Factor): {global_pf:.2f}\n\n"

    if recommendations:
        report_text += "💡 **التوصيات والاقتراحات للمراجعة البشرية:**\n"
        for rec in recommendations:
            report_text += f"- {rec}\n"
    else:
        report_text += "✅ جميع فلاتر التداول تعمل ضمن نطاقات الأداء المتوازنة حالياً. لا توجد اقتراحات لتعديل العتبات في الوقت الراهن.\n"

    report_text += "\n📌 *ملاحظة أمان:* هذا التقرير للاقتراح فقط ولا يتم تطبيق أي تعديل تلقائي على معايير `config.py` بدون مراجعة يدويّة."

    print("\n=== PERFORMANCE REVIEW REPORT ===")
    print(report_text)
    print("=================================\n")

    # Store Review in MongoDB `performance_reviews` collection
    review_doc = {
        "createdAt": report_time,
        "totalClosedTrades": total_closed,
        "globalWinRate": round(global_win_rate, 2),
        "globalProfitFactor": round(global_pf, 2),
        "bucketStats": bucket_stats,
        "recommendations": recommendations,
        "reportText": report_text
    }
    reviews_col.insert_one(review_doc)
    print("[DATABASE INSERT] Saved review report to 'performance_reviews' collection.")

    # Send Notification via Telegram
    try:
        telegram.send_message(report_text)
        print("[TELEGRAM] Sent weekly performance review report via Telegram.")
    except Exception as e:
        print(f"[WARNING] Failed to send Telegram review report: {e}")

    return {
        "status": "completed",
        "total_closed": total_closed,
        "global_win_rate": global_win_rate,
        "recommendations": recommendations
    }

if __name__ == "__main__":
    run_performance_review()
