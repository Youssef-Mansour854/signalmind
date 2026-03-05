import gemini
import json
from typing import Dict, Any

class GeminiAnalyst:
    def __init__(self, config):
        self.config = config
        self.client = anthropic.Anthropic(api_key=config.GEMINI_API_KEY)

    def generate_prompt(self, stock_data: Dict[str, Any]) -> str:
        """Constructs the prompt for Claude based on technical indicators."""
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
        
        You are an expert technical analyst. Based on this data, provide an analysis in the exact JSON format specified below.
        DO NOT output any markdown, only valid JSON.
        
        Required JSON structure:
        {{
            "signal": "BUY" | "SELL" | "HOLD",
            "confidence": "High" | "Medium" | "Low",
            "risk": "High" | "Medium" | "Low",
            "entry_price": number (suggested entry price based on current data),
            "stop_loss": number (suggested stop loss based on support/resistance),
            "take_profit": number (suggested take profit based on support/resistance),
            "explanation_arabic": "Short 3-4 line explanation in Arabic summarizing the technical picture and the reason for the signal."
        }}
        """
        return prompt

    def analyze(self, stock_data: Dict[str, Any]) -> Dict[str, Any]:
        """Calls Gemini API to analyze the data."""
        prompt = self.generate_prompt(stock_data)

        try:
            message = self.client.messages.create(
                model=self.config.CLAUDE_MODEL,
                max_tokens=1000,
                temperature=0.2, # Low temperature for more analytical consistency
                system="You are an expert AI stock analyst. You provide strict purely technical analysis. You must always output ONLY valid JSON.",
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )
            
            # Parse the JSON response
            response_text = message.content[0].text
            # Sometimes the model might wrap in ```json ... ``` despite instructions. Clean it up.
            response_text = response_text.replace("```json", "").replace("```", "").strip()
            
            analysis = json.loads(response_text)
            
            # Map emojis and structure for the sender
            signal_emoji = {"BUY": "🟢 BUY", "SELL": "🔴 SELL", "HOLD": "🟡 HOLD"}
            analysis['signal_formatted'] = signal_emoji.get(analysis.get('signal', 'HOLD'), "🟡 HOLD")
            
            return analysis

        except Exception as e:
            print(f"Error calling Claude API for {stock_data.get('symbol')}: {e}")
            return None
