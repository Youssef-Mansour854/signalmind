import mongoose, { Schema, Document } from 'mongoose';

export interface ISetting extends Document {
  key: string;
  value: any;
  totalDeposits?: number;
  totalWithdrawals?: number;
}

const SettingSchema = new Schema<ISetting>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, required: true },
    totalDeposits: { type: Number, default: 0 },
    totalWithdrawals: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'settings' }
);

export default mongoose.models.Setting || mongoose.model<ISetting>('Setting', SettingSchema);
