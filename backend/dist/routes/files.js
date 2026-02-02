"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const crypto_1 = __importDefault(require("crypto"));
const File_1 = __importDefault(require("../models/File"));
const FileRevision_1 = __importDefault(require("../models/FileRevision"));
const auth_1 = require("../middleware/auth");
const logRoomActivity_1 = require("../utils/logRoomActivity");
const socket_1 = require("../socket");
const router = express_1.default.Router();
// Get all files for a repository
router.get('/repository/:repositoryId', auth_1.auth, (0, auth_1.checkRepositoryAccess)('viewer'), async (req, res) => {
    try {
        const files = await File_1.default.find({ repository: req.params.repositoryId })
            .populate('createdBy', 'username')
            .populate('lastModifiedBy', 'username')
            .sort({ isFolder: -1, name: 1 }); // Folders first, then alphabetical
        // Build file tree structure
        const fileTree = buildFileTree(files);
        res.json({ files: fileTree });
    }
    catch (error) {
        console.error('Create file error:', error);
        res.status(500).json({ message: 'Server error creating file' });
    }
});
// Get file history (latest revisions)
router.get('/:id/history', auth_1.auth, (0, auth_1.checkRepositoryAccess)('viewer'), async (req, res) => {
    try {
        const file = await File_1.default.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }
        // Ensure file belongs to the repository the user has access to
        if (file.repository.toString() !== req.repository._id.toString()) {
            return res.status(403).json({ message: 'File does not belong to this repository' });
        }
        const limit = Math.min(Number(req.query.limit) || 30, 100);
        const revisions = await FileRevision_1.default.find({ file: file._id })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('createdBy', 'username');
        res.json({ revisions });
    }
    catch (error) {
        console.error('Get file history error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
// Get single file
router.get('/:id', auth_1.auth, (0, auth_1.checkRepositoryAccess)('viewer'), async (req, res) => {
    try {
        const file = await File_1.default.findById(req.params.id).populate('createdBy', 'username').populate('lastModifiedBy', 'username');
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }
        res.json({ file });
    }
    catch (error) {
        console.error('Get file error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
// Create new file or folder
router.post('/', auth_1.auth, (0, auth_1.checkRepositoryAccess)('editor'), [
    (0, express_validator_1.body)('repositoryId').isMongoId().withMessage('repositoryId is required'),
    (0, express_validator_1.body)('name').isLength({ min: 1, max: 255 }).trim().escape(),
    (0, express_validator_1.body)('content').optional().isString(),
    (0, express_validator_1.body)('language').optional().isString(),
    (0, express_validator_1.body)('isFolder').optional().isBoolean(),
    (0, express_validator_1.body)('parentFolder').optional({ nullable: true, checkFalsy: true }).isMongoId()
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array(), message: 'Invalid input' });
        }
        const { name, content, language, isFolder, parentFolder, roomId } = req.body;
        const repositoryId = req.repository._id;
        // Check if file/folder with same name exists in the same directory
        const existingFile = await File_1.default.findOne({
            repository: repositoryId,
            name,
            parentFolder: parentFolder || null
        });
        if (existingFile) {
            return res.status(400).json({ message: 'File or folder with this name already exists' });
        }
        // Validate parent folder if provided
        if (parentFolder) {
            const parent = await File_1.default.findById(parentFolder);
            if (!parent || !parent.isFolder || parent.repository.toString() !== repositoryId.toString()) {
                return res.status(400).json({ message: 'Invalid parent folder' });
            }
        }
        // Generate path
        let path = name;
        if (parentFolder) {
            const parent = await File_1.default.findById(parentFolder);
            if (parent && parent.isFolder) {
                path = `${parent.path}/${name}`;
            }
        }
        const file = new File_1.default({
            name,
            path,
            content: content || '',
            language: language || 'javascript',
            repository: repositoryId,
            parentFolder: parentFolder || null,
            isFolder,
            createdBy: req.user._id,
            lastModifiedBy: req.user._id
        });
        await file.save();
        if (roomId) {
            await (0, logRoomActivity_1.logRoomActivity)({
                roomId,
                actorId: req.user._id,
                actorUsername: req.user.username,
                type: isFolder ? 'folder_create' : 'file_create',
                message: `${req.user.username} created ${isFolder ? 'folder' : 'file'}: ${path}`,
                meta: { fileId: file._id.toString(), path }
            });
            const io = (0, socket_1.getIO)();
            io?.to(roomId)?.emit('room-activity', {
                type: isFolder ? 'folder_create' : 'file_create',
                message: `${req.user.username} created ${isFolder ? 'folder' : 'file'}: ${path}`,
                actorUsername: req.user.username,
                createdAt: new Date().toISOString(),
                meta: { fileId: file._id.toString(), path }
            });
        }
        res.status(201).json({
            message: 'File created successfully',
            file: {
                _id: file._id,
                name: file.name,
                path: file.path,
                isFolder: file.isFolder,
                language: file.language,
                parentFolder: file.parentFolder,
                repository: file.repository
            }
        });
    }
    catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
// Update file content
router.put('/:id', auth_1.auth, (0, auth_1.checkRepositoryAccess)('editor'), [(0, express_validator_1.body)('content').optional().isString(), (0, express_validator_1.body)('language').optional().isString(), (0, express_validator_1.body)('name').optional().isLength({ min: 1, max: 255 }).trim().escape(), (0, express_validator_1.body)('parentFolder').optional({ nullable: true, checkFalsy: true }).isMongoId()], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const file = await File_1.default.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }
        const prevContent = file.content || '';
        // Check if file belongs to the repository
        if (file.repository.toString() !== req.repository._id.toString()) {
            return res.status(403).json({ message: 'File does not belong to this repository' });
        }
        const updates = {};
        const allowedUpdates = ['content', 'language', 'name', 'parentFolder'];
        allowedUpdates.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });
        // Validate parent folder if provided
        if (updates.parentFolder !== undefined) {
            if (!updates.parentFolder) {
                updates.parentFolder = null;
            }
            else {
                const parent = await File_1.default.findById(updates.parentFolder);
                if (!parent || !parent.isFolder || parent.repository.toString() !== req.repository._id.toString()) {
                    return res.status(400).json({ message: 'Invalid parent folder' });
                }
                // Prevent moving a folder into its own subtree
                if (file.isFolder && parent.path.startsWith(file.path)) {
                    return res.status(400).json({ message: 'Cannot move a folder into its own descendant' });
                }
            }
        }
        // Update path if name or parent changed
        const newName = updates.name || file.name;
        let newPath = file.path;
        if (updates.parentFolder !== undefined || updates.name) {
            let basePath = '';
            if (updates.parentFolder) {
                const parent = await File_1.default.findById(updates.parentFolder);
                basePath = parent ? parent.path : '';
            }
            else if (file.parentFolder) {
                const parent = await File_1.default.findById(file.parentFolder);
                basePath = parent ? parent.path : '';
            }
            newPath = basePath ? `${basePath}/${newName}` : newName;
            updates.path = newPath;
        }
        updates.lastModifiedBy = req.user._id;
        const updatedFile = await File_1.default.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
            .populate('createdBy', 'username')
            .populate('lastModifiedBy', 'username');
        const roomId = req.body.roomId;
        // Store history snapshot when content changes
        if (updates.content !== undefined && String(updatedFile.content || '') !== String(prevContent)) {
            const contentToHash = String(updatedFile.content || '');
            const hash = crypto_1.default.createHash('sha1').update(contentToHash, 'utf8').digest('hex');
            await FileRevision_1.default.create({
                file: updatedFile._id,
                repository: updatedFile.repository,
                createdBy: req.user._id,
                content: contentToHash,
                contentHash: hash,
                language: updatedFile.language,
                name: updatedFile.name,
                path: updatedFile.path
            });
            if (roomId) {
                await (0, logRoomActivity_1.logRoomActivity)({
                    roomId,
                    actorId: req.user._id,
                    actorUsername: req.user.username,
                    type: 'file_edit',
                    message: `${req.user.username} edited file: ${updatedFile.path}`,
                    meta: { fileId: updatedFile._id.toString(), path: updatedFile.path }
                });
                const io = (0, socket_1.getIO)();
                io?.to(roomId)?.emit('room-activity', {
                    type: 'file_edit',
                    message: `${req.user.username} edited file: ${updatedFile.path}`,
                    actorUsername: req.user.username,
                    createdAt: new Date().toISOString(),
                    meta: { fileId: updatedFile._id.toString(), path: updatedFile.path }
                });
            }
            // Retain last 50 revisions per file
            const toDelete = await FileRevision_1.default.find({ file: updatedFile._id }).sort({ createdAt: -1 }).skip(50).select('_id');
            if (toDelete.length) {
                await FileRevision_1.default.deleteMany({ _id: { $in: toDelete.map((d) => d._id) } });
            }
        }
        // Log rename/move (if name/parent/path changed and no content change)
        if (roomId && updates.content === undefined && (updates.name || updates.parentFolder !== undefined || updates.path)) {
            await (0, logRoomActivity_1.logRoomActivity)({
                roomId,
                actorId: req.user._id,
                actorUsername: req.user.username,
                type: 'file_rename_move',
                message: `${req.user.username} renamed/moved: ${updatedFile.path}`,
                meta: { fileId: updatedFile._id.toString(), path: updatedFile.path }
            });
            const io = (0, socket_1.getIO)();
            io?.to(roomId)?.emit('room-activity', {
                type: 'file_rename_move',
                message: `${req.user.username} renamed/moved: ${updatedFile.path}`,
                actorUsername: req.user.username,
                createdAt: new Date().toISOString(),
                meta: { fileId: updatedFile._id.toString(), path: updatedFile.path }
            });
        }
        res.json({
            message: 'File updated successfully',
            file: updatedFile
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Delete file or folder
router.delete('/:id', auth_1.auth, (0, auth_1.checkRepositoryAccess)('editor'), async (req, res) => {
    try {
        const roomId = req.body?.roomId || req.query?.roomId;
        const file = await File_1.default.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }
        // Check if file belongs to the repository
        if (file.repository.toString() !== req.repository._id.toString()) {
            return res.status(403).json({ message: 'File does not belong to this repository' });
        }
        // If it's a folder, delete all children recursively
        if (file.isFolder) {
            await deleteFolderRecursively(file._id);
        }
        await File_1.default.findByIdAndDelete(req.params.id);
        if (roomId) {
            await (0, logRoomActivity_1.logRoomActivity)({
                roomId,
                actorId: req.user._id,
                actorUsername: req.user.username,
                type: file.isFolder ? 'folder_delete' : 'file_delete',
                message: `${req.user.username} deleted ${file.isFolder ? 'folder' : 'file'}: ${file.path}`,
                meta: { fileId: file._id.toString(), path: file.path }
            });
            const io = (0, socket_1.getIO)();
            io?.to(roomId)?.emit('room-activity', {
                type: file.isFolder ? 'folder_delete' : 'file_delete',
                message: `${req.user.username} deleted ${file.isFolder ? 'folder' : 'file'}: ${file.path}`,
                actorUsername: req.user.username,
                createdAt: new Date().toISOString(),
                meta: { fileId: file._id.toString(), path: file.path }
            });
        }
        res.json({ message: 'File deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Helper function to build file tree
function buildFileTree(files) {
    const fileMap = new Map();
    const rootFiles = [];
    // Create file map
    files.forEach((file) => {
        fileMap.set(file._id.toString(), { ...file.toObject(), children: [] });
    });
    // Build tree structure
    files.forEach((file) => {
        const fileObj = fileMap.get(file._id.toString());
        if (file.parentFolder) {
            const parent = fileMap.get(file.parentFolder.toString());
            if (parent) {
                parent.children.push(fileObj);
            }
        }
        else {
            rootFiles.push(fileObj);
        }
    });
    return rootFiles;
}
// Helper function to delete folder recursively
async function deleteFolderRecursively(folderId) {
    const children = await File_1.default.find({ parentFolder: folderId });
    for (const child of children) {
        if (child.isFolder) {
            await deleteFolderRecursively(child._id);
        }
        await File_1.default.findByIdAndDelete(child._id);
    }
}
exports.default = router;
