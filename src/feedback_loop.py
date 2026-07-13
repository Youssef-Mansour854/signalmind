# src/feedback_loop.py
import datetime
from pymongo import MongoClient
import os
import requests
import json
from dotenv import load_dotenv

# Load env variables
load_dotenv()

class AIFeedbackLoop:
    def __init__(self, db_uri=None, db_name="signalmind"):
        self.db_uri = db_uri or os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")
        self.client = MongoClient(self.db_uri)
        
        # PyMongo 4+ does not support bool(db) truth testing
        try:
            db = self.client.get_default_database()
        except Exception:
            db = None
            
        if db is None:
            db = self.client[db_name]
            
        self.db = db
        self.signals_col = self.db["signals"]
        self.portfolio_col = self.db["user_portfolio"]
        raw_keys = os.environ.get("GROQ_API_KEYS") or os.environ.get("GROQ_API_KEY", "")
        self.groq_api_keys = [k.strip() for k in raw_keys.split(",") if k.strip()]
        self.groq_api_key = self.groq_api_keys[0] if self.groq_api_keys else None

    def get_closed_trades_count(self) -> int:
        now = datetime.datetime.utcnow()
        one_week_ago = now - datetime.timedelta(days=7)

        # 1. Count trades closed in the past week from signals
        signals_query = {
            "status": {"$in": ["Hit TP", "Hit SL"]},
            "closedAt": {"$gte": one_week_ago}
        }
        signals_count = self.signals_col.count_documents(signals_query)

        # 2. Count trades closed in the past week from user_portfolio
        portfolio_query = {
            "status": {"$in": ["Hit TP", "Hit SL", "CLOSED"]},
            "closedAt": {"$gte": one_week_ago}
        }
        portfolio_count = self.portfolio_col.count_documents(portfolio_query)

        return signals_count + portfolio_count

    def run_weekly_assessment(self):
        print("Initiating Weekly AI Feedback Loop...")
        
        if not self.groq_api_key:
            print("GROQ_API_KEY is not defined. Skipping LLM feedback loop.")
            return

        # Calculate time range (last 7 days)
        now = datetime.datetime.utcnow()
        one_week_ago = now - datetime.timedelta(days=7)

        # 1. Fetch trades closed in the past week from signals
        query = {
            "status": {"$in": ["Hit TP", "Hit SL"]},
            "closedAt": {"$gte": one_week_ago}
        }
        closed_signals = list(self.signals_col.find(query))

        # Fetch trades closed in the past week from user_portfolio
        portfolio_query = {
            "status": {"$in": ["Hit TP", "Hit SL", "CLOSED"]},
            "closedAt": {"$gte": one_week_ago}
        }
        closed_portfolio = list(self.portfolio_col.find(portfolio_query))

        if not closed_signals and not closed_portfolio:
            print("No closed trades found for self-optimization review this week.")
            return

        # 2. Segment and aggregate statistics
        sig_wins = [t for t in closed_signals if t["status"] == "Hit TP"]
        sig_losses = [t for t in closed_signals if t["status"] == "Hit SL"]

        port_wins = [t for t in closed_portfolio if t["status"] == "Hit TP" or (t["status"] == "CLOSED" and t.get("pnlPercentage", 0) > 0)]
        port_losses = [t for t in closed_portfolio if t["status"] == "Hit SL" or (t["status"] == "CLOSED" and t.get("pnlPercentage", 0) <= 0)]

        win_count = len(sig_wins) + len(port_wins)
        loss_count = len(sig_losses) + len(port_losses)
        total = win_count + loss_count
        win_rate = (win_count / total) * 100 if total > 0 else 0

        # Construct trade list text for the prompt
        trade_logs = []
        for trade in closed_signals:
            ind = trade.get("indicators", {})
            trade_logs.append({
                "source": "automated_signal",
                "symbol": trade["symbol"],
                "status": trade["status"],
                "pnl": trade.get("pnlPercentage", 0),
                "indicators_at_entry": {
                    "rsi": ind.get("rsi") if ind else None,
                    "macd_diff": (ind.get("macdLine", 0) - ind.get("macdSignal", 0)) if ind and ind.get("macdLine") else None,
                    "distance_to_support": ((trade["entryPrice"] - ind.get("support", 0)) / ind.get("support", 1)) if ind and ind.get("support") else None,
                    "volume_surge": (ind.get("volume", 0) / ind.get("volumeAvg", 1)) if ind and ind.get("volumeAvg") else None,
                    "bb_position": ((trade["entryPrice"] - ind.get("bbLow", 0)) / (ind.get("bbHigh", 1) - ind.get("bbLow", 0))) if ind and ind.get("bbLow") else None
                }
            })

        for trade in closed_portfolio:
            signal_id = trade.get("signalId")
            ind = {}
            if signal_id:
                try:
                    signal_doc = self.signals_col.find_one({"_id": signal_id})
                    if signal_doc:
                        ind = signal_doc.get("indicators", {})
                except Exception as ex:
                    print(f"Error fetching signal doc for portfolio item {trade.get('symbol')}: {ex}")

            entry_price = trade.get("actualEntryPrice") or trade.get("entryPrice", 0)
            trade_logs.append({
                "source": "user_portfolio",
                "symbol": trade["symbol"],
                "status": trade["status"],
                "pnl": trade.get("pnlPercentage", 0),
                "indicators_at_entry": {
                    "rsi": ind.get("rsi") if ind else None,
                    "macd_diff": (ind.get("macdLine", 0) - ind.get("macdSignal", 0)) if ind and ind.get("macdLine") else None,
                    "distance_to_support": ((entry_price - ind.get("support", 0)) / ind.get("support", 1)) if ind and ind.get("support") else None,
                    "volume_surge": (ind.get("volume", 0) / ind.get("volumeAvg", 1)) if ind and ind.get("volumeAvg") else None,
                    "bb_position": ((entry_price - ind.get("bbLow", 0)) / (ind.get("bbHigh", 1) - ind.get("bbLow", 0))) if ind and ind.get("bbLow") else None
                }
            })

        # 3. Formulate the Self-Assessment Prompt
        prompt = f"""
        You are the Head Risk Architect of SignalMind. This is your weekly self-correction cycle.
        Here is the log of trades you signaled that reached their targets (Hit TP - Take Profit) or failed (Hit SL - Stop Loss) over the past week:
        
        === WEEKLY METRICS ===
        Total Closed Trades: {total}
        Wins (Hit TP): {win_count}
        Losses (Hit SL): {loss_count}
        Win Rate: {win_rate:.2f}%

        === DETAILED TRADE HISTORIES (At entry point) ===
        {json.dumps(trade_logs, indent=2)}

        === YOUR TASKS ===
        1. Analyze patterns in failures (Losses): Did they have high RSI at entry? Was price far from support? Was volume below average?
        2. Analyze patterns in successes (Wins): What setup parameters yielded the highest win rate?
        3. Propose dynamic updates to your future selection rules: E.g., "Reduce entry threshold when market volatility is high", or "Require RSI < 45 for entry on high-risk tech stocks".
        4. Provide numerical weight adjustments for indicator rules (values between -10 and +10 to adjust indicator weights: rsi, volume, trend).

        Respond in the exact JSON format below (no markdown, just raw JSON):
        {{
            "failureInsights": "Detailed breakdown in English analyzing why SL was hit",
            "successInsights": "Detailed breakdown in English analyzing why TP was hit",
            "suggestedPromptWeights": {{
                "rsiWeightAdjustment": number (float between -10.0 and +10.0),
                "volumeWeightAdjustment": number (float between -10.0 and +10.0),
                "trendWeightAdjustment": number (float between -10.0 and +10.0)
            }}
        }}
        """

        # 4. Call LLM for self-assessment
        # 4. Call LLM for self-assessment
        insights = None
        num_keys = len(self.groq_api_keys) if self.groq_api_keys else 1
        key_idx = 0
        
        while key_idx < num_keys:
            active_key = self.groq_api_keys[key_idx] if self.groq_api_keys else self.groq_api_key
            try:
                headers = {
                    "Authorization": f"Bearer {active_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a quantitative finance self-assessment system. You output ONLY valid raw JSON."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    "temperature": 0.2,
                    "max_tokens": 1500
                }
                response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
                
                if response.status_code == 429:
                    print(f"[WARNING] Groq rate limit hit. Rotating API key...")
                    key_idx += 1
                    if key_idx < num_keys:
                        continue
                
                response.raise_for_status()
                
                response_json = response.json()
                content = response_json["choices"][0]["message"]["content"]
                content = content.replace("```json", "").replace("```", "").strip()
                
                insights = json.loads(content)
                break
            except Exception as e:
                if "429" in str(e):
                    key_idx += 1
                    if key_idx < num_keys:
                        print(f"[WARNING] Groq rate limit hit. Rotating API key...")
                        continue
                print(f"Error in Weekly AI Feedback Loop: {e}")
                return

        try:
            # Save feedback log to DB
            feedback_doc = {
                "weekStartDate": one_week_ago,
                "weekEndDate": now,
                "metrics": {
                    "totalClosed": total,
                    "winCount": win_count,
                    "lossCount": loss_count,
                    "winRate": round(win_rate, 2)
                },
                "failureInsights": insights.get("failureInsights"),
                "successInsights": insights.get("successInsights"),
                "suggestedPromptWeights": insights.get("suggestedPromptWeights", {
                    "rsiWeightAdjustment": 0,
                    "volumeWeightAdjustment": 0,
                    "trendWeightAdjustment": 0
                }),
                "createdAt": now
            }
            
            self.feedback_col.insert_one(feedback_doc)
            print("Successfully saved Weekly AI Feedback & Optimization Parameters.")
            
        except Exception as e:
            print(f"Error saving to DB: {e}")

if __name__ == "__main__":
    loop = AIFeedbackLoop()
    loop.run_weekly_assessment()
