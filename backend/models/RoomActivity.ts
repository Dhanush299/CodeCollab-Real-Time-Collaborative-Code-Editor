import mongoose, { Schema, Types } from 'mongoose';

export interface RoomActivity {
  room: Types.ObjectId;
  roomId: string;
  repository: Types.ObjectId;
  actor: Types.ObjectId;
  actorUsername?: string;
  type: string;
  message: string;
  meta: Record<string, unknown>;
  createdAt: Date;
}

const roomActivitySchema = new Schema<RoomActivity>({
  room: {
    type: Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  roomId: {
    type: String,
    required: true,
    index: true
  },
  repository: {
    type: Schema.Types.ObjectId,
    ref: 'Repository',
    required: true
  },
  actor: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actorUsername: {
    type: String
  },
  type: {
    type: String,
    required: true
  },
  message: {
    type: String,
    default: ''
  },
  meta: {
    type: Object,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

roomActivitySchema.index({ roomId: 1, createdAt: -1 });
roomActivitySchema.index({ repository: 1, createdAt: -1 });

export default mongoose.model<RoomActivity>('RoomActivity', roomActivitySchema);



