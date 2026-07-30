# src/price_updater.py
import asyncio
import datetime
import os
import yfinance as yf
from pymongo import MongoClient
from dotenv import load_dotenv

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
            print(f"[SUCCESS] Connected to MongoDB (attempt {attempt}/{max_retries})")
            return client
        except Exception as e:
            print(f"[WARNING] MongoDB connection attempt {attempt}/{max_retries} failed: {e}")
            if attempt < max_retries:
                time.sleep(delay)
                delay *= 2
            else:
                print(f"[ERROR] Failed to connect to MongoDB after {max_retries} attempts: {e}")
                return None

# Initial MongoDB connection setup
db_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")
db_client = connect_to_mongodb_with_retry(db_uri)

import requests

def fetch_alpha_vantage_quote(symbol: str):
    """Fetches global quote from Alpha Vantage for a single symbol."""
    api_key = os.environ.get("ALPHA_VANTAGE_API_KEY")
    if not api_key:
        return None
    url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey={api_key}"
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            quote = data.get("Global Quote", {})
            if quote and "05. price" in quote:
                price = float(quote["05. price"])
                high = float(quote.get("03. high", price))
                low = float(quote.get("04. low", price))
                return price, high, low
    except Exception as e:
        print(f"[ALPHA VANTAGE QUOTE ERROR] {symbol}: {e}")
    return None

class SignalPriceUpdater:
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

    async def update_active_and_pending_signals(self):
        print(f"[INFO] Price Updater starting - fetching latest prices before analysis...")
        print(f"[INFO] This ensures analysis uses most recent available market data")
        print("Starting daily signal price updater...")
        database = self.db
        if database is None:
            print("[ERROR] MongoDB connection unavailable in price_updater. Skipping price update.")
            return
        signals_col = database["signals"]
        now = datetime.datetime.now(datetime.timezone.utc)

        # Query signals with status 'Pending' or 'Active'
        query = {"status": {"$in": ["Pending", "Active", "pending", "active"]}}
        active_signals = await asyncio.to_thread(list, signals_col.find(query).sort("createdAt", -1))

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
            stop_loss = sig.get("stopLoss") or sig.get("stop_loss") or 0
            max_price_reached = sig.get("maxPriceReached", 0) or 0

            current_price = None
            high_price = None
            low_price = None

            # 1. Primary: Try Alpha Vantage Global Quote
            av_res = await asyncio.to_thread(fetch_alpha_vantage_quote, symbol)
            if av_res is not None:
                current_price, high_price, low_price = av_res
                print(f"[PRIMARY - Alpha Vantage] Updated price for {symbol}: {current_price:.2f}")

            # 2. Fallback: Extract from batch yfinance download or individual download
            if current_price is None:
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
                    print(f"Batch fetch failed or empty for {symbol}, trying individual yfinance fallback with delay...")
                    await asyncio.sleep(1.5)
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

            ENTRY_TOLERANCE_PCT = 0.003  # 0.3% buffer
            signal_type = sig.get("signalType", "BUY")

            # Entry Tolerance logic (Pending -> Active)
            if status == "Pending":
                if signal_type == "BUY":
                    acceptable_entry_max = entry_price * (1 + ENTRY_TOLERANCE_PCT)
                    if current_price <= acceptable_entry_max:
                        new_status = "Active"
                        update_fields["status"] = "Active"
                        update_fields["activatedAt"] = now
                        update_fields["actualEntryPrice"] = round(current_price, 4)  # Save real execution price, NOT original signalEntryPrice
                        print(f"[ACTIVATED BUY] Signal {symbol} activated at live price {current_price:.4f} <= max entry threshold {acceptable_entry_max:.4f}")
                elif signal_type == "SELL":
                    acceptable_entry_min = entry_price * (1 - ENTRY_TOLERANCE_PCT)
                    if current_price >= acceptable_entry_min:
                        new_status = "Active"
                        update_fields["status"] = "Active"
                        update_fields["activatedAt"] = now
                        update_fields["actualEntryPrice"] = round(current_price, 4)  # Save real execution price
                        print(f"[ACTIVATED SELL] Signal {symbol} activated at live price {current_price:.4f} >= min entry threshold {acceptable_entry_min:.4f}")

            # Logic for target hits (Active/Pending -> Hit TP/SL)
            if new_status in ("Active", "Pending"):
                # Break-even Defense Mechanism (+2% profit threshold)
                if entry_price > 0:
                    profit_pct = (current_price - entry_price) / entry_price
                    if profit_pct >= 0.02 and stop_loss < entry_price:
                        new_sl_value = round(entry_price * 1.002, 4)
                        stop_loss = new_sl_value
                        update_fields["stop_loss"] = new_sl_value
                        update_fields["stopLoss"] = new_sl_value
                        print(f"[DEFENSE] Moved Stop Loss to Break-even for {symbol}.")

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
                    is_profitable = bool(entry_price > 0 and exit_val > entry_price)
                    update_fields["status"] = "Hit TP" if is_profitable else "Hit SL"
                    update_fields["currentPrice"] = round(exit_val, 4)
                    update_fields["closedAt"] = now
                    if entry_price > 0:
                        update_fields["pnlPercentage"] = round(((exit_val - entry_price) / entry_price) * 100, 2)
                    
                    if is_profitable:
                        print(f"[SL HIT -> TP BE] Signal {symbol} Hit TP (BE)! Low: {low_price:.2f} <= SL {stop_loss:.2f} (Profitable)")
                        tp_hits += 1
                    else:
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
