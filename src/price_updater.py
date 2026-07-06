# src/price_updater.py
import asyncio
import datetime
import os
import yfinance as yf
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

# MongoDB connection setup
db_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")
try:
    db_client = MongoClient(db_uri, serverSelectionTimeoutMS=3000)
    db_client.admin.command('ping')
    print("[SUCCESS] price_updater: Successfully connected to MongoDB")
except Exception as e:
    print(f"\n[ERROR] price_updater: MongoDB connection error! Details: {e}\n")
    db_client = None

class SignalPriceUpdater:
    def __init__(self, db_uri=None, db_name="signalmind"):
        self.db_uri = db_uri or os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")
        self._db_client = db_client if (db_client is not None and db_uri is None) else None

    @property
    def db(self):
        if self._db_client is None:
            self._db_client = MongoClient(self.db_uri)
        try:
            return self._db_client.get_default_database() or self._db_client["signalmind"]
        except Exception:
            return self._db_client["signalmind"]

    async def update_active_and_pending_signals(self):
        print(f"[INFO] Price Updater starting - fetching latest prices before analysis...")
        print(f"[INFO] This ensures analysis uses most recent available market data")
        print("Starting daily signal price updater...")
        signals_col = self.db["signals"]
        now = datetime.datetime.now(datetime.timezone.utc)

        # Query signals with status 'Pending' or 'Active'
        query = {"status": {"$in": ["Pending", "Active"]}}
        active_signals = await asyncio.to_thread(list, signals_col.find(query))

        if not active_signals:
            print("No pending or active signals to update.")
            return

        symbols = list(set([sig["symbol"] for sig in active_signals]))
        print(f"Updating prices for {len(symbols)} signals: {symbols}")

        # Fetch current prices using yfinance
        try:
            tickers_str = " ".join(symbols)
            data = await asyncio.to_thread(
                yf.download,
                tickers_str,
                period="5d",
                group_by="ticker",
                threads=True,
                progress=False
            )
        except Exception as e:
            print(f"Error fetching live prices from yfinance for signals: {e}")
            return

        updated_count = 0
        tp_hits = 0
        sl_hits = 0
        for sig in active_signals:
            symbol = sig["symbol"]
            status = sig["status"]
            entry_price = sig.get("entryPrice", 0)
            take_profit = sig.get("takeProfit", 0)
            stop_loss = sig.get("stopLoss", 0)
            max_price_reached = sig.get("maxPriceReached", 0) or 0

            current_price = None
            high_price = None
            low_price = None

            try:
                if len(symbols) == 1:
                    current_price = data["Close"].dropna().iloc[-1]
                    high_price = data["High"].dropna().iloc[-1]
                    low_price = data["Low"].dropna().iloc[-1]
                else:
                    current_price = data[symbol]["Close"].dropna().iloc[-1]
                    high_price = data[symbol]["High"].dropna().iloc[-1]
                    low_price = data[symbol]["Low"].dropna().iloc[-1]
            except Exception as e:
                # Fallback: try fetching this ticker individually
                print(f"Batch fetch failed or empty for {symbol}, trying individual fetch...")
                try:
                    ticker_data = await asyncio.to_thread(
                        yf.download,
                        symbol,
                        period="5d",
                        progress=False
                    )
                    if not ticker_data.empty:
                        current_price = ticker_data["Close"].dropna().iloc[-1]
                        high_price = ticker_data["High"].dropna().iloc[-1]
                        low_price = ticker_data["Low"].dropna().iloc[-1]
                except Exception as inner_e:
                    print(f"Failed to extract price data for signal {symbol} in fallback: {inner_e}")

            if current_price is None or str(current_price) == 'nan':
                continue

            current_price = float(current_price)
            high_price = float(high_price) if high_price is not None and str(high_price) != 'nan' else current_price
            low_price = float(low_price) if low_price is not None and str(low_price) != 'nan' else current_price

            # Calculate and update max price reached (must happen before status transition)
            max_price_reached = max(max_price_reached, high_price)

            update_fields = {
                "currentPrice": round(current_price, 4),
                "maxPriceReached": round(max_price_reached, 4),
                "updatedAt": now
            }

            new_status = status

            # Logic for activation (Pending -> Active)
            # For BUY signal, it becomes active when current price is <= entry price
            if status == "Pending":
                created_at = sig.get("createdAt")
                created_today = False
                if created_at:
                    created_today = created_at.date() == now.date()
                
                limit_multiplier = 1.03 if created_today else 1.02
                if current_price <= entry_price * limit_multiplier:
                    new_status = "Active"
                    update_fields["status"] = "Active"
                    update_fields["activatedAt"] = now
                    print(f"[ACTIVATED] Signal {symbol} activated! Current price {current_price:.2f} <= entry {entry_price * limit_multiplier:.2f} (buffer: {limit_multiplier:.2f})")

            # Logic for target hits (Active/Pending -> Hit TP/SL)
            if new_status in ("Active", "Pending"):
                tp_hit = bool(take_profit and high_price >= take_profit)
                sl_hit = bool(stop_loss and low_price <= stop_loss)
                
                if tp_hit and sl_hit:
                    tp_margin = abs(take_profit - entry_price)
                    sl_margin = abs(entry_price - stop_loss)
                    if tp_margin < sl_margin:
                        hit_tp = True
                        hit_sl = False
                    else:
                        hit_tp = False
                        hit_sl = True
                else:
                    hit_tp = tp_hit
                    hit_sl = sl_hit

                if hit_tp:
                    exit_val = float(take_profit)
                    update_fields["status"] = "Hit TP"
                    update_fields["currentPrice"] = round(exit_val, 4)
                    update_fields["closedAt"] = now
                    if entry_price > 0:
                        update_fields["pnlPercentage"] = round(((exit_val - entry_price) / entry_price) * 100, 2)
                    print(f"[TP HIT] Signal {symbol} Hit TP! High: {high_price:.2f} >= TP {take_profit:.2f}")
                    tp_hits += 1
                elif hit_sl:
                    exit_val = float(stop_loss)
                    update_fields["status"] = "Hit SL"
                    update_fields["currentPrice"] = round(exit_val, 4)
                    update_fields["closedAt"] = now
                    if entry_price > 0:
                        update_fields["pnlPercentage"] = round(((exit_val - entry_price) / entry_price) * 100, 2)
                    print(f"[SL HIT] Signal {symbol} Hit SL! Low: {low_price:.2f} <= SL {stop_loss:.2f}")
                    sl_hits += 1

            # Update DB
            await asyncio.to_thread(signals_col.update_one, {"_id": sig["_id"]}, {"$set": update_fields})
            updated_count += 1

        print(f"Price Update Complete: {updated_count} signals updated, {tp_hits} hits TP, {sl_hits} hits SL")

async def run_price_update():
    updater = SignalPriceUpdater()
    await updater.update_active_and_pending_signals()

if __name__ == "__main__":
    import asyncio
    asyncio.run(run_price_update())
