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

    # 1. Initialize Tracker & Run Tracking Cycle
    tracker = AsyncTradeTracker()
    await tracker.run_tracking_cycle()

    # 2. Query MongoDB for active and recently closed trades
    db = tracker.db
    portfolio_col = db["user_portfolio"]
    
    # Calculate start of today (UTC)
    now = datetime.datetime.now(datetime.timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Fetch active trades
    active_trades = await asyncio.to_thread(
        lambda: list(portfolio_col.find({"status": "ACTIVE"}))
    )

    # Fetch trades closed today
    closed_trades_today = await asyncio.to_thread(
        lambda: list(portfolio_col.find({
            "status": {"$in": ["Hit TP", "Hit SL", "CLOSED"]},
            "closedAt": {"$gte": today_start}
        }))
    )

    # 3. Format Telegram Message
    telegram = TelegramSender(config)
    
    # Message header
    date_str = now.strftime("%Y-%m-%d")
    message = f"🔔 <b>SignalMind Daily Portfolio Brief</b>\n🗓 <b>Date:</b> {date_str} (UTC)\n\n"

    # Exits Section
    message += "🏁 <b>Today's Exits:</b>\n"
    if closed_trades_today:
        for trade in closed_trades_today:
            symbol = trade["symbol"]
            status = trade["status"]
            exit_price = trade.get("exitPrice") or trade.get("exit_price") or 0
            pnl = trade.get("pnlPercentage") or 0
            
            icon = "🟢" if "TP" in status or (status == "CLOSED" and pnl > 0) else "🔴"
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
            
            # Calculate current PnL if we have entry and current prices
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
    wins_today = sum(1 for t in closed_trades_today if "TP" in t["status"] or (t["status"] == "CLOSED" and (t.get("pnlPercentage") or 0) > 0))
    losses_today = sum(1 for t in closed_trades_today if "SL" in t["status"] or (t["status"] == "CLOSED" and (t.get("pnlPercentage") or 0) <= 0))
    
    message += "📊 <b>Summary:</b>\n"
    message += f"• Active Positions: {len(active_trades)}\n"
    message += f"• Closed Wins Today: {wins_today}\n"
    message += f"• Closed Losses Today: {losses_today}\n\n"
    message += f"<i>{config.DISCLAIMER_TEXT}</i>"

    # 4. Send Message via Telegram
    if telegram.has_credentials():
        print("Sending daily portfolio brief to Telegram...")
        success = await asyncio.to_thread(telegram.send_message, message)
        if success:
            print("Telegram brief sent successfully!")
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

def main():
    asyncio.run(run_briefer())

if __name__ == "__main__":
    main()
