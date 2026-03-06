import requests
import json
from typing import Dict, Any

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

class GeminiAnalyst:
    def __init__(self, config):
        self.config = config
        self.api_key = config.GROQ_API_KEY

    def generate_prompt(self, stock_data: Dict[str, Any]) -> str:
        """Constructs the prompt based on technical indicators."""
        symbol = stock_data['symbol']
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

        You are an expert technical analyst. Analyze the data objectively:
        - Signal BUY when: RSI < 60, price near support, MACD showing positive momentum, or price above SMA20
        - Signal SELL when: RSI > 70, price near resistance, MACD showing negative momentum
        - Signal HOLD when: mixed signals or unclear trend
        
        Be balanced and realistic — expect roughly 20-40% of stocks to be BUY on any given day.

        Provide your analysis in the exact JSON format below. DO NOT output any markdown, only valid JSON.

        {{
            "signal": "BUY" | "SELL" | "HOLD",
            "confidence": "High" | "Medium" | "Low",
            "risk": "High" | "Medium" | "Low",
            "entry_price": number,
            "stop_loss": number,
            "take_profit": number,
            "explanation_arabic": "شرح مختصر من 3-4 أسطر بالعربي يوضح الصورة التقنية وسبب الإشارة"
        }}
        """
        return prompt

    def analyze(self, stock_data: Dict[str, Any]) -> Dict[str, Any]:
        """Calls Groq API to analyze the data."""
        prompt = self.generate_prompt(stock_data)
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "llama-3.3-70b-versatile",
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

            response = requests.post(GROQ_API_URL, headers=headers, json=payload)
            response_text = response.json()["choices"][0]["message"]["content"]
            response_text = response_text.replace("```json", "").replace("```", "").strip()

            analysis = json.loads(response_text)

            signal_emoji = {"BUY": "🟢 BUY", "SELL": "🔴 SELL", "HOLD": "🟡 HOLD"}
            analysis['signal_formatted'] = signal_emoji.get(analysis.get('signal', 'HOLD'), "🟡 HOLD")

            return analysis
        except Exception as e:
            print(f"Error calling Groq API for {stock_data.get('symbol')}: {e}")
            return None