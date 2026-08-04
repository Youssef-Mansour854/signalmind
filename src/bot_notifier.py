# src/bot_notifier.py
import asyncio
import datetime
import os
import sys
from dotenv import load_dotenv

# Ensure the src directory is in the import path
src_dir = os.path.dirname(os.path.abspath(__file__))
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

import config
from trade_tracker import AsyncTradeTracker
from telegram_sender import TelegramSender

load_dotenv()

async def run_briefer():
    print("==========================================")
    print("      SignalMind Telegram Portfolio Briefer ")
    print("==========================================")

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    today_start_utc = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)

    # Initialize Tracker to access MongoDB
    tracker = AsyncTradeTracker()
    db = tracker.db
    if db is None:
        print("[ERROR] MongoDB connection unavailable in bot_notifier. Skipping brief.")
        return
    
    bot_logs_col = db["systemlogs"]
    portfolio_col = db["user_portfolio"]

    # DST Guard & State Check
    is_scheduled = os.environ.get("GITHUB_EVENT_NAME") == "schedule"
    force_brief = os.environ.get("FORCE_BRIEF", "false").lower() in ("true", "1")

    if is_scheduled and not force_brief:
        try:
            from zoneinfo import ZoneInfo
            ny_now = datetime.datetime.now(ZoneInfo("America/New_York"))
        except Exception:
            import pytz
            ny_now = datetime.datetime.now(pytz.timezone("America/New_York"))

        ny_time_str = ny_now.strftime("%I:%M %p %Z (%Y-%m-%d)")

        from market_holidays import is_us_open
        if not is_us_open(ny_now.date()):
            print(f"[INFO] Skipped: US market closed today (Holiday/Weekend). Current NY time: {ny_time_str}.")
            return

        if ny_now.hour < 16:
            print(f"[INFO] Skipped: Daily Portfolio Brief is scheduled to run post-market close (>= 4:00 PM NY time). Current NY time: {ny_time_str}.")
            return

    # Check MongoDB: Prevent duplicate Brief sent on the same day
    if not force_brief:
        already_sent = await asyncio.to_thread(
            bot_logs_col.find_one,
            {
                "context": "daily_portfolio_brief",
                "createdAt": {"$gte": today_start_utc}
            }
        )
        if already_sent:
            print("[INFO] Daily Portfolio Brief already sent today. Skipping duplicate notification.")
            return

    # 1. Run Tracking Cycle to update prices before generating brief
    await tracker.run_tracking_cycle()

    # 2. Query MongoDB for active and recently closed trades
    active_trades = await asyncio.to_thread(
        lambda: list(portfolio_col.find({"status": "ACTIVE"}))
    )

    closed_trades_today = await asyncio.to_thread(
        lambda: list(portfolio_col.find({
            "status": {"$in": ["Hit TP", "Hit SL", "CLOSED"]},
            "closedAt": {"$gte": today_start_utc}
        }))
    )

    # 3. Format Telegram Message
    telegram = TelegramSender(config)
    
    date_str = now_utc.strftime("%Y-%m-%d")
    message = f"🔔 <b>SignalMind Daily Portfolio Brief</b>\n🗓 <b>Date:</b> {date_str} (UTC)\n\n"

    # Exits Section
    message += "🏁 <b>Today's Exits:</b>\n"
    if closed_trades_today:
        for trade in closed_trades_today:
            symbol = trade["symbol"]
            status = trade["status"]
            exit_price = trade.get("exitPrice") or trade.get("exit_price") or 0
            pnl = trade.get("pnlPercentage") or 0
            
            icon = "🟢" if "TP" in status or pnl > 0 else "🔴"
            pnl_sign = "+" if pnl > 0 else ""
            message += f"{icon} <b>{symbol}</b>: {status} at ${exit_price:.2f} ({pnl_sign}{pnl:.2f}%)\n"
    else:
        message += "<i>No exits recorded today.</i>\n"

    message += "\n"

    # Active Positions Section
    message += "💼 <b>Active Positions:</b>\n"
    if active_trades:
        for trade in active_trades:
            symbol = trade["symbol"]
            entry_price = trade.get("actualEntryPrice") or trade.get("entryPrice") or 0
            current_price = trade.get("currentPrice") or 0
            
            pnl_percent = 0
            if entry_price > 0:
                pnl_percent = ((current_price - entry_price) / entry_price) * 100
                
            pnl_sign = "+" if pnl_percent > 0 else ""
            pnl_str = f"{pnl_sign}{pnl_percent:.2f}%" if entry_price > 0 else "N/A"
            
            message += f"• <b>{symbol}</b>: Entry ${entry_price:.2f} | Current ${current_price:.2f} ({pnl_str})\n"
    else:
        message += "<i>No active positions in the portfolio.</i>\n"

    message += "\n"

    # Summary Section
    wins_today = sum(1 for t in closed_trades_today if "TP" in t["status"] or (t.get("pnlPercentage") or 0) > 0)
    losses_today = sum(1 for t in closed_trades_today if ("SL" in t["status"] and not ((t.get("pnlPercentage") or 0) > 0)) or (t["status"] == "CLOSED" and (t.get("pnlPercentage") or 0) <= 0))
    
    message += "📊 <b>Summary:</b>\n"
    message += f"• Active Positions: {len(active_trades)}\n"
    message += f"• Closed Wins Today: {wins_today}\n"
    message += f"• Closed Losses Today: {losses_today}\n\n"
    message += f"<i>{config.DISCLAIMER_TEXT}</i>"

    # 4. Send Message via Telegram & Record in MongoDB
    brief_sent = False
    if telegram.has_credentials():
        print("Sending daily portfolio brief to Telegram...")
        success = await asyncio.to_thread(telegram.send_message, message)
        if success:
            print("Telegram brief sent successfully!")
            brief_sent = True
        else:
            print("[ERROR] Failed to send Telegram portfolio brief.")
    else:
        print("[INFO] Telegram credentials not found. Portfolio Brief printed to stdout:")
        print("------------------------------------------")
        try:
            print(message)
        except UnicodeEncodeError:
            encoding = sys.stdout.encoding or 'utf-8'
            print(message.encode(encoding, errors='replace').decode(encoding))
        print("------------------------------------------")
        brief_sent = True

    if brief_sent:
        try:
            await asyncio.to_thread(
                bot_logs_col.insert_one,
                {
                    "context": "daily_portfolio_brief",
                    "level": "info",
                    "message": "Daily Portfolio Brief sent successfully",
                    "createdAt": now_utc
                }
            )
        except Exception as e:
            print(f"[WARNING] Could not record daily_portfolio_brief in MongoDB: {e}")

def main():
    asyncio.run(run_briefer())

if __name__ == "__main__":
    main()
