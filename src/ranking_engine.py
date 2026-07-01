# src/ranking_engine.py
from typing import Dict, List, Any

class PythonRankingEngine:
    def __init__(self, w_rr=0.35, w_confluence=0.45, w_ai=0.20):
        self.w_rr = w_rr
        self.w_confluence = w_confluence
        self.w_ai = w_ai

    def calculate_risk_reward_score(self, entry: float, tp: float, sl: float) -> float:
        if entry <= sl or tp <= entry:
            return 0.0
        
        rr = (tp - entry) / (entry - sl)
        if rr >= 2.5:
            return 100.0
        if rr <= 1.0:
            return 0.0
        
        return ((rr - 1.0) / 1.5) * 100.0

    def calculate_technical_confluence(self, close: float, indicators: Dict[str, Any]) -> float:
        score = 0.0
        max_possible_score = 0.0

        # 1. Support Level proximity (Max 25 pts)
        support = indicators.get("support")
        if support is not None and close >= support:
            dist_percent = (close - support) / support if support > 0 else 0
            if dist_percent <= 0.02:
                score += 25
            elif dist_percent <= 0.05:
                score += 15
            elif dist_percent <= 0.10:
                score += 5
        max_possible_score += 25

        # 2. RSI Score (Max 25 pts)
        rsi = indicators.get("rsi")
        if rsi is not None:
            if rsi < 35:
                score += 25
            elif rsi >= 35 and rsi < 50:
                score += 20
            elif rsi >= 50 and rsi < 60:
                score += 10
        max_possible_score += 25

        # 3. MACD Momentum (Max 20 pts)
        macd_line = indicators.get("macdLine")
        macd_signal = indicators.get("macdSignal")
        if macd_line is not None and macd_signal is not None:
            if macd_line > macd_signal:
                score += 20
            elif macd_signal - macd_line < 0.1:
                score += 10
        max_possible_score += 20

        # 4. Bollinger Bands (Max 15 pts)
        bb_low = indicators.get("bbLow")
        bb_high = indicators.get("bbHigh")
        if bb_low is not None and bb_high is not None:
            bb_range = bb_high - bb_low
            if bb_range > 0:
                pct_bb = (close - bb_low) / bb_range
                if pct_bb <= 0.1:
                    score += 15
                elif pct_bb <= 0.3:
                    score += 10
                elif pct_bb <= 0.5:
                    score += 5
        max_possible_score += 15

        # 5. Stochastic RSI Crossover (Max 15 pts)
        stoch_k = indicators.get("stochRsiK")
        stoch_d = indicators.get("stochRsiD")
        if stoch_k is not None and stoch_d is not None:
            if stoch_k < 20 and stoch_k > stoch_d:
                score += 15
            elif stoch_k < 40:
                score += 8
        max_possible_score += 15

        return round((score / max_possible_score) * 100.0) if max_possible_score > 0 else 0.0

    def get_ai_confidence_score(self, confidence: str) -> float:
        conf_map = {"High": 100.0, "Medium": 65.0, "Low": 30.0}
        return conf_map.get(confidence, 50.0)

    def score_signal(self, entry: float, tp: float, sl: float, close: float, indicators: Dict[str, Any], ai_confidence: str) -> Dict[str, Any]:
        rr_score = self.calculate_risk_reward_score(entry, tp, sl)
        tech_score = self.calculate_technical_confluence(close, indicators)
        ai_score = self.get_ai_confidence_score(ai_confidence)

        total_score = round(
            (rr_score * self.w_rr) +
            (tech_score * self.w_confluence) +
            (ai_score * self.w_ai)
        )

        return {
            "riskRewardRatio": round(rr_score, 2),
            "confluenceScore": round(tech_score, 2),
            "aiConfidenceScore": round(ai_score, 2),
            "totalScore": total_score,
            "rank": 999
        }
