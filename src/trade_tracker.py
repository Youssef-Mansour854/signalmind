# src/trade_tracker.py
import asyncio
import datetime
import os
import yfinance as yf
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environmental variables
load_dotenv()

import time

def connect_to_mongodb_with_retry(db_uri: str, max_retries: int = 3, initial_delay: float = 2.0):
    """Connects to MongoDB with automatic retries and exponential backoff on DNS/network failure."""
    delay = initial_delay
    for attempt in range(1, max_retries + 1):
        try:
            client = MongoClient(
                db_uri,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                socketTimeoutMS=10000
            )
            client.admin.command('ping')
            print(f"[SUCCESS] trade_tracker: Connected to MongoDB (attempt {attempt}/{max_retries})")
            return client
        except Exception as e:
            print(f"[WARNING] trade_tracker: MongoDB connection attempt {attempt}/{max_retries} failed: {e}")
            if attempt < max_retries:
                time.sleep(delay)
                delay *= 2
            else:
                print(f"[ERROR] trade_tracker: Failed to connect to MongoDB after {max_retries} attempts: {e}")
                return None

# Initial MongoDB connection setup
db_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")
db_client = connect_to_mongodb_with_retry(db_uri)

class AsyncTradeTracker:
    def __init__(self, db_uri=None, db_name="signalmind"):
        self.db_uri = db_uri or os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")
        self._db_client = db_client if (db_client is not None and db_uri is None) else None

    @property
    def db(self):
        if self._db_client is None:
            self._db_client = connect_to_mongodb_with_retry(self.db_uri)
        if self._db_client is None:
            return None
        try:
            return self._db_client.get_default_database() or self._db_client["signalmind"]
        except Exception:
            return self._db_client["signalmind"]

    async def run_tracking_cycle(self):
        print("Starting async trade tracking cycle...")
        database = self.db
        if database is None:
            print("[ERROR] MongoDB connection unavailable in trade_tracker. Skipping tracking cycle.")
            return
        portfolio_col = database["user_portfolio"]
        signals_col = database["signals"]
        now = datetime.datetime.now(datetime.timezone.utc)

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
            
            # Reset variables to prevent any possible price bleed from previous iterations
            current_price = None
            high_price = None
            low_price = None
            
            # Fetch parameters from corresponding signal document
            signal_id = trade.get("signalId")
            signal_doc = None
            if signal_id:
                signal_doc = await asyncio.to_thread(signals_col.find_one, {"_id": signal_id})
            
            if not signal_doc:
                # Fallback: Fetch latest Active or Pending signal for this symbol
                signal_doc = await asyncio.to_thread(
                    signals_col.find_one,
                    {
                        "symbol": symbol,
                        "status": {"$in": ["Active", "ACTIVE", "Pending", "pending"]}
                    },
                    sort=[("createdAt", -1)]
                )
                
            entry_price = trade.get("actualEntryPrice") or trade.get("entryPrice") or (signal_doc.get("entryPrice") if signal_doc else None)
            take_profit = trade.get("takeProfit") or (signal_doc.get("takeProfit") if signal_doc else None)
            stop_loss = trade.get("stopLoss") or (signal_doc.get("stopLoss") if signal_doc else None)

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
                print(f"Failed to extract price data for {symbol}: {e}")
                continue

            if current_price is None or str(current_price) == 'nan':
                continue

            current_price = float(current_price)
            high_price = float(high_price) if high_price is not None and str(high_price) != 'nan' else current_price
            low_price = float(low_price) if low_price is not None and str(low_price) != 'nan' else current_price

            # Calculate and update max price reached (must happen before status transition)
            current_max_price = trade.get("maxPriceReached", 0) or 0
            max_price = max(current_max_price, high_price)

            update_fields = {
                "currentPrice": round(current_price, 4),
                "maxPriceReached": round(max_price, 4),
                "updatedAt": now
            }

            # Calculate quantity and currentPnL for updating
            position_size = trade.get("positionSize", 0)
            quantity = trade.get("quantity") or (position_size / entry_price if entry_price and entry_price > 0 else 0)
            
            # Save quantity to update_fields if it's not already in the document
            if "quantity" not in trade and quantity > 0:
                update_fields["quantity"] = round(quantity, 4)

            # Exit logic checks
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
                update_fields["exitPrice"] = round(exit_val, 4)
                update_fields["exit_price"] = round(exit_val, 4)
                update_fields["closeDate"] = now
                update_fields["closedAt"] = now
                update_fields["closed_at"] = now
                update_fields["closeReason"] = "TP Hit"
                if entry_price:
                    update_fields["finalPnL"] = round((exit_val - entry_price) * quantity, 4)
                    update_fields["pnlPercentage"] = round(((exit_val - entry_price) / entry_price) * 100, 2)

                await asyncio.to_thread(portfolio_col.update_one, {"_id": trade["_id"]}, {"$set": update_fields})
                print(f"[TP HIT] Closed WIN for {symbol}: exit ${exit_val:.2f} >= TP ${take_profit}")
                closed_wins += 1

            elif hit_sl:
                exit_val = float(stop_loss)
                is_profitable = bool(entry_price and exit_val > entry_price)
                update_fields["status"] = "Hit TP" if is_profitable else "Hit SL"
                update_fields["exitPrice"] = round(exit_val, 4)
                update_fields["exit_price"] = round(exit_val, 4)
                update_fields["closeDate"] = now
                update_fields["closedAt"] = now
                update_fields["closed_at"] = now
                update_fields["closeReason"] = "TP Hit (BE)" if is_profitable else "SL Hit"
                if entry_price:
                    update_fields["finalPnL"] = round((exit_val - entry_price) * quantity, 4)
                    update_fields["pnlPercentage"] = round(((exit_val - entry_price) / entry_price) * 100, 2)

                await asyncio.to_thread(portfolio_col.update_one, {"_id": trade["_id"]}, {"$set": update_fields})
                if is_profitable:
                    print(f"[SL HIT -> TP BE] Closed WIN (BE) for {symbol}: exit ${exit_val:.2f} > Entry ${entry_price:.2f}")
                    closed_wins += 1
                else:
                    print(f"[SL HIT] Closed LOSS for {symbol}: exit ${exit_val:.2f} <= SL ${stop_loss}")
                    closed_losses += 1

            else:
                # Keep active and update current price, currentPnL, and max price reached
                update_fields["status"] = "ACTIVE"
                if entry_price:
                    update_fields["currentPnL"] = round((current_price - entry_price) * quantity, 4)
                    update_fields["pnlPercentage"] = round(((current_price - entry_price) / entry_price) * 100, 2)
                
                await asyncio.to_thread(portfolio_col.update_one, {"_id": trade["_id"]}, {"$set": update_fields})

        print(f"Checked {len(active_trades)} active trades. Closed {closed_wins} wins, {closed_losses} losses.")
        
        # Calculate and persist cumulative performance metrics
        await asyncio.to_thread(self.calculate_performance_metrics)

    def calculate_performance_metrics(self) -> dict:
        """
        Calculates aggregate Win Rate and Profit Factor across all closed trades in MongoDB.
        Safely handles Gross Loss = 0 cases without exceptions or inf values.
        """
        database = self.db
        if database is None:
            return {}

        portfolio_col = database["user_portfolio"]
        closed_query = {
            "status": {"$in": ["Hit TP", "Hit SL", "EXPIRED", "EXECUTED", "SUCCESS", "FAILED", "CLOSED", "Closed", "Expired"]}
        }
        closed_trades = list(portfolio_col.find(closed_query))

        if not closed_trades:
            stats = {
                "context": "global",
                "totalClosedTrades": 0,
                "wins": 0,
                "losses": 0,
                "winRate": 0.0,
                "grossProfit": 0.0,
                "grossLoss": 0.0,
                "netPnL": 0.0,
                "profitFactor": 0.0,
                "profitFactorLabel": "0.00 (No Trades)",
                "updatedAt": datetime.datetime.now(datetime.timezone.utc)
            }
            database["tradeperformance"].update_one(
                {"context": "global"},
                {"$set": stats},
                upsert=True
            )
            return stats

        wins = 0
        losses = 0
        gross_profit = 0.0
        gross_loss = 0.0

        for trade in closed_trades:
            pnl = float(trade.get("finalPnL") or trade.get("itemPnL") or trade.get("realizedPnL") or 0.0)
            status = str(trade.get("status", "")).upper()

            if pnl > 0 or "HIT TP" in status or "SUCCESS" in status:
                wins += 1
                gross_profit += max(0.0, pnl)
            else:
                losses += 1
                gross_loss += abs(min(0.0, pnl))

        total_closed = len(closed_trades)
        win_rate = round((wins / total_closed) * 100, 2) if total_closed > 0 else 0.0
        net_pnl = round(gross_profit - gross_loss, 2)

        # Safe Profit Factor calculation (handling Gross Loss = 0 case)
        if gross_loss > 0:
            pf = round(gross_profit / gross_loss, 2)
            pf_label = f"{pf:.2f}"
        elif gross_profit > 0:
            pf = 999.0
            pf_label = "999.00 (Perfect / No Losses)"
        else:
            pf = 0.0
            pf_label = "0.00"

        stats = {
            "context": "global",
            "totalClosedTrades": total_closed,
            "wins": wins,
            "losses": losses,
            "winRate": win_rate,
            "grossProfit": round(gross_profit, 2),
            "grossLoss": round(gross_loss, 2),
            "netPnL": net_pnl,
            "profitFactor": pf,
            "profitFactorLabel": pf_label,
            "updatedAt": datetime.datetime.now(datetime.timezone.utc)
        }

        database["tradeperformance"].update_one(
            {"context": "global"},
            {"$set": stats},
            upsert=True
        )
        print(f"[PERFORMANCE UPDATE] Win Rate: {win_rate}% ({wins}W / {losses}L) | Profit Factor: {pf_label} | Net PnL: ${net_pnl}")
        return stats

async def main():
    tracker = AsyncTradeTracker()
    await tracker.run_tracking_cycle()

if __name__ == "__main__":
    asyncio.run(main())
