import mongoose, { Schema, Document } from 'mongoose';

export interface ISignal extends Document {
  symbol: string;
  market: 'US' | 'EGX';
  signalType: 'BUY' | 'SELL' | 'HOLD';
  
  // Price points
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  maxPriceReached: number;
  
  // Status and tracking
  status: 'Pending' | 'Active' | 'Hit TP' | 'Hit SL' | 'Expired';
  isNearTP: boolean; // Flagged when price reaches 90% towards TP
  activatedAt?: Date;
  closedAt?: Date;
  pnlPercentage?: number;

  // Technical Indicators at creation
  indicators: {
    close: number;
    rsi: number;
    macdLine: number;
    macdSignal: number;
    sma20: number;
    sma50: number;
    ema20: number;
    ema50: number;
    ema200: number;
    support: number;
    resistance: number;
    bbHigh: number;
    bbLow: number;
    bbMid: number;
    stochRsiK: number;
    stochRsiD: number;
    volume: number;
    volumeAvg: number;
  };

  // AI Analysis Metadata
  aiConfidence: 'High' | 'Medium' | 'Low';
  aiRisk: 'High' | 'Medium' | 'Low';
  explanationArabic: string;

  // Ranking & Scoring Metrics
  scoreMetrics: {
    riskRewardRatio: number;
    confluenceScore: number;
    aiConfidenceScore: number;
    totalScore: number; // Combined weighted score
    rank: number;       // Daily rank position (1 = Strongest)
  };

  createdAt: Date;
  updatedAt: Date;
  timeframe?: string;
  signalStrength?: 'قوية' | 'متوسطة';
  closeReason?: string;
}

const SignalSchema = new Schema<ISignal>(
  {
    symbol: { type: String, required: true, index: true },
    market: { type: String, enum: ['US', 'EGX'], required: true, index: true },
    signalType: { type: String, enum: ['BUY', 'SELL', 'HOLD'], required: true, index: true },
    entryPrice: { type: Number, required: true },
    stopLoss: { type: Number, required: true },
    takeProfit: { type: Number, required: true },
    currentPrice: { type: Number, required: true },
    maxPriceReached: { type: Number, default: 0 },
    status: { 
      type: String, 
      enum: ['Pending', 'Active', 'Hit TP', 'Hit SL', 'Expired'], 
      default: 'Pending',
      index: true 
    },
    isNearTP: { type: Boolean, default: false },
    activatedAt: { type: Date },
    closedAt: { type: Date },
    pnlPercentage: { type: Number },
    indicators: {
      close: Number,
      rsi: Number,
      macdLine: Number,
      macdSignal: Number,
      sma20: Number,
      sma50: Number,
      ema20: Number,
      ema50: Number,
      ema200: Number,
      support: Number,
      resistance: Number,
      bbHigh: Number,
      bbLow: Number,
      bbMid: Number,
      stochRsiK: Number,
      stochRsiD: Number,
      volume: Number,
      volumeAvg: Number
    },
    aiConfidence: { type: String, enum: ['High', 'Medium', 'Low'], required: true },
    aiRisk: { type: String, enum: ['High', 'Medium', 'Low'], required: true },
    explanationArabic: { type: String, required: true },
    scoreMetrics: {
      riskRewardRatio: { type: Number, default: 0 },
      confluenceScore: { type: Number, default: 0 },
      aiConfidenceScore: { type: Number, default: 0 },
      totalScore: { type: Number, default: 0, index: true },
      rank: { type: Number, default: 999 }
    },
    timeframe: { type: String },
    signalStrength: { type: String },
    closeReason: { type: String }
  },
  { timestamps: true }
);

// Indexes for fast ranking searches
SignalSchema.index({ createdAt: -1, 'scoreMetrics.totalScore': -1 });

export default mongoose.models.Signal || mongoose.model<ISignal>('Signal', SignalSchema);
