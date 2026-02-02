import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'viewer' | 'editor' | 'admin';

export interface User {
  username: string;
  email: string;
  password: string;
  role: UserRole;
  avatar: string;
  createdAt: Date;
  lastLogin?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<User>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['viewer', 'editor', 'admin'],
    default: 'editor'
  },
  avatar: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date
  }
});

// Note: Password hashing is handled in the auth route

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword: string) {
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const doc: any = this;
  return await bcrypt.compare(candidatePassword, doc.password);
};

export default mongoose.model<User>('User', userSchema);



