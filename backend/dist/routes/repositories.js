"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const archiver_1 = __importDefault(require("archiver"));
const Repository_1 = __importDefault(require("../models/Repository"));
const File_1 = __importDefault(require("../models/File"));
const User_1 = __importDefault(require("../models/User"));
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Get all repositories for the current user
router.get('/', auth_1.auth, async (req, res) => {
    try {
        const repositories = await Repository_1.default.find({
            $or: [{ owner: req.user._id }, { collaborators: { $elemMatch: { user: req.user._id } } }]
        })
            .populate('owner', 'username')
            .populate('collaborators.user', 'username')
            .sort({ updatedAt: -1 });
        res.json({ repositories });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Create a new repository
router.post('/', auth_1.auth, [(0, express_validator_1.body)('name').isLength({ min: 1, max: 100 }).trim().escape(), (0, express_validator_1.body)('description').optional().isLength({ max: 500 }).trim().escape()], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { name, description, isPublic, language } = req.body;
        // Check if repository name already exists for this user
        const existingRepo = await Repository_1.default.findOne({
            name,
            owner: req.user._id
        });
        if (existingRepo) {
            return res.status(400).json({ message: 'Repository with this name already exists' });
        }
        const repository = new Repository_1.default({
            name,
            description,
            owner: req.user._id,
            isPublic: isPublic || false,
            language: language || 'javascript'
        });
        await repository.save();
        // Create a default README file
        const readmeFile = new File_1.default({
            name: 'README.md',
            path: 'README.md',
            content: `# ${name}\n\n${description || 'A new repository'}\n\nCreated by ${req.user.username}`,
            language: 'markdown',
            repository: repository._id,
            isFolder: false,
            createdBy: req.user._id
        });
        await readmeFile.save();
        const populatedRepo = await Repository_1.default.findById(repository._id).populate('owner', 'username');
        res.status(201).json({
            message: 'Repository created successfully',
            repository: populatedRepo
        });
    }
    catch (error) {
        console.error('Create repository error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
// Get repository by ID
router.get('/:id', auth_1.auth, (0, auth_1.checkRepositoryAccess)('viewer'), async (req, res) => {
    try {
        const repository = await Repository_1.default.findById(req.params.id)
            .populate('owner', 'username')
            .populate('collaborators.user', 'username');
        if (!repository) {
            return res.status(404).json({ message: 'Repository not found' });
        }
        res.json({ repository });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Update repository
router.put('/:id', auth_1.auth, (0, auth_1.checkRepositoryAccess)('admin'), [(0, express_validator_1.body)('name').optional().isLength({ min: 1, max: 100 }).trim().escape(), (0, express_validator_1.body)('description').optional().isLength({ max: 500 }).trim().escape()], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const updates = {};
        const allowedUpdates = ['name', 'description', 'isPublic', 'language'];
        allowedUpdates.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });
        // Check if new name conflicts with existing repository
        if (updates.name) {
            const existingRepo = await Repository_1.default.findOne({
                name: updates.name,
                owner: req.repository.owner,
                _id: { $ne: req.params.id }
            });
            if (existingRepo) {
                return res.status(400).json({ message: 'Repository with this name already exists' });
            }
        }
        const repository = await Repository_1.default.findByIdAndUpdate(req.params.id, { ...updates, updatedAt: new Date() }, { new: true, runValidators: true }).populate('owner', 'username');
        res.json({
            message: 'Repository updated successfully',
            repository
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Delete repository
router.delete('/:id', auth_1.auth, (0, auth_1.checkRepositoryAccess)('admin'), async (req, res) => {
    try {
        // Delete all files in the repository
        await File_1.default.deleteMany({ repository: req.params.id });
        // Delete the repository
        await Repository_1.default.findByIdAndDelete(req.params.id);
        res.json({ message: 'Repository deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Add collaborator to repository
router.post('/:id/collaborators', auth_1.auth, (0, auth_1.checkRepositoryAccess)('admin'), [(0, express_validator_1.body)('userId').optional().isMongoId(), (0, express_validator_1.body)('email').optional().isEmail(), (0, express_validator_1.body)('role').optional().isIn(['viewer', 'editor', 'admin'])], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { userId, email, role = 'viewer' } = req.body;
        if (!userId && !email) {
            return res.status(400).json({ message: 'userId or email is required' });
        }
        // Check if user exists
        let user = null;
        if (userId) {
            user = await User_1.default.findById(userId);
        }
        else if (email) {
            user = await User_1.default.findOne({ email: String(email).toLowerCase().trim() });
        }
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Check if user is already a collaborator
        const existingCollaborator = req.repository.collaborators.find((collab) => collab.user.toString() === user._id.toString());
        if (existingCollaborator) {
            return res.status(400).json({ message: 'User is already a collaborator' });
        }
        // Add collaborator
        req.repository.collaborators.push({
            user: user._id,
            role
        });
        await req.repository.save();
        const updatedRepo = await Repository_1.default.findById(req.params.id)
            .populate('owner', 'username')
            .populate('collaborators.user', 'username');
        res.json({
            message: 'Collaborator added successfully',
            repository: updatedRepo
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Remove collaborator from repository
router.delete('/:id/collaborators/:userId', auth_1.auth, (0, auth_1.checkRepositoryAccess)('admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        // Remove collaborator
        req.repository.collaborators = req.repository.collaborators.filter((collab) => collab.user.toString() !== userId);
        await req.repository.save();
        const updatedRepo = await Repository_1.default.findById(req.params.id)
            .populate('owner', 'username')
            .populate('collaborators.user', 'username');
        res.json({
            message: 'Collaborator removed successfully',
            repository: updatedRepo
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Download repository as ZIP
router.get('/:id/download', auth_1.auth, (0, auth_1.checkRepositoryAccess)('viewer'), async (req, res) => {
    try {
        const files = await File_1.default.find({ repository: req.params.id });
        if (!files || files.length === 0) {
            return res.status(404).json({ message: 'No files found in this repository' });
        }
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="repository_${req.params.id}.zip"`);
        const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
        archive.on('error', (err) => {
            console.error('Archive error:', err);
            res.status(500).end();
        });
        archive.pipe(res);
        // Add files to archive
        files.forEach((file) => {
            const filePath = file.path || file.name;
            if (file.isFolder) {
                archive.append('', { name: `${filePath}/` }); // ensure folder entry
            }
            else {
                archive.append(file.content || '', { name: filePath });
            }
        });
        archive.finalize();
    }
    catch (error) {
        console.error('Download ZIP error:', error);
        res.status(500).json({ message: 'Failed to generate ZIP' });
    }
});
exports.default = router;
