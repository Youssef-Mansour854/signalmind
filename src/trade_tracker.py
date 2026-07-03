# src/trade_tracker.py
import asyncio
import datetime
import os
import yfinance as yf
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environmental variables
load_dotenv()

class AsyncTradeTracker:
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

    async def run_tracking_cycle(self):
        print("Starting async trade tracking cycle...")
        portfolio_col = self.db["user_portfolio"]
        signals_col = self.db["signals"]
        now = datetime.datetime.utcnow()

        # Query open positions where status is 'ACTIVE'
        query = {"status": "ACTIVE"}
        active_trades = await asyncio.to_thread(list, portfolio_col.find(query))

        if not active_trades:
            print("Checked 0 active trades. Closed 0 wins, 0 losses.")
            return

        symbols = list(set([trade["symbol"] for trade in active_trades]))
        print(f"Checking prices for {len(symbols)} active symbols: {symbols}")

        # Fetch current prices using yfinance in a separate thread
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
            print(f"Error fetching live prices from yfinance: {e}")
            return

        closed_wins = 0
        closed_losses = 0

        for trade in active_trades:
            if trade.get("status") == "CLOSED":
                continue
            symbol = trade["symbol"]
            
            # Fetch parameters from corresponding signal document
            signal_id = trade.get("signalId")
            signal_doc = None
            if signal_id:
                signal_doc = await asyncio.to_thread(signals_col.find_one, {"_id": signal_id})
                
            entry_price = trade.get("actualEntryPrice") or trade.get("entryPrice") or (signal_doc.get("entryPrice") if signal_doc else None)
            take_profit = trade.get("takeProfit") or (signal_doc.get("takeProfit") if signal_doc else None)
            stop_loss = trade.get("stopLoss") or (signal_doc.get("stopLoss") if signal_doc else None)

            try:
                if len(symbols) == 1:
                    current_price = data["Close"].dropna().iloc[-1]
                else:
                    current_price = data[symbol]["Close"].dropna().iloc[-1]
            except Exception as e:
                print(f"Failed to extract current price for {symbol}: {e}")
                continue

            if current_price is None or str(current_price) == 'nan':
                continue

            current_price = float(current_price)
            update_fields = {
                "currentPrice": round(current_price, 4),
                "updatedAt": now
            }

            # Calculate quantity and currentPnL for updating
            position_size = trade.get("positionSize", 0)
            quantity = trade.get("quantity") or (position_size / entry_price if entry_price and entry_price > 0 else 0)
            
            # Save quantity to update_fields if it's not already in the document
            if "quantity" not in trade and quantity > 0:
                update_fields["quantity"] = round(quantity, 4)

            # Exit logic checks
            if take_profit and current_price >= take_profit:
                update_fields["status"] = "Hit TP"
                update_fields["exitPrice"] = round(current_price, 4)
                update_fields["exit_price"] = round(current_price, 4)
                update_fields["closeDate"] = now
                update_fields["closedAt"] = now
                update_fields["closed_at"] = now
                update_fields["closeReason"] = "TP Hit"
                if entry_price:
                    update_fields["finalPnL"] = round((current_price - entry_price) * quantity, 4)
                    update_fields["pnlPercentage"] = round(((current_price - entry_price) / entry_price) * 100, 2)

                await asyncio.to_thread(portfolio_col.update_one, {"_id": trade["_id"]}, {"$set": update_fields})
                print(f"[TP HIT] Closed WIN for {symbol}: price ${current_price:.2f} >= TP ${take_profit}")
                closed_wins += 1

            elif stop_loss and current_price <= stop_loss:
                update_fields["status"] = "Hit SL"
                update_fields["exitPrice"] = round(current_price, 4)
                update_fields["exit_price"] = round(current_price, 4)
                update_fields["closeDate"] = now
                update_fields["closedAt"] = now
                update_fields["closed_at"] = now
                update_fields["closeReason"] = "SL Hit"
                if entry_price:
                    update_fields["finalPnL"] = round((current_price - entry_price) * quantity, 4)
                    update_fields["pnlPercentage"] = round(((current_price - entry_price) / entry_price) * 100, 2)

                await asyncio.to_thread(portfolio_col.update_one, {"_id": trade["_id"]}, {"$set": update_fields})
                print(f"[SL HIT] Closed LOSS for {symbol}: price ${current_price:.2f} <= SL ${stop_loss}")
                closed_losses += 1

            else:
                # Keep active and update current price, currentPnL, and max price reached
                update_fields["status"] = "ACTIVE"
                if entry_price:
                    update_fields["currentPnL"] = round((current_price - entry_price) * quantity, 4)
                    update_fields["pnlPercentage"] = round(((current_price - entry_price) / entry_price) * 100, 2)
                
                max_price = max(trade.get("maxPriceReached", 0) or 0, current_price)
                update_fields["maxPriceReached"] = round(max_price, 4)
                
                await asyncio.to_thread(portfolio_col.update_one, {"_id": trade["_id"]}, {"$set": update_fields})

        print(f"Checked {len(active_trades)} active trades. Closed {closed_wins} wins, {closed_losses} losses.")

async def main():
    tracker = AsyncTradeTracker()
    await tracker.run_tracking_cycle()

if __name__ == "__main__":
    asyncio.run(main())
