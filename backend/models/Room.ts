import mongoose, { Schema, Types } from 'mongoose';

export type RoomRole = 'viewer' | 'editor' | 'admin';

export interface RoomParticipant {
  user: Types.ObjectId;
  role: RoomRole;
  joinedAt: Date;
  lastActivity: Date;
}

export interface RoomSettings {
  allowChat: boolean;
  allowDrawing: boolean;
  allowVoice: boolean;
}

export interface Room {
  roomId: string;
  repository: Types.ObjectId;
  host: Types.ObjectId;
  participants: RoomParticipant[];
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  settings: RoomSettings;
}

const roomSchema = new Schema<Room>({
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  repository: {
    type: Schema.Types.ObjectId,
    ref: 'Repository',
    required: true
  },
  host: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      role: {
        type: String,
        enum: ['viewer', 'editor', 'admin'],
        default: 'viewer'
      },
      joinedAt: {
        type: Date,
        default: Date.now
      },
      lastActivity: {
        type: Date,
        default: Date.now
      }
    }
  ],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  settings: {
    allowChat: {
      type: Boolean,
      default: true
    },
    allowDrawing: {
      type: Boolean,
      default: true
    },
    allowVoice: {
      type: Boolean,
      default: false
    }
  }
});

// Update lastActivity when participants change
roomSchema.pre('save', function () {
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const doc: any = this;
  doc.lastActivity = new Date();
});

export default mongoose.model<Room>('Room', roomSchema);



