import requests
import json
import os
from typing import Dict, Any
from pymongo import MongoClient

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

class GroqAnalyst:
    def __init__(self, config):
        self.config = config
        self.api_key = getattr(config, "GROQ_API_KEY", os.environ.get("GROQ_API_KEY"))
        self.db_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")
        
        # Initialize client lazily
        self._db_client = None

    @property
    def db(self):
        if self._db_client is None:
            try:
                self._db_client = MongoClient(self.db_uri)
            except Exception as e:
                print(f"Error connecting to MongoDB: {e}")
                return None
        try:
            return self._db_client.get_default_database() or self._db_client["signalmind"]
        except Exception:
            return self._db_client["signalmind"]

    def get_latest_feedback_insights(self) -> str:
        """Fetches the latest weekly self-optimization loop insights and weight updates."""
        database = self.db
        if database is None:
            return ""

        try:
            feedback_col = database["aifeedbacks"]
            latest_list = list(feedback_col.find().sort("createdAt", -1).limit(1))
            if not latest_list:
                return ""
            
            fb = latest_list[0]
            weights = fb.get("suggestedPromptWeights", {})
            
            adjustments = "\n=== DYNAMIC AI SELF-CORRECTION ADJUSTMENTS (WEEKLY REVIEW) ===\n"
            adjustments += f"Last Week's Win Rate: {fb.get('metrics', {}).get('winRate', 50)}%\n"
            adjustments += f"Failure Pattern Identified: {fb.get('failureInsights', 'None')}\n"
            adjustments += f"Success Pattern Identified: {fb.get('successInsights', 'None')}\n"
            
            # Apply dynamic logic based on weights
            rsi_adj = weights.get("rsiWeightAdjustment", 0)
            vol_adj = weights.get("volumeWeightAdjustment", 0)
            trend_adj = weights.get("trendWeightAdjustment", 0)

            # Calculate exact math rules
            rsi_threshold = max(50.0, min(70.0, 60.0 + rsi_adj))
            vol_multiplier = max(0.5, min(1.5, 1.0 + vol_adj * 0.05))

            adjustments += f"\nDynamic ML Feedback mathematical rules applied for this analysis:\n"
            adjustments += f"- Signal BUY only when the stock's 14-day RSI is strictly less than {rsi_threshold:.2f} (adjusted from the default 60).\n"
            adjustments += f"- Signal BUY only when the trading Volume is at least {vol_multiplier:.2f}x of its 20-day Average Volume.\n"
            if trend_adj != 0:
                adjustments += f"- Trend Adjustment: {trend_adj:+.2f}. Adjust your trend filters strictness accordingly.\n"

            return adjustments
        except Exception as e:
            print(f"Error fetching feedback insights: {e}")
            return ""

    def generate_prompt(self, stock_data: Dict[str, Any]) -> str:
        """Constructs the prompt based on technical indicators and dynamic feedback."""
        symbol = stock_data['symbol']
        
        # Get dynamic adjustments from past week's feedback loop
        feedback_adjustments = self.get_latest_feedback_insights()

        prompt = f"""
        Analyze the following technical indicators for the stock {symbol}:
        Current Price: {stock_data['close']}
        RSI (14): {stock_data['rsi']}
        MACD Line: {stock_data['macd_line']}
        MACD Signal: {stock_data['macd_signal']}
        SMA (20): {stock_data['sma_20']}
        SMA (50): {stock_data['sma_50']}
        EMA (20): {stock_data['ema_20']}
        Volume: {stock_data['volume']}
        Average Volume (20d): {stock_data['volume_avg']}
        Recent Support (30d): {stock_data['support']}
        Recent Resistance (30d): {stock_data['resistance']}
        Bollinger Bands High: {stock_data.get('bb_high')}
        Bollinger Bands Low: {stock_data.get('bb_low')}
        Bollinger Bands Mid: {stock_data.get('bb_mid')}
        Stochastic RSI K: {stock_data.get('stoch_rsi_k')}
        Stochastic RSI D: {stock_data.get('stoch_rsi_d')}
        {feedback_adjustments}
        You are an expert technical analyst. Analyze the data objectively:
        - Signal BUY when: RSI < 60, price near support, MACD showing positive momentum, or price above SMA20
        - Signal SELL when: RSI > 70, price near resistance, MACD showing negative momentum
        - Signal HOLD when: mixed signals or unclear trend
        
        Be balanced and realistic — expect roughly 20-40% of stocks to be BUY on any given day.

        Provide your analysis in the exact JSON format below. DO NOT output any markdown, only valid JSON.

        {{
            "signal": "BUY" | "SELL" | "HOLD",
            "entry_price": number,
            "take_profit": number,
            "stop_loss": number,
            "reasoning_ar": "شرح مختصر من 3-4 أسطر بالعربي يوضح الصورة التقنية وسبب الإشارة"
        }}
        """
        return prompt

    async def analyze(self, stock_data: Dict[str, Any], session) -> Dict[str, Any]:
        """Calls Groq API to analyze the data asynchronously."""
        prompt = self.generate_prompt(stock_data)
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": getattr(self.config, "GROQ_MODEL", "llama-3.3-70b-versatile"),
            "messages": [
                {
                    "role": "system",
                    "content": "You are an expert AI stock analyst. You provide objective technical analysis. You must always output ONLY valid JSON with no markdown."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": 0.3,
            "max_tokens": 1000
        }

        async with session.post(GROQ_API_URL, headers=headers, json=payload) as response:
            if response.status == 429:
                raise Exception("429 Rate Limit")
                
            response.raise_for_status()
            
            response_json = await response.json()
            response_text = response_json["choices"][0]["message"]["content"]
            response_text = response_text.replace("```json", "").replace("```", "").strip()

            analysis = json.loads(response_text)

            # Map reasoning_ar to explanation_arabic
            if "reasoning_ar" in analysis and "explanation_arabic" not in analysis:
                analysis["explanation_arabic"] = analysis["reasoning_ar"]

            # Map default fields if not returned by LLM
            if "confidence" not in analysis:
                analysis["confidence"] = "Medium"
            if "risk" not in analysis:
                analysis["risk"] = "Medium"

            signal_emoji = {"BUY": "🟢 BUY", "SELL": "🔴 SELL", "HOLD": "🟡 HOLD"}
            analysis['signal_formatted'] = signal_emoji.get(analysis.get('signal', 'HOLD'), "🟡 HOLD")

            return analysis
