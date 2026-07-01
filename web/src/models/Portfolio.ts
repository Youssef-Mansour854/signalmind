import mongoose, { Schema, Document } from 'mongoose';

export interface IPortfolio extends Document {
  signalId: mongoose.Types.ObjectId | string;
  symbol: string;
  market: 'US' | 'EGX';
  actualEntryPrice: number;
  positionSize: number;
  status: 'ACTIVE' | 'CLOSED_WIN' | 'CLOSED_LOSS';
  executedAt: Date;
}

const PortfolioSchema = new Schema<IPortfolio>(
  {
    signalId: { type: Schema.Types.ObjectId, ref: 'Signal', required: true },
    symbol: { type: String, required: true, index: true },
    market: { type: String, enum: ['US', 'EGX'], required: true, index: true },
    actualEntryPrice: { type: Number, required: true },
    positionSize: { type: Number, required: true },
    status: { 
      type: String, 
      enum: ['ACTIVE', 'CLOSED_WIN', 'CLOSED_LOSS'], 
      default: 'ACTIVE',
      index: true 
    },
    executedAt: { type: Date, default: Date.now }
  },
  { timestamps: true, collection: 'user_portfolio' }
);

export default mongoose.models.Portfolio || mongoose.model<IPortfolio>('Portfolio', PortfolioSchema);
