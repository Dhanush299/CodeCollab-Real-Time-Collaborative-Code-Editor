"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Load environment variables FIRST, before any imports that might use them
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dotenv = require('dotenv');
// When running with ts-node from backend directory, process.cwd() is the backend directory
// dotenv.config() will automatically look for .env in the current working directory
const result = dotenv.config();
if (result.error) {
    console.warn('Warning loading .env:', result.error.message);
}
else {
    console.log('Loaded .env file from:', process.cwd() + '\\.env');
    console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'FOUND (' + process.env.GEMINI_API_KEY.substring(0, 10) + '...)' : 'NOT FOUND');
}
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const auth_1 = __importDefault(require("./routes/auth"));
const repositories_1 = __importDefault(require("./routes/repositories"));
const files_1 = __importDefault(require("./routes/files"));
const rooms_1 = __importDefault(require("./routes/rooms"));
const execution_1 = __importDefault(require("./routes/execution"));
const preview_1 = __importDefault(require("./routes/preview"));
const ai_1 = __importDefault(require("./routes/ai"));
const socket_1 = require("./socket");
const logRoomActivity_1 = require("./utils/logRoomActivity");
const Room_1 = __importDefault(require("./models/Room"));
const Repository_1 = __importDefault(require("./models/Repository"));
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST']
    },
    maxHttpBufferSize: 10 * 1024 * 1024 // 10MB to handle larger images
});
// Make io accessible from route handlers (for realtime activity updates)
(0, socket_1.setIO)(io);
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/repositories', repositories_1.default);
app.use('/api/files', files_1.default);
app.use('/api/rooms', rooms_1.default);
app.use('/api/execute', execution_1.default);
app.use('/api/preview', preview_1.default);
app.use('/api/ai', ai_1.default);
// Connect to MongoDB
mongoose_1.default
    .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/codecollab')
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => {
    console.error('MongoDB connection error:', err?.message);
    console.log('Please ensure MongoDB is running locally or set MONGODB_URI environment variable');
    console.log('For local MongoDB: Install MongoDB Community Server and start mongod');
    console.log('For cloud MongoDB: Set MONGODB_URI to your MongoDB Atlas connection string');
});
// Socket.io for real-time collaboration
const rooms = new Map();
const userSockets = new Map();
// roomId -> Map(userId -> role)
const roomRoles = new Map();
// roomId -> Map(fileId -> Map(userId -> { username, role }))
const filePresence = new Map();
const roleRank = { viewer: 1, editor: 2, admin: 3 };
const normalizeRole = (role) => (role === 'admin' || role === 'editor' || role === 'viewer' ? role : 'viewer');
const hasAtLeastRole = (role, required) => (roleRank[normalizeRole(role)] || 1) >= (roleRank[normalizeRole(required)] || 1);
async function computeRoleForRoom(roomId, userId) {
    try {
        const room = await Room_1.default.findOne({ roomId })
            .populate('repository', 'owner collaborators')
            .populate('host', '_id');
        if (!room)
            return 'viewer';
        const uid = String(userId);
        const ownerId = room.repository?.owner?.toString?.() || (room.repository?.owner && String(room.repository.owner));
        const hostId = room.host?._id?.toString?.() || (room.host && room.host.toString?.());
        if (ownerId && ownerId === uid)
            return 'admin';
        if (hostId && hostId === uid)
            return 'admin';
        if (Array.isArray(room.repository?.collaborators)) {
            const collab = room.repository.collaborators.find((c) => (c.user?.toString?.() || String(c.user)) === uid);
            if (collab?.role)
                return normalizeRole(collab.role);
        }
        const participant = room.participants?.find((p) => (p.user?.toString?.() || String(p.user)) === uid);
        if (participant?.role)
            return normalizeRole(participant.role);
        return 'viewer';
    }
    catch (e) {
        return 'viewer';
    }
}
async function getRole(roomId, userId) {
    const uid = String(userId);
    if (roomRoles.has(roomId) && roomRoles.get(roomId).has(uid)) {
        return roomRoles.get(roomId).get(uid);
    }
    const role = await computeRoleForRoom(roomId, uid);
    if (!roomRoles.has(roomId))
        roomRoles.set(roomId, new Map());
    roomRoles.get(roomId).set(uid, role);
    return role;
}
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    // Join room
    socket.on('join-room', async (data) => {
        const { roomId, userId, username } = data;
        socket.join(roomId);
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(userId);
        userSockets.set(String(userId), socket.id);
        socket.data.userId = String(userId);
        socket.data.username = username;
        socket.data.roomId = roomId;
        // Determine role (best-effort) so clients show correct participant role
        const role = await getRole(roomId, userId);
        if (!roomRoles.has(roomId))
            roomRoles.set(roomId, new Map());
        roomRoles.get(roomId).set(String(userId), role);
        // Notify others in room (include role)
        socket.to(roomId).emit('user-joined', { userId, username, role });
        // Send current users in room
        const usersInRoom = Array.from(rooms.get(roomId));
        io.to(roomId).emit('room-users', usersInRoom);
    });
    // Leave room
    socket.on('leave-room', (data) => {
        const { roomId, userId, username } = data;
        socket.leave(roomId);
        if (rooms.has(roomId)) {
            rooms.get(roomId).delete(userId);
            if (rooms.get(roomId).size === 0) {
                rooms.delete(roomId);
            }
        }
        userSockets.delete(String(userId));
        if (roomRoles.has(roomId)) {
            roomRoles.get(roomId).delete(String(userId));
            if (roomRoles.get(roomId).size === 0)
                roomRoles.delete(roomId);
        }
        // clear presence for this user in this room
        if (filePresence.has(roomId)) {
            for (const [fid, usersMap] of filePresence.get(roomId).entries()) {
                usersMap.delete(String(userId));
                io.to(roomId).emit('file-presence', {
                    fileId: fid,
                    users: Array.from(usersMap.entries()).map(([id, u]) => ({ userId: id, ...u }))
                });
                if (usersMap.size === 0)
                    filePresence.get(roomId).delete(fid);
            }
            if (filePresence.get(roomId).size === 0)
                filePresence.delete(roomId);
        }
        socket.to(roomId).emit('user-left', { userId, username });
    });
    // Presence: user is focusing a file (viewing/editing)
    socket.on('file-focus', async (data) => {
        const { roomId, fileId } = data || {};
        const userId = socket.data.userId || data?.userId;
        const username = socket.data.username || data?.username;
        if (!roomId || !fileId || !userId)
            return;
        const role = await getRole(roomId, userId);
        if (!filePresence.has(roomId))
            filePresence.set(roomId, new Map());
        if (!filePresence.get(roomId).has(fileId))
            filePresence.get(roomId).set(fileId, new Map());
        filePresence.get(roomId).get(fileId).set(String(userId), { username, role });
        const usersMap = filePresence.get(roomId).get(fileId);
        io.to(roomId).emit('file-presence', {
            fileId,
            users: Array.from(usersMap.entries()).map(([id, u]) => ({ userId: id, ...u }))
        });
    });
    socket.on('file-blur', (data) => {
        const { roomId, fileId } = data || {};
        const userId = socket.data.userId || data?.userId;
        if (!roomId || !fileId || !userId)
            return;
        if (!filePresence.has(roomId))
            return;
        if (!filePresence.get(roomId).has(fileId))
            return;
        const usersMap = filePresence.get(roomId).get(fileId);
        usersMap.delete(String(userId));
        if (usersMap.size === 0) {
            filePresence.get(roomId).delete(fileId);
        }
        if (filePresence.get(roomId).size === 0) {
            filePresence.delete(roomId);
        }
        io.to(roomId).emit('file-presence', {
            fileId,
            users: Array.from(usersMap.entries()).map(([id, u]) => ({ userId: id, ...u }))
        });
    });
    // Code changes
    socket.on('code-change', async (data) => {
        const { roomId, fileId, content } = data;
        const userId = socket.data.userId || data.userId;
        const role = await getRole(roomId, userId);
        if (!hasAtLeastRole(role, 'editor'))
            return;
        socket.to(roomId).emit('code-update', { fileId, content, userId });
    });
    // Cursor position
    socket.on('cursor-move', async (data) => {
        const { roomId, position } = data;
        const userId = socket.data.userId || data.userId;
        const role = await getRole(roomId, userId);
        if (!hasAtLeastRole(role, 'editor'))
            return;
        socket.to(roomId).emit('cursor-update', { userId, position });
    });
    // Chat messages
    socket.on('send-message', async (data, cb) => {
        console.log('Raw received data:', JSON.stringify(data).substring(0, 200));
        const { roomId, message, image, imageName, messageType } = data;
        const userId = socket.data.userId || data.userId;
        const username = socket.data.username || data.username;
        const role = await getRole(roomId, userId);
        if (!hasAtLeastRole(role, 'editor')) {
            cb?.({ ok: false, error: 'Permission denied' });
            return;
        }
        const broadcastData = {
            message: message || '',
            userId,
            username
        };
        if (image) {
            broadcastData.image = image;
            broadcastData.imageName = imageName || null;
            broadcastData.messageType = messageType || 'image';
        }
        else {
            broadcastData.image = null;
            broadcastData.imageName = null;
            broadcastData.messageType = messageType || 'text';
        }
        broadcastData.timestamp = new Date();
        socket.to(roomId).emit('receive-message', broadcastData);
        // Activity log (best-effort)
        await (0, logRoomActivity_1.logRoomActivity)({
            roomId,
            actorId: userId,
            actorUsername: username,
            type: 'chat',
            message: imageName ? `${username} sent an image: ${imageName}` : `${username} sent a message`,
            meta: { hasImage: !!image, imageName: imageName || null }
        });
        io.to(roomId).emit('room-activity', {
            type: 'chat',
            message: imageName ? `${username} sent an image: ${imageName}` : `${username} sent a message`,
            actorUsername: username,
            createdAt: new Date().toISOString(),
            meta: { hasImage: !!image, imageName: imageName || null }
        });
        cb?.({ ok: true });
    });
    // Drawing updates (broadcast to all in room, including sender, with userId)
    socket.on('drawing-update', async (data) => {
        const { roomId, drawingData } = data;
        const userId = socket.data.userId || data.userId;
        if (!roomId || !drawingData)
            return;
        const role = await getRole(roomId, userId);
        if (!hasAtLeastRole(role, 'editor'))
            return;
        io.to(roomId).emit('drawing-sync', { ...drawingData, userId });
        if (drawingData.type === 'clear' || drawingData.type === 'undo-one' || drawingData.type === 'redo-one') {
            const username = socket.data.username || data.username || String(userId);
            const action = drawingData.type === 'clear' ? 'cleared the whiteboard' : drawingData.type === 'undo-one' ? 'undid a stroke' : 'redid a stroke';
            await (0, logRoomActivity_1.logRoomActivity)({
                roomId,
                actorId: userId,
                actorUsername: username,
                type: 'whiteboard',
                message: `${username} ${action}`,
                meta: { action: drawingData.type }
            });
            io.to(roomId).emit('room-activity', {
                type: 'whiteboard',
                message: `${username} ${action}`,
                actorUsername: username,
                createdAt: new Date().toISOString(),
                meta: { action: drawingData.type }
            });
        }
    });
    // Admin: update participant role (also updates repository collaborator role if present)
    socket.on('update-participant-role', async (data, cb) => {
        const { roomId, targetUserId, role } = data || {};
        const actorUserId = socket.data.userId;
        if (!roomId || !targetUserId || !actorUserId)
            return;
        const newRole = normalizeRole(role);
        const actorRole = await getRole(roomId, actorUserId);
        if (!hasAtLeastRole(actorRole, 'admin')) {
            cb?.({ ok: false, error: 'Permission denied' });
            return;
        }
        try {
            const room = await Room_1.default.findOne({ roomId }).populate('repository', '_id collaborators owner').populate('host', '_id');
            if (!room) {
                cb?.({ ok: false, error: 'Room not found' });
                return;
            }
            const tid = String(targetUserId);
            const participant = room.participants.find((p) => (p.user?.toString?.() || String(p.user)) === tid);
            if (participant) {
                participant.role = newRole;
            }
            else {
                room.participants.push({ user: tid, role: newRole });
            }
            await room.save();
            // Update repository collaborator role if the user is already a collaborator
            if (room.repository?._id) {
                const repo = await Repository_1.default.findById(room.repository._id);
                if (repo && Array.isArray(repo.collaborators)) {
                    const collab = repo.collaborators.find((c) => (c.user?.toString?.() || String(c.user)) === tid);
                    if (collab) {
                        collab.role = newRole;
                        await repo.save();
                    }
                }
            }
            if (!roomRoles.has(roomId))
                roomRoles.set(roomId, new Map());
            roomRoles.get(roomId).set(tid, newRole);
            io.to(roomId).emit('participant-role-updated', { userId: tid, role: newRole });
            await (0, logRoomActivity_1.logRoomActivity)({
                roomId,
                actorId: actorUserId,
                actorUsername: socket.data.username || '',
                type: 'role_change',
                message: `${socket.data.username || 'Admin'} changed role of ${tid} to ${newRole}`,
                meta: { targetUserId: tid, role: newRole }
            });
            io.to(roomId).emit('room-activity', {
                type: 'role_change',
                message: `${socket.data.username || 'Admin'} changed a user role to ${newRole}`,
                actorUsername: socket.data.username || 'Admin',
                createdAt: new Date().toISOString(),
                meta: { targetUserId: tid, role: newRole }
            });
            cb?.({ ok: true });
        }
        catch (e) {
            cb?.({ ok: false, error: 'Server error' });
        }
    });
    // Admin: kick user from room
    socket.on('kick-user', async (data, cb) => {
        const { roomId, targetUserId } = data || {};
        const actorUserId = socket.data.userId;
        if (!roomId || !targetUserId || !actorUserId)
            return;
        const actorRole = await getRole(roomId, actorUserId);
        if (!hasAtLeastRole(actorRole, 'admin')) {
            cb?.({ ok: false, error: 'Permission denied' });
            return;
        }
        try {
            const room = await Room_1.default.findOne({ roomId });
            if (!room) {
                cb?.({ ok: false, error: 'Room not found' });
                return;
            }
            const tid = String(targetUserId);
            room.participants = room.participants.filter((p) => (p.user?.toString?.() || String(p.user)) !== tid);
            await room.save();
            if (rooms.has(roomId))
                rooms.get(roomId).delete(tid);
            if (roomRoles.has(roomId))
                roomRoles.get(roomId).delete(tid);
            const targetSocketId = userSockets.get(tid);
            if (targetSocketId) {
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.emit('kicked', { roomId });
                    targetSocket.leave(roomId);
                }
            }
            io.to(roomId).emit('user-kicked', { userId: tid });
            socket.to(roomId).emit('user-left', { userId: tid });
            await (0, logRoomActivity_1.logRoomActivity)({
                roomId,
                actorId: actorUserId,
                actorUsername: socket.data.username || '',
                type: 'kick',
                message: `${socket.data.username || 'Admin'} removed a user from the room`,
                meta: { targetUserId: tid }
            });
            io.to(roomId).emit('room-activity', {
                type: 'kick',
                message: `${socket.data.username || 'Admin'} removed a user from the room`,
                actorUsername: socket.data.username || 'Admin',
                createdAt: new Date().toISOString(),
                meta: { targetUserId: tid }
            });
            cb?.({ ok: true });
        }
        catch (e) {
            cb?.({ ok: false, error: 'Server error' });
        }
    });
    // Files updated
    socket.on('files-updated', (data) => {
        const { roomId } = data;
        io.to(roomId).emit('files-updated');
    });
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const [roomId, users] of rooms.entries()) {
            for (const userId of users) {
                if (userSockets.get(String(userId)) === socket.id) {
                    users.delete(userId);
                    if (roomRoles.has(roomId)) {
                        roomRoles.get(roomId).delete(String(userId));
                        if (roomRoles.get(roomId).size === 0)
                            roomRoles.delete(roomId);
                    }
                    userSockets.delete(String(userId));
                    if (filePresence.has(roomId)) {
                        for (const [fid, usersMap] of filePresence.get(roomId).entries()) {
                            usersMap.delete(String(userId));
                            io.to(roomId).emit('file-presence', { fileId: fid, users: Array.from(usersMap.entries()).map(([id, u]) => ({ userId: id, ...u })) });
                            if (usersMap.size === 0)
                                filePresence.get(roomId).delete(fid);
                        }
                        if (filePresence.get(roomId).size === 0)
                            filePresence.delete(roomId);
                    }
                    socket.to(roomId).emit('user-left', { userId });
                    break;
                }
            }
        }
    });
});
const PORT = process.env.PORT || 5008;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
