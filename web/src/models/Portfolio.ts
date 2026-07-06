import mongoose, { Schema, Document } from 'mongoose';

export interface IPortfolio extends Document {
  signalId: mongoose.Types.ObjectId | string;
  symbol: string;
  market: 'US' | 'EGX';
  actualEntryPrice: number;
  positionSize: number;
  quantity?: number;
  status: 'ACTIVE' | 'Hit TP' | 'Hit SL' | 'CLOSED';
  executedAt: Date;
  currentPrice?: number;
  currentPnL?: number;
  maxPriceReached?: number;
  exitPrice?: number;
  closeDate?: Date;
  closedAt?: Date;
  finalPnL?: number;
  pnlPercentage?: number;
  closeReason?: string;
}

const PortfolioSchema = new Schema<IPortfolio>(
  {
    signalId: { type: Schema.Types.ObjectId, ref: 'Signal', required: true },
    symbol: { type: String, required: true, index: true },
    market: { type: String, enum: ['US', 'EGX'], required: true, index: true },
    actualEntryPrice: { type: Number, required: true },
    positionSize: { type: Number, required: true },
    quantity: { type: Number },
    status: { 
      type: String, 
      enum: ['ACTIVE', 'Hit TP', 'Hit SL', 'CLOSED'], 
      default: 'ACTIVE',
      index: true 
    },
    executedAt: { type: Date, default: Date.now },
    currentPrice: { type: Number },
    currentPnL: { type: Number },
    maxPriceReached: { type: Number, default: 0 },
    exitPrice: { type: Number },
    closeDate: { type: Date },
    closedAt: { type: Date },
    finalPnL: { type: Number },
    pnlPercentage: { type: Number },
    closeReason: { type: String }
  },
  { timestamps: true, collection: 'user_portfolio' }
);

export default mongoose.models.Portfolio || mongoose.model<IPortfolio>('Portfolio', PortfolioSchema);
