"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRepositoryAccess = exports.checkRole = exports.auth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const Repository_1 = __importDefault(require("../models/Repository"));
const File_1 = __importDefault(require("../models/File"));
const Room_1 = __importDefault(require("../models/Room"));
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ message: 'No authentication token provided' });
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User_1.default.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }
        req.user = user;
        req.token = token;
        next();
    }
    catch (error) {
        res.status(401).json({ message: 'Invalid authentication token' });
    }
};
exports.auth = auth;
const checkRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }
        next();
    };
};
exports.checkRole = checkRole;
const checkRepositoryAccess = (requiredRole = 'viewer') => {
    return async (req, res, next) => {
        try {
            let repositoryId = req.params.repositoryId ||
                req.params.id ||
                req.body.repositoryId ||
                req.query.repositoryId;
            const fileId = req.params.fileId || req.params.id;
            // Try to resolve repository from file if not provided
            if (!repositoryId && fileId) {
                try {
                    const file = await File_1.default.findById(fileId);
                    if (file) {
                        repositoryId = file.repository;
                    }
                }
                catch (e) {
                    // ignore
                }
            }
            if (!repositoryId) {
                return res.status(400).json({ message: 'Repository ID required' });
            }
            let repository = await Repository_1.default.findById(repositoryId);
            // If not found, repositoryId might be a File id; resolve it
            if (!repository && repositoryId) {
                try {
                    const file = await File_1.default.findById(repositoryId);
                    if (file) {
                        repositoryId = file.repository;
                        repository = await Repository_1.default.findById(repositoryId);
                    }
                }
                catch (e) {
                    // ignore and fall through
                }
            }
            if (!repository) {
                return res.status(404).json({ message: 'Repository not found' });
            }
            const user = req.user;
            // Check if user is owner
            if (repository.owner.toString() === user._id.toString()) {
                req.userRepositoryRole = 'admin'; // Owner has admin privileges
                req.repository = repository;
                return next();
            }
            // Check if user is a collaborator
            const collaborator = repository.collaborators.find((collab) => collab.user.toString() === user._id.toString());
            // If not collaborator, allow if user is an active participant of a room on this repo
            let participantRole = null;
            if (!collaborator) {
                const activeRoom = await Room_1.default.findOne({
                    repository: repository._id,
                    isActive: true,
                    'participants.user': user._id
                });
                if (activeRoom) {
                    const participant = activeRoom.participants.find((p) => p.user.toString() === user._id.toString());
                    participantRole = participant?.role || 'viewer';
                }
            }
            // Determine effective role (prefer collaborator role, else participant)
            const effectiveRole = collaborator?.role || participantRole;
            if (!effectiveRole) {
                return res.status(403).json({ message: 'Access denied to this repository' });
            }
            // Check role hierarchy: admin > editor > viewer
            const roleHierarchy = { admin: 3, editor: 2, viewer: 1 };
            const requiredLevel = roleHierarchy[requiredRole] || 1;
            const userLevel = roleHierarchy[effectiveRole] || 1;
            if (userLevel < requiredLevel) {
                return res.status(403).json({ message: 'Insufficient permissions for this action' });
            }
            req.userRepositoryRole = effectiveRole;
            req.repository = repository;
            next();
        }
        catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    };
};
exports.checkRepositoryAccess = checkRepositoryAccess;
