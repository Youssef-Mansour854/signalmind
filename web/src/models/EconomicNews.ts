import mongoose, { Schema, Document } from 'mongoose';

export interface IEconomicNews extends Document {
  title: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  eventTime: Date;
  isPassed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EconomicNewsSchema = new Schema<IEconomicNews>(
  {
    title: { type: String, required: true },
    currency: { type: String, required: true, default: 'USD', index: true },
    impact: { 
      type: String, 
      enum: ['HIGH', 'MEDIUM', 'LOW'], 
      required: true, 
      index: true 
    },
    eventTime: { type: Date, required: true, index: true },
    isPassed: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

EconomicNewsSchema.index({ currency: 1, impact: 1, eventTime: 1 });
EconomicNewsSchema.index({ title: 1, eventTime: 1 }, { unique: true });

export default mongoose.models.EconomicNews || mongoose.model<IEconomicNews>('EconomicNews', EconomicNewsSchema);
