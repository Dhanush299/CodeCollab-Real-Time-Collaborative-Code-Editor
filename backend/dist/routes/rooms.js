"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const Room_1 = __importDefault(require("../models/Room"));
const Message_1 = __importDefault(require("../models/Message"));
const RoomActivity_1 = __importDefault(require("../models/RoomActivity"));
const auth_1 = require("../middleware/auth");
const logRoomActivity_1 = require("../utils/logRoomActivity");
const socket_1 = require("../socket");
const router = express_1.default.Router();
// Helper to generate a 6-digit numeric room ID
function generateSixDigitRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
// Create a new room for collaboration (supports custom 6-digit room IDs)
router.post('/', auth_1.auth, (0, auth_1.checkRepositoryAccess)('editor'), [(0, express_validator_1.body)('roomId').optional().matches(/^\d{6}$/).withMessage('roomId must be exactly 6 digits')], async (req, res) => {
    try {
        // Normalize input
        const requestedRoomId = req.body.roomId ? String(req.body.roomId).trim() : null;
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array(), message: 'Invalid roomId' });
        }
        // Check if user already has an active room for this repository
        const existingRoom = await Room_1.default.findOne({
            repository: req.repository._id,
            host: req.user._id,
            isActive: true
        });
        // Ensure a requested ID (stringified 6-digit) is unique; otherwise, throw
        const ensureRequestedIdAvailable = async (desiredId, excludeRoomId = null) => {
            if (!desiredId)
                return null;
            const normalized = String(desiredId).trim();
            if (!/^\d{6}$/.test(normalized)) {
                throw new Error('roomId must be exactly 6 digits');
            }
            const conflict = await Room_1.default.findOne({
                roomId: normalized,
                ...(excludeRoomId ? { _id: { $ne: excludeRoomId } } : {})
            });
            if (conflict) {
                throw new Error('Room ID already in use. Please choose another 6-digit number.');
            }
            return normalized;
        };
        // Generate a unique ID (used only when custom ID not provided)
        const generateUniqueId = async () => {
            let attempts = 0;
            while (attempts < 10) {
                const candidate = generateSixDigitRoomId();
                const conflict = await Room_1.default.findOne({ roomId: candidate });
                if (!conflict)
                    return candidate;
                attempts += 1;
            }
            throw new Error('Unable to generate unique room ID. Please try again.');
        };
        // If there is already an active room
        if (existingRoom) {
            const newId = requestedRoomId ? await ensureRequestedIdAvailable(requestedRoomId, existingRoom._id) : await generateUniqueId();
            existingRoom.roomId = String(newId).trim();
            await existingRoom.save();
            console.log('Reusing existing room, assigning ID:', newId, 'repo:', req.repository._id.toString());
            return res.json({
                message: 'Room already exists for this repository',
                room: existingRoom
            });
        }
        // If a custom ID is requested, check for conflicts globally.
        // If conflict is the same repo+host, reuse it. Otherwise, error.
        if (requestedRoomId) {
            const normalizedRequested = await ensureRequestedIdAvailable(requestedRoomId, null);
            const conflict = await Room_1.default.findOne({ roomId: normalizedRequested });
            if (conflict) {
                if (conflict.repository.toString() === req.repository._id.toString() && conflict.host.toString() === req.user._id.toString()) {
                    conflict.isActive = true;
                    const hasHost = conflict.participants.some((p) => p.user.toString() === req.user._id.toString());
                    if (!hasHost) {
                        conflict.participants.push({ user: req.user._id, role: req.userRepositoryRole || 'editor' });
                    }
                    await conflict.save();
                    console.log('Reused existing room with custom ID:', conflict.roomId, 'repo:', req.repository._id.toString());
                    const populatedRoom = await Room_1.default.findById(conflict._id)
                        .populate('repository', 'name description')
                        .populate('host', 'username')
                        .populate('participants.user', 'username');
                    return res.status(200).json({
                        message: 'Room created successfully',
                        room: populatedRoom
                    });
                }
                throw new Error('Room ID already in use by another repository or host.');
            }
        }
        const finalRoomId = requestedRoomId ? await ensureRequestedIdAvailable(requestedRoomId) : await generateUniqueId();
        // Generate or use provided room ID, ensuring uniqueness
        const room = new Room_1.default({
            roomId: String(finalRoomId).trim(),
            repository: req.repository._id,
            host: req.user._id,
            participants: [
                {
                    user: req.user._id,
                    role: req.userRepositoryRole || 'editor'
                }
            ]
        });
        await room.save();
        // Verify persistence by refetching with the same ID
        const persisted = await Room_1.default.findOne({ roomId: room.roomId });
        if (!persisted) {
            console.error('Room creation verification failed for ID:', room.roomId);
            return res.status(500).json({ message: 'Room creation failed to persist. Please try again.' });
        }
        console.log('Room created with ID:', room.roomId, 'repo:', req.repository._id.toString());
        const populatedRoom = await Room_1.default.findById(room._id)
            .populate('repository', 'name description')
            .populate('host', 'username')
            .populate('participants.user', 'username');
        res.status(201).json({
            message: 'Room created successfully',
            room: populatedRoom
        });
    }
    catch (error) {
        console.error('Create room error:', error);
        const msg = error?.message || 'Server error';
        if (msg.includes('roomId must be exactly') || msg.includes('Room ID already in use') || msg.includes('Room ID already in use by another repository or host')) {
            return res.status(400).json({ message: msg });
        }
        res.status(500).json({ message: msg });
    }
});
// Get room by ID (any authenticated user can view/join if they have the Room ID)
router.get('/:roomId', auth_1.auth, async (req, res) => {
    try {
        const room = await Room_1.default.findOne({ roomId: req.params.roomId })
            .populate('repository', 'name description owner collaborators')
            .populate('host', 'username')
            .populate('participants.user', 'username');
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        res.json({ room });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Join a room: allow any authenticated user with the Room ID; add with collaborator role (default viewer) if not already participant
router.post('/:roomId/join', auth_1.auth, async (req, res) => {
    try {
        const roomId = String(req.params.roomId || '').trim();
        console.log('Join attempt for roomId:', roomId);
        const query = /^\d+$/.test(roomId) ? { $or: [{ roomId }, { roomId: String(Number(roomId)) }] } : { roomId };
        const room = await Room_1.default.findOne(query).populate('repository', 'name description owner collaborators');
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        if (!room.isActive) {
            return res.status(400).json({ message: 'Room is no longer active' });
        }
        // Check if user is already a participant
        const existingParticipant = room.participants.find((p) => p.user.toString() === req.user._id.toString());
        if (!existingParticipant) {
            // Determine role based on repository collaborator role / ownership
            let effectiveRole = 'viewer';
            const repo = room.repository;
            const uid = req.user._id.toString();
            const ownerId = repo?.owner?.toString?.() || (repo?.owner && String(repo.owner));
            const hostId = room.host?.toString?.() || (room.host && String(room.host));
            if (ownerId && ownerId === uid) {
                effectiveRole = 'admin';
            }
            else if (hostId && hostId === uid) {
                effectiveRole = 'admin';
            }
            else if (Array.isArray(repo?.collaborators)) {
                const collab = repo.collaborators.find((c) => (c.user?.toString?.() || String(c.user)) === uid);
                if (collab?.role)
                    effectiveRole = collab.role;
            }
            room.participants.push({
                user: req.user._id,
                role: effectiveRole
            });
            await room.save();
        }
        // Activity log (best-effort)
        await (0, logRoomActivity_1.logRoomActivity)({
            roomId: room.roomId,
            actorId: req.user._id,
            actorUsername: req.user.username,
            type: 'join',
            message: `${req.user.username} joined the room`
        });
        (0, socket_1.getIO)()
            ?.to(room.roomId)
            ?.emit('room-activity', {
            type: 'join',
            message: `${req.user.username} joined the room`,
            actorUsername: req.user.username,
            createdAt: new Date().toISOString()
        });
        const updatedRoom = await Room_1.default.findById(room._id).populate('repository', 'name description').populate('host', 'username').populate('participants.user', 'username');
        res.json({
            message: 'Joined room successfully',
            room: updatedRoom
        });
    }
    catch (error) {
        console.error('Join room error:', error);
        res.status(500).json({ message: error?.message || 'Server error' });
    }
});
// Leave a room
router.post('/:roomId/leave', auth_1.auth, async (req, res) => {
    try {
        const room = await Room_1.default.findOne({ roomId: req.params.roomId });
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        // Remove user from participants
        room.participants = room.participants.filter((p) => p.user.toString() !== req.user._id.toString());
        // If host is leaving and there are other participants, assign new host
        if (room.host.toString() === req.user._id.toString() && room.participants.length > 0) {
            room.host = room.participants[0].user;
        }
        // If no participants left, deactivate room
        if (room.participants.length === 0) {
            room.isActive = false;
        }
        await room.save();
        // Activity log (best-effort)
        await (0, logRoomActivity_1.logRoomActivity)({
            roomId: room.roomId,
            actorId: req.user._id,
            actorUsername: req.user.username,
            type: 'leave',
            message: `${req.user.username} left the room`
        });
        (0, socket_1.getIO)()
            ?.to(room.roomId)
            ?.emit('room-activity', {
            type: 'leave',
            message: `${req.user.username} left the room`,
            actorUsername: req.user.username,
            createdAt: new Date().toISOString()
        });
        res.json({ message: 'Left room successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Get room activity log (latest entries)
router.get('/:roomId/activity', auth_1.auth, async (req, res) => {
    try {
        const room = await Room_1.default.findOne({ roomId: req.params.roomId });
        if (!room)
            return res.status(404).json({ message: 'Room not found' });
        const isParticipant = room.participants.some((p) => p.user.toString() === req.user._id.toString());
        if (!isParticipant) {
            return res.status(403).json({ message: 'Access denied to room activity' });
        }
        const limit = Math.min(Number(req.query.limit) || 100, 300);
        const items = await RoomActivity_1.default.find({ room: room._id })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('type message meta actorUsername createdAt')
            .lean();
        res.json({ activity: items });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Get room messages/chat history
router.get('/:roomId/messages', auth_1.auth, async (req, res) => {
    try {
        const room = await Room_1.default.findOne({ roomId: req.params.roomId });
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        const isParticipant = room.participants.some((p) => p.user.toString() === req.user._id.toString());
        if (!isParticipant) {
            return res.status(403).json({ message: 'Access denied to room messages' });
        }
        const messages = await Message_1.default.find({ room: room._id }).populate('sender', 'username').sort({ timestamp: 1 }).limit(100);
        res.json({ messages });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Update room settings
router.put('/:roomId/settings', auth_1.auth, async (req, res) => {
    try {
        const room = await Room_1.default.findOne({ roomId: req.params.roomId });
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        // Only host can update settings
        if (room.host.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only room host can update settings' });
        }
        const { allowChat, allowDrawing, allowVoice } = req.body;
        if (allowChat !== undefined)
            room.settings.allowChat = allowChat;
        if (allowDrawing !== undefined)
            room.settings.allowDrawing = allowDrawing;
        if (allowVoice !== undefined)
            room.settings.allowVoice = allowVoice;
        await room.save();
        res.json({
            message: 'Room settings updated successfully',
            settings: room.settings
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Get active rooms for user
router.get('/', auth_1.auth, async (req, res) => {
    try {
        const rooms = await Room_1.default.find({
            $or: [{ host: req.user._id }, { 'participants.user': req.user._id }],
            isActive: true
        })
            .populate('repository', 'name description')
            .populate('host', 'username')
            .populate('participants.user', 'username')
            .sort({ lastActivity: -1 });
        res.json({ rooms });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Close/deactivate a room
router.delete('/:roomId', auth_1.auth, async (req, res) => {
    try {
        const room = await Room_1.default.findOne({ roomId: req.params.roomId });
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        // Only host can close room
        if (room.host.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only room host can close the room' });
        }
        room.isActive = false;
        await room.save();
        res.json({ message: 'Room closed successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
exports.default = router;
