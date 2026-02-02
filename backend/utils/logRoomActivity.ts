import Room from '../models/Room';
import RoomActivity from '../models/RoomActivity';

export interface LogRoomActivityInput {
  roomId: string;
  actorId: string;
  actorUsername?: string;
  type: string;
  message?: string;
  meta?: Record<string, unknown>;
}

/**
 * Persist a room activity record. Best-effort: never throws to caller.
 */
export async function logRoomActivity({
  roomId,
  actorId,
  actorUsername,
  type,
  message = '',
  meta = {}
}: LogRoomActivityInput) {
  try {
    if (!roomId || !actorId || !type) return null;
    const room = await Room.findOne({ roomId }).select('_id roomId repository');
    if (!room) return null;

    const doc = await RoomActivity.create({
      room: room._id,
      roomId: room.roomId,
      repository: room.repository,
      actor: actorId,
      actorUsername: actorUsername || '',
      type,
      message,
      meta
    });

    // Keep last 500 activities per room
    const toDelete = await RoomActivity.find({ roomId: room.roomId })
      .sort({ createdAt: -1 })
      .skip(500)
      .select('_id');
    if (toDelete.length) {
      await RoomActivity.deleteMany({ _id: { $in: toDelete.map((d) => d._id) } });
    }

    return doc;
  } catch (e) {
    return null;
  }
}



