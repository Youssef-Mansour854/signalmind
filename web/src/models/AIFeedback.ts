import mongoose, { Schema, Document } from 'mongoose';

export interface IAIFeedback extends Document {
  weekStartDate: Date;
  weekEndDate: Date;
  metrics: {
    totalClosed: number;
    winCount: number;
    lossCount: number;
    winRate: number;
  };
  failureInsights: string; // LLM generated notes on why signals hit SL
  successInsights: string; // LLM generated notes on why signals hit TP
  suggestedPromptWeights: {
    rsiWeightAdjustment: number;
    volumeWeightAdjustment: number;
    trendWeightAdjustment: number;
  };
  createdAt: Date;
}

const AIFeedbackSchema = new Schema<IAIFeedback>(
  {
    weekStartDate: { type: Date, required: true },
    weekEndDate: { type: Date, required: true },
    metrics: {
      totalClosed: { type: Number, required: true },
      winCount: { type: Number, required: true },
      lossCount: { type: Number, required: true },
      winRate: { type: Number, required: true }
    },
    failureInsights: { type: String, required: true },
    successInsights: { type: String, required: true },
    suggestedPromptWeights: {
      rsiWeightAdjustment: { type: Number, default: 0 },
      volumeWeightAdjustment: { type: Number, default: 0 },
      trendWeightAdjustment: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

export default mongoose.models.AIFeedback || mongoose.model<IAIFeedback>('AIFeedback', AIFeedbackSchema);
