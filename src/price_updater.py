# src/price_updater.py
import asyncio
import datetime
import os
import yfinance as yf
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

class SignalPriceUpdater:
    def __init__(self, db_uri=None, db_name="signalmind"):
        self.db_uri = db_uri or os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")
        self._db_client = None

    @property
    def db(self):
        if self._db_client is None:
            self._db_client = MongoClient(self.db_uri)
        try:
            return self._db_client.get_default_database() or self._db_client["signalmind"]
        except Exception:
            return self._db_client["signalmind"]

    async def update_active_and_pending_signals(self):
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
        for sig in active_signals:
            symbol = sig["symbol"]
            status = sig["status"]
            entry_price = sig.get("entryPrice", 0)
            take_profit = sig.get("takeProfit", 0)
            stop_loss = sig.get("stopLoss", 0)
            max_price_reached = sig.get("maxPriceReached", 0) or 0

            try:
                if len(symbols) == 1:
                    current_price = data["Close"].dropna().iloc[-1]
                else:
                    current_price = data[symbol]["Close"].dropna().iloc[-1]
            except Exception as e:
                print(f"Failed to extract current price for signal {symbol}: {e}")
                continue

            if current_price is None or str(current_price) == 'nan':
                continue

            current_price = float(current_price)
            update_fields = {
                "currentPrice": round(current_price, 4),
                "updatedAt": now
            }

            new_status = status

            # Logic for activation (Pending -> Active)
            # For BUY signal, it becomes active when current price is <= entry price
            if status == "Pending":
                if current_price <= entry_price:
                    new_status = "Active"
                    update_fields["status"] = "Active"
                    update_fields["activatedAt"] = now
                    print(f"[ACTIVATED] Signal {symbol} activated! Current price {current_price:.2f} <= entry {entry_price:.2f}")

            # Logic for target hits (Active/Pending -> Hit TP/SL)
            if new_status in ("Active", "Pending"):
                if take_profit and current_price >= take_profit:
                    update_fields["status"] = "Hit TP"
                    update_fields["closedAt"] = now
                    if entry_price > 0:
                        update_fields["pnlPercentage"] = round(((current_price - entry_price) / entry_price) * 100, 2)
                    print(f"[TP HIT] Signal {symbol} Hit TP! price {current_price:.2f} >= TP {take_profit:.2f}")
                elif stop_loss and current_price <= stop_loss:
                    update_fields["status"] = "Hit SL"
                    update_fields["closedAt"] = now
                    if entry_price > 0:
                        update_fields["pnlPercentage"] = round(((current_price - entry_price) / entry_price) * 100, 2)
                    print(f"[SL HIT] Signal {symbol} Hit SL! price {current_price:.2f} <= SL {stop_loss:.2f}")
                else:
                    # Update max price reached
                    update_fields["maxPriceReached"] = round(max(max_price_reached, current_price), 4)

            # Update DB
            await asyncio.to_thread(signals_col.update_one, {"_id": sig["_id"]}, {"$set": update_fields})
            updated_count += 1

        print(f"Successfully updated {updated_count} signals.")

async def main():
    updater = SignalPriceUpdater()
    await updater.update_active_and_pending_signals()

if __name__ == "__main__":
    asyncio.run(main())
