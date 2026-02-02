import express from 'express';
import { body, validationResult } from 'express-validator';
import archiver from 'archiver';
import Repository from '../models/Repository';
import File from '../models/File';
import User from '../models/User';
import { auth, checkRepositoryAccess } from '../middleware/auth';

const router = express.Router();

// Get all repositories for the current user
router.get('/', auth, async (req, res) => {
  try {
    const repositories = await Repository.find({
      $or: [{ owner: (req as any).user._id }, { collaborators: { $elemMatch: { user: (req as any).user._id } } }]
    })
      .populate('owner', 'username')
      .populate('collaborators.user', 'username')
      .sort({ updatedAt: -1 });

    res.json({ repositories });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new repository
router.post(
  '/',
  auth,
  [body('name').isLength({ min: 1, max: 100 }).trim().escape(), body('description').optional().isLength({ max: 500 }).trim().escape()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, description, isPublic, language } = req.body as any;

      // Check if repository name already exists for this user
      const existingRepo = await Repository.findOne({
        name,
        owner: (req as any).user._id
      });

      if (existingRepo) {
        return res.status(400).json({ message: 'Repository with this name already exists' });
      }

      const repository = new Repository({
        name,
        description,
        owner: (req as any).user._id,
        isPublic: isPublic || false,
        language: language || 'javascript'
      });

      await repository.save();

      // Create a default README file
      const readmeFile = new File({
        name: 'README.md',
        path: 'README.md',
        content: `# ${name}\n\n${description || 'A new repository'}\n\nCreated by ${(req as any).user.username}`,
        language: 'markdown',
        repository: (repository as any)._id,
        isFolder: false,
        createdBy: (req as any).user._id
      });

      await readmeFile.save();

      const populatedRepo = await Repository.findById((repository as any)._id).populate('owner', 'username');

      res.status(201).json({
        message: 'Repository created successfully',
        repository: populatedRepo
      });
    } catch (error) {
      console.error('Create repository error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get repository by ID
router.get('/:id', auth, checkRepositoryAccess('viewer'), async (req, res) => {
  try {
    const repository = await Repository.findById((req as any).params.id)
      .populate('owner', 'username')
      .populate('collaborators.user', 'username');

    if (!repository) {
      return res.status(404).json({ message: 'Repository not found' });
    }

    res.json({ repository });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update repository
router.put(
  '/:id',
  auth,
  checkRepositoryAccess('admin'),
  [body('name').optional().isLength({ min: 1, max: 100 }).trim().escape(), body('description').optional().isLength({ max: 500 }).trim().escape()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const updates: any = {};
      const allowedUpdates = ['name', 'description', 'isPublic', 'language'];

      allowedUpdates.forEach((field) => {
        if ((req.body as any)[field] !== undefined) {
          updates[field] = (req.body as any)[field];
        }
      });

      // Check if new name conflicts with existing repository
      if (updates.name) {
        const existingRepo = await Repository.findOne({
          name: updates.name,
          owner: (req as any).repository.owner,
          _id: { $ne: (req as any).params.id }
        });

        if (existingRepo) {
          return res.status(400).json({ message: 'Repository with this name already exists' });
        }
      }

      const repository = await Repository.findByIdAndUpdate(
        (req as any).params.id,
        { ...updates, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).populate('owner', 'username');

      res.json({
        message: 'Repository updated successfully',
        repository
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete repository
router.delete('/:id', auth, checkRepositoryAccess('admin'), async (req, res) => {
  try {
    // Delete all files in the repository
    await File.deleteMany({ repository: (req as any).params.id });

    // Delete the repository
    await Repository.findByIdAndDelete((req as any).params.id);

    res.json({ message: 'Repository deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add collaborator to repository
router.post(
  '/:id/collaborators',
  auth,
  checkRepositoryAccess('admin'),
  [body('userId').optional().isMongoId(), body('email').optional().isEmail(), body('role').optional().isIn(['viewer', 'editor', 'admin'])],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { userId, email, role = 'viewer' } = req.body as any;

      if (!userId && !email) {
        return res.status(400).json({ message: 'userId or email is required' });
      }

      // Check if user exists
      let user: any = null;
      if (userId) {
        user = await User.findById(userId);
      } else if (email) {
        user = await User.findOne({ email: String(email).toLowerCase().trim() });
      }
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Check if user is already a collaborator
      const existingCollaborator = (req as any).repository.collaborators.find((collab: any) => collab.user.toString() === user._id.toString());

      if (existingCollaborator) {
        return res.status(400).json({ message: 'User is already a collaborator' });
      }

      // Add collaborator
      (req as any).repository.collaborators.push({
        user: user._id,
        role
      });

      await (req as any).repository.save();

      const updatedRepo = await Repository.findById((req as any).params.id)
        .populate('owner', 'username')
        .populate('collaborators.user', 'username');

      res.json({
        message: 'Collaborator added successfully',
        repository: updatedRepo
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Remove collaborator from repository
router.delete('/:id/collaborators/:userId', auth, checkRepositoryAccess('admin'), async (req, res) => {
  try {
    const { userId } = (req as any).params;

    // Remove collaborator
    (req as any).repository.collaborators = (req as any).repository.collaborators.filter((collab: any) => collab.user.toString() !== userId);

    await (req as any).repository.save();

    const updatedRepo = await Repository.findById((req as any).params.id)
      .populate('owner', 'username')
      .populate('collaborators.user', 'username');

    res.json({
      message: 'Collaborator removed successfully',
      repository: updatedRepo
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Download repository as ZIP
router.get('/:id/download', auth, checkRepositoryAccess('viewer'), async (req, res) => {
  try {
    const files = await File.find({ repository: (req as any).params.id });

    if (!files || files.length === 0) {
      return res.status(404).json({ message: 'No files found in this repository' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="repository_${(req as any).params.id}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).end();
    });

    archive.pipe(res);

    // Add files to archive
    files.forEach((file: any) => {
      const filePath = file.path || file.name;
      if (file.isFolder) {
        archive.append('', { name: `${filePath}/` }); // ensure folder entry
      } else {
        archive.append(file.content || '', { name: filePath });
      }
    });

    archive.finalize();
  } catch (error) {
    console.error('Download ZIP error:', error);
    res.status(500).json({ message: 'Failed to generate ZIP' });
  }
});

export default router;



