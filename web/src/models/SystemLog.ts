import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemLog extends Document {
  level: 'info' | 'warn' | 'error';
  message: string;
  context: string; // e.g. "Analyzer", "Tracker", "API"
  metadata?: Record<string, any>;
  createdAt: Date;
}

const SystemLogSchema = new Schema<ISystemLog>(
  {
    level: { type: String, enum: ['info', 'warn', 'error'], required: true, index: true },
    message: { type: String, required: true },
    context: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.models.SystemLog || mongoose.model<ISystemLog>('SystemLog', SystemLogSchema);
