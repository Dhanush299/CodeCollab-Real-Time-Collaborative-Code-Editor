"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logRoomActivity = logRoomActivity;
const Room_1 = __importDefault(require("../models/Room"));
const RoomActivity_1 = __importDefault(require("../models/RoomActivity"));
/**
 * Persist a room activity record. Best-effort: never throws to caller.
 */
async function logRoomActivity({ roomId, actorId, actorUsername, type, message = '', meta = {} }) {
    try {
        if (!roomId || !actorId || !type)
            return null;
        const room = await Room_1.default.findOne({ roomId }).select('_id roomId repository');
        if (!room)
            return null;
        const doc = await RoomActivity_1.default.create({
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
        const toDelete = await RoomActivity_1.default.find({ roomId: room.roomId })
            .sort({ createdAt: -1 })
            .skip(500)
            .select('_id');
        if (toDelete.length) {
            await RoomActivity_1.default.deleteMany({ _id: { $in: toDelete.map((d) => d._id) } });
        }
        return doc;
    }
    catch (e) {
        return null;
    }
}
