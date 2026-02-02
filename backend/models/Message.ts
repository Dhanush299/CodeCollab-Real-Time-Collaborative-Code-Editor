import mongoose, { Schema, Types } from 'mongoose';

export type MessageType = 'text' | 'system' | 'code';

export interface Message {
  room: Types.ObjectId;
  sender: Types.ObjectId;
  content: string;
  type: MessageType;
  timestamp: Date;
  edited: boolean;
  editedAt?: Date;
}

const messageSchema = new Schema<Message>({
  room: {
    type: Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 1000
  },
  type: {
    type: String,
    enum: ['text', 'system', 'code'],
    default: 'text'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  }
});

// Index for efficient chat history queries
messageSchema.index({ room: 1, timestamp: -1 });

export default mongoose.model<Message>('Message', messageSchema);



