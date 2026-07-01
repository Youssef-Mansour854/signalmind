import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  role: 'admin' | 'premium' | 'free';
  telegramChatId?: string;
  preferredMarket: 'US' | 'EGX' | 'ALL';
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['admin', 'premium', 'free'], default: 'free' },
    telegramChatId: { type: String },
    preferredMarket: { type: String, enum: ['US', 'EGX', 'ALL'], default: 'ALL' },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
