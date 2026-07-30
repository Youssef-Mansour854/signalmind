import asyncio
import time
import requests
import json
import os
from typing import Dict, Any, List
from pymongo import MongoClient

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

class GroqAnalyst:
    current_key_index: int = 0

    def __init__(self, config=None):
        self.config = config
        
        # Parse GROQ_API_KEYS into a list of strings
        raw_keys = getattr(config, "GROQ_API_KEYS", None)
        if not raw_keys:
            env_keys = os.environ.get("GROQ_API_KEYS") or os.environ.get("GROQ_API_KEY", "")
            self.api_keys: List[str] = [k.strip() for k in env_keys.split(",") if k.strip()]
        elif isinstance(raw_keys, list):
            self.api_keys = raw_keys
        else:
            self.api_keys = [k.strip() for k in str(raw_keys).split(",") if k.strip()]

        if not self.api_keys:
            fallback = getattr(config, "GROQ_API_KEY", os.environ.get("GROQ_API_KEY"))
            if fallback:
                self.api_keys = [fallback]

        self.db_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")
        self._db_client = None

    @property
    def api_key(self) -> str:
        """Dynamic getter returning the currently active API key."""
        return self.get_current_api_key()

    def get_current_api_key(self) -> str:
        if not self.api_keys:
            return ""
        idx = GroqAnalyst.current_key_index % len(self.api_keys)
        return self.api_keys[idx]

    def rotate_api_key(self) -> str:
        if not self.api_keys:
            return ""
        GroqAnalyst.current_key_index = (GroqAnalyst.current_key_index + 1) % len(self.api_keys)
        print(f"[WARNING] Groq rate limit hit. Rotating API key...")
        return self.get_current_api_key()

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
        Calculated Entry Price: {stock_data.get('entry_price')}
        Calculated Stop Loss: {stock_data.get('stop_loss')}
        Calculated Take Profit: {stock_data.get('take_profit')}
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

        IMPORTANT:
        The entry_price ({stock_data.get('entry_price')}), stop_loss ({stock_data.get('stop_loss')}), and take_profit ({stock_data.get('take_profit')}) have been calculated mathematically by quantitative models. DO NOT recalculate or modify these numbers. Output them exactly as given.

        TIMEFRAME RULES:
        Classify the trade setup timeframe as ONE of the following based on the chart's technical nature:
        - "يومي" (Daily) for short-term setups (few days to a couple of weeks)
        - "أسبوعي" (Weekly) for medium-term setups (few weeks to a couple of months)
        - "شهري" (Monthly) for long-term setups (few months to a year)
        - "استثمار سنوي" (Annual Investment) for long-term fundamental/investing setups (more than a year)

        SIGNAL STRENGTH RULES:
        Classify the setup's signal strength based on the technical confluence as ONE of the following:
        - "قوية" (Strong) if there is high technical confluence (e.g., MACD crossover/momentum + RSI in ideal zone + Price above SMA 20).
        - "متوسطة" (Medium) if there is only partial confluence (e.g., MACD cross + RSI ideal, but price action is slightly weak or facing resistance).

        Provide your analysis in the exact JSON format below. DO NOT output any markdown, only valid JSON.

        {{
            "signal": "BUY" | "SELL" | "HOLD",
            "entry_price": {stock_data.get('entry_price')},
            "take_profit": {stock_data.get('take_profit')},
            "stop_loss": {stock_data.get('stop_loss')},
            "reasoning_ar": "شرح مختصر من 3-4 أسطر بالعربي يوضح الصورة التقنية وسبب الإشارة المنطقية بناءً على الأرقام المعطاة",
            "timeframe": "يومي" | "أسبوعي" | "شهري" | "استثمار سنوي",
            "signal_strength": "قوية" | "متوسطة"
        }}
        """
        return prompt

    def _safe_parse_json(self, response_text: str) -> Any:
        """Unified helper to safely parse JSON object or array response with regex fallback."""
        if not response_text:
            return None
        try:
            return json.loads(response_text)
        except (json.JSONDecodeError, Exception):
            import re
            json_match = re.search(r'(\[.*\]|\{.*\})', response_text, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group(0))
                except (json.JSONDecodeError, Exception) as parse_err:
                    print(f"[ERROR] Failed regex JSON parse: {parse_err}")
                    return None
            return None

    async def _call_groq(self, system_prompt: str, user_prompt: str, model_name: str, session) -> Any:
        """
        Unified Groq API call with round-robin key rotation and instant key switching on 429.
        If all keys are exhausted in a cycle, applies exponential backoff sleep.
        """
        num_keys = len(self.api_keys) if self.api_keys else 1
        attempts = 0

        while attempts < num_keys:
            current_key = self.get_current_api_key()
            headers = {
                "Authorization": f"Bearer {current_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.2,
                "max_tokens": 1500
            }

            try:
                async with session.post(GROQ_API_URL, headers=headers, json=payload) as response:
                    if response.status == 429:
                        old_idx = GroqAnalyst.current_key_index % num_keys
                        self.rotate_api_key()
                        new_idx = GroqAnalyst.current_key_index % num_keys
                        print(f"[INFO] Groq 429 hit on Key #{old_idx + 1}. Instantly rotated to Key #{new_idx + 1}. Retrying...")
                        attempts += 1
                        continue

                    response.raise_for_status()
                    response_json = await response.json()
                    response_text = response_json["choices"][0]["message"]["content"]
                    return self._safe_parse_json(response_text)
            except Exception as e:
                if "429" in str(e):
                    old_idx = GroqAnalyst.current_key_index % num_keys
                    self.rotate_api_key()
                    new_idx = GroqAnalyst.current_key_index % num_keys
                    print(f"[INFO] Groq 429 hit on Key #{old_idx + 1}. Instantly rotated to Key #{new_idx + 1}. Retrying...")
                    attempts += 1
                    continue
                else:
                    print(f"[ERROR] Groq API call failed ({model_name}): {e}")
                    return None

        print("[WARNING] All Groq API keys returned 429. Applying backoff cooldown (5.0s)...")
        await asyncio.sleep(5.0)
        return None

    async def quick_screen_batch(self, stocks_data: List[Dict[str, Any]], session) -> List[Dict[str, Any]]:
        """
        Stage 1 Batch Screener: Evaluates a batch of up to 10 stocks in a SINGLE Groq API call
        using llama-3.1-8b-instant to stay far below RPM (Requests Per Minute) limits.
        """
        if not stocks_data:
            return []

        system_prompt = "You are a fast quantitative stock screener. Output ONLY valid JSON array with no markdown."
        
        stock_summaries = []
        for s in stocks_data:
            vol = s.get('volume', 0)
            vol_avg = s.get('volume_avg', 1)
            vol_ratio = round(vol / vol_avg, 2) if vol_avg > 0 else 1.0
            stock_summaries.append({
                "symbol": s['symbol'],
                "close": s.get('close', 0),
                "rsi": s.get('rsi', 50),
                "macd": s.get('macd_line', 0),
                "macd_signal": s.get('macd_signal', 0),
                "vol_ratio": vol_ratio
            })

        user_prompt = f"""
        Screen the following list of stocks in batch:
        {json.dumps(stock_summaries, indent=2)}

        Evaluate bullish setup quality for each stock from 1 to 10.
        Set passed=true if RSI < 60 and (MACD > MACD_Signal or VolRatio >= 1.0).
        Return exact JSON ARRAY:
        [
          {{"symbol": "TICKER", "score": number 1-10, "passed": true|false, "reason": "short English note"}},
          ...
        ]
        """

        model_name = getattr(self.config, "GROQ_FAST_MODEL", "llama-3.1-8b-instant")
        result = await self._call_groq(system_prompt, user_prompt, model_name, session)

        results_list = []
        if isinstance(result, list):
            results_list = result
        elif isinstance(result, dict):
            for k, v in result.items():
                if isinstance(v, list):
                    results_list = v
                    break

        eval_map = {}
        for item in results_list:
            if isinstance(item, dict) and 'symbol' in item:
                eval_map[item['symbol']] = item

        final_batch_results = []
        for s in stocks_data:
            sym = s['symbol']
            eval_item = eval_map.get(sym)
            if eval_item:
                score = eval_item.get('score', 5)
                try: score = int(score)
                except (TypeError, ValueError): score = 5
                passed = bool(eval_item.get('passed', False))
                reason = str(eval_item.get('reason', 'Batch evaluated'))
            else:
                rsi = s.get('rsi', 50)
                macd = s.get('macd_line', 0)
                macds = s.get('macd_signal', 0)
                passed = rsi < 60 and macd >= macds
                score = 7 if passed else 4
                reason = "Heuristic fallback"

            final_batch_results.append({
                "symbol": sym,
                "score": score,
                "passed": passed,
                "reason": reason
            })

        return final_batch_results

    async def analyze(self, stock_data: Dict[str, Any], session) -> Dict[str, Any]:
        """
        Stage 2: Deep technical analysis using llama-3.3-70b-versatile.
        Calls Groq API for selected Top candidates only.
        """
        system_prompt = "You are an expert AI stock analyst. You provide objective technical analysis. You must always output ONLY valid JSON with no markdown."
        user_prompt = self.generate_prompt(stock_data)
        
        model_name = getattr(self.config, "GROQ_MODEL", "llama-3.3-70b-versatile")
        analysis = await self._call_groq(system_prompt, user_prompt, model_name, session)

        if not analysis or not isinstance(analysis, dict):
            print(f"[ERROR] Stage 2 deep analysis returned empty or invalid output for {stock_data.get('symbol')}.")
            return None

        # Strict 100% Python Override for Trading Levels
        if 'entry_price' in stock_data:
            analysis['entry_price'] = stock_data['entry_price']
        if 'stop_loss' in stock_data:
            analysis['stop_loss'] = stock_data['stop_loss']
        if 'take_profit' in stock_data:
            analysis['take_profit'] = stock_data['take_profit']

        # Map reasoning_ar to explanation_arabic
        if "reasoning_ar" in analysis and "explanation_arabic" not in analysis:
            analysis["explanation_arabic"] = analysis["reasoning_ar"]

        # Map default fields if not returned by LLM
        if "confidence" not in analysis:
            analysis["confidence"] = "Medium"
        if "risk" not in analysis:
            analysis["risk"] = "Medium"
        if "timeframe" not in analysis:
            analysis["timeframe"] = "يومي"

        if "signal_strength" not in analysis:
            analysis["signal_strength"] = "متوسطة"
        else:
            strength_val = str(analysis["signal_strength"]).strip()
            if strength_val not in ["قوية", "متوسطة"]:
                if "قو" in strength_val:
                    analysis["signal_strength"] = "قوية"
                else:
                    analysis["signal_strength"] = "متوسطة"

        signal_emoji = {"BUY": "🟢 BUY", "SELL": "🔴 SELL", "HOLD": "🟡 HOLD"}
        analysis['signal_formatted'] = signal_emoji.get(analysis.get('signal', 'HOLD'), "🟡 HOLD")

        return analysis
