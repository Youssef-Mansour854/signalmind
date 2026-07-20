import mongoose, { Schema, Document } from 'mongoose';

export interface ISetting extends Document {
  key: string;
  value: any;
  totalDeposits?: number;
  totalWithdrawals?: number;
  maxDailyDrawdownLimit?: number;
  maxTotalDrawdownLimit?: number;
  peakEquity?: number;
  dailyStartEquity?: number;
  dailyStartEquityDate?: string;
}

const SettingSchema = new Schema<ISetting>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, required: true },
    totalDeposits: { type: Number, default: 0 },
    totalWithdrawals: { type: Number, default: 0 },
    maxDailyDrawdownLimit: { type: Number, default: 5 },
    maxTotalDrawdownLimit: { type: Number, default: 10 },
    peakEquity: { type: Number },
    dailyStartEquity: { type: Number },
    dailyStartEquityDate: { type: String },
  },
  { timestamps: true, collection: 'settings' }
);

export default mongoose.models.Setting || mongoose.model<ISetting>('Setting', SettingSchema);

