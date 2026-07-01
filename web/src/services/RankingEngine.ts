import { ISignal } from '../models/Signal';

export interface ScoringParams {
  wRR: number;         // Weight for Risk-to-Reward Ratio (e.g. 0.35)
  wConfluence: number;  // Weight for Technical Confluence (e.g. 0.45)
  wAI: number;          // Weight for AI Confidence Score (e.g. 0.20)
}

export class RankingEngine {
  private params: ScoringParams;

  constructor(params: ScoringParams = { wRR: 0.35, wConfluence: 0.45, wAI: 0.20 }) {
    this.params = params;
  }

  /**
   * Calculates the Risk-to-Reward Ratio score (0 - 100)
   * Formula: RR = (TP - Entry) / (Entry - SL)
   * Standard targets: RR >= 2.5 gets 100, RR <= 1.0 gets 0, linear scaling in between.
   */
  public calculateRiskRewardScore(entry: number, tp: number, sl: number): number {
    if (entry <= sl || tp <= entry) return 0;
    
    const rr = (tp - entry) / (entry - sl);
    if (rr >= 2.5) return 100;
    if (rr <= 1.0) return 0;
    
    // Scale linearly from 1.0 (0 pts) to 2.5 (100 pts)
    return ((rr - 1.0) / 1.5) * 100;
  }

  /**
   * Calculates Technical Confluence Score (0 - 100) based on:
   * 1. Distance to Support (Closer is safer)
   * 2. RSI level (Oversold values below 40 are premium)
   * 3. MACD Signal alignment
   * 4. Stochastic RSI crossover
   * 5. Bollinger Band proximity (Near lower band is prime for BUY)
   */
  public calculateTechnicalConfluence(close: number, indicators: ISignal['indicators']): number {
    let score = 0;
    let maxPossibleScore = 0;

    // 1. Support Level proximity (Max 25 pts)
    if (indicators.support && close >= indicators.support) {
      const distPercent = (close - indicators.support) / indicators.support;
      if (distPercent <= 0.02) {
        score += 25;
      } else if (distPercent <= 0.05) {
        score += 15;
      } else if (distPercent <= 0.10) {
        score += 5;
      }
    }
    maxPossibleScore += 25;

    // 2. RSI Score (Max 25 pts)
    if (indicators.rsi) {
      if (indicators.rsi < 35) {
        score += 25;
      } else if (indicators.rsi >= 35 && indicators.rsi < 50) {
        score += 20;
      } else if (indicators.rsi >= 50 && indicators.rsi < 60) {
        score += 10;
      }
    }
    maxPossibleScore += 25;

    // 3. MACD Momentum (Max 20 pts)
    if (indicators.macdLine && indicators.macdSignal) {
      if (indicators.macdLine > indicators.macdSignal) {
        score += 20; // MACD Line above Signal line
      } else if (indicators.macdSignal - indicators.macdLine < 0.1) {
        score += 10; // Nearing crossover
      }
    }
    maxPossibleScore += 20;

    // 4. Bollinger Bands (Max 15 pts)
    if (indicators.bbLow && indicators.bbHigh) {
      const bbRange = indicators.bbHigh - indicators.bbLow;
      if (bbRange > 0) {
        const pctBB = (close - indicators.bbLow) / bbRange;
        if (pctBB <= 0.1) {
          score += 15;
        } else if (pctBB <= 0.3) {
          score += 10;
        } else if (pctBB <= 0.5) {
          score += 5;
        }
      }
    }
    maxPossibleScore += 15;

    // 5. Stochastic RSI Crossover (Max 15 pts)
    if (indicators.stochRsiK && indicators.stochRsiD) {
      if (indicators.stochRsiK < 20 && indicators.stochRsiK > indicators.stochRsiD) {
        score += 15;
      } else if (indicators.stochRsiK < 40) {
        score += 8;
      }
    }
    maxPossibleScore += 15;

    return maxPossibleScore > 0 ? Math.round((score / maxPossibleScore) * 100) : 0;
  }

  /**
   * Converts AI Confidence Enum to Score (0 - 100)
   */
  public getAIConfidenceScore(confidence: 'High' | 'Medium' | 'Low'): number {
    switch (confidence) {
      case 'High': return 100;
      case 'Medium': return 65;
      case 'Low': return 30;
      default: return 50;
    }
  }

  /**
   * Scores a single signal, updates its fields, and returns the total score.
   */
  public scoreSignal(signal: ISignal): number {
    const rrScore = this.calculateRiskRewardScore(
      signal.entryPrice,
      signal.takeProfit,
      signal.stopLoss
    );
    const techScore = this.calculateTechnicalConfluence(
      signal.currentPrice,
      signal.indicators
    );
    const aiScore = this.getAIConfidenceScore(signal.aiConfidence);

    const totalScore = Math.round(
      (rrScore * this.params.wRR) +
      (techScore * this.params.wConfluence) +
      (aiScore * this.params.wAI)
    );

    // Save back to signal metrics
    signal.scoreMetrics = {
      riskRewardRatio: rrScore,
      confluenceScore: techScore,
      aiConfidenceScore: aiScore,
      totalScore: totalScore,
      rank: signal.scoreMetrics?.rank || 999
    };

    return totalScore;
  }

  /**
   * Bulk ranks a set of signals for a given day (e.g. today).
   * Ranks from 1 (highest score) downwards.
   */
  public rankSignals(signals: ISignal[]): ISignal[] {
    // 1. Calculate individual scores
    signals.forEach(sig => this.scoreSignal(sig));

    // 2. Sort by totalScore descending
    const sorted = [...signals].sort((a, b) => b.scoreMetrics.totalScore - a.scoreMetrics.totalScore);

    // 3. Assign rank
    sorted.forEach((sig, index) => {
      sig.scoreMetrics.rank = index + 1;
    });

    return sorted;
  }
}
