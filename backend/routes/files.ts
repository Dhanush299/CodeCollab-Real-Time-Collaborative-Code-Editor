import express from 'express';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import File from '../models/File';
import FileRevision from '../models/FileRevision';
import { auth, checkRepositoryAccess } from '../middleware/auth';
import { logRoomActivity } from '../utils/logRoomActivity';
import { getIO } from '../socket';

const router = express.Router();

// Get all files for a repository
router.get('/repository/:repositoryId', auth, checkRepositoryAccess('viewer'), async (req, res) => {
  try {
    const files = await File.find({ repository: (req as any).params.repositoryId })
      .populate('createdBy', 'username')
      .populate('lastModifiedBy', 'username')
      .sort({ isFolder: -1, name: 1 }); // Folders first, then alphabetical

    // Build file tree structure
    const fileTree = buildFileTree(files as any[]);

    res.json({ files: fileTree });
  } catch (error) {
    console.error('Create file error:', error);
    res.status(500).json({ message: 'Server error creating file' });
  }
});

// Get file history (latest revisions)
router.get('/:id/history', auth, checkRepositoryAccess('viewer'), async (req, res) => {
  try {
    const file: any = await File.findById((req as any).params.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    // Ensure file belongs to the repository the user has access to
    if (file.repository.toString() !== (req as any).repository._id.toString()) {
      return res.status(403).json({ message: 'File does not belong to this repository' });
    }

    const limit = Math.min(Number((req as any).query.limit) || 30, 100);
    const revisions = await FileRevision.find({ file: file._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('createdBy', 'username');

    res.json({ revisions });
  } catch (error) {
    console.error('Get file history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single file
router.get('/:id', auth, checkRepositoryAccess('viewer'), async (req, res) => {
  try {
    const file = await File.findById((req as any).params.id).populate('createdBy', 'username').populate('lastModifiedBy', 'username');

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.json({ file });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new file or folder
router.post(
  '/',
  auth,
  checkRepositoryAccess('editor'),
  [
    body('repositoryId').isMongoId().withMessage('repositoryId is required'),
    body('name').isLength({ min: 1, max: 255 }).trim().escape(),
    body('content').optional().isString(),
    body('language').optional().isString(),
    body('isFolder').optional().isBoolean(),
    body('parentFolder').optional({ nullable: true, checkFalsy: true }).isMongoId()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array(), message: 'Invalid input' });
      }

      const { name, content, language, isFolder, parentFolder, roomId } = req.body as any;
      const repositoryId = (req as any).repository._id;

      // Check if file/folder with same name exists in the same directory
      const existingFile = await File.findOne({
        repository: repositoryId,
        name,
        parentFolder: parentFolder || null
      });

      if (existingFile) {
        return res.status(400).json({ message: 'File or folder with this name already exists' });
      }

      // Validate parent folder if provided
      if (parentFolder) {
        const parent: any = await File.findById(parentFolder);
        if (!parent || !parent.isFolder || parent.repository.toString() !== repositoryId.toString()) {
          return res.status(400).json({ message: 'Invalid parent folder' });
        }
      }

      // Generate path
      let path = name;
      if (parentFolder) {
        const parent: any = await File.findById(parentFolder);
        if (parent && parent.isFolder) {
          path = `${parent.path}/${name}`;
        }
      }

      const file: any = new File({
        name,
        path,
        content: content || '',
        language: language || 'javascript',
        repository: repositoryId,
        parentFolder: parentFolder || null,
        isFolder,
        createdBy: (req as any).user._id,
        lastModifiedBy: (req as any).user._id
      });

      await file.save();

      if (roomId) {
        await logRoomActivity({
          roomId,
          actorId: (req as any).user._id,
          actorUsername: (req as any).user.username,
          type: isFolder ? 'folder_create' : 'file_create',
          message: `${(req as any).user.username} created ${isFolder ? 'folder' : 'file'}: ${path}`,
          meta: { fileId: file._id.toString(), path }
        });
        const io = getIO();
        io?.to(roomId)?.emit('room-activity', {
          type: isFolder ? 'folder_create' : 'file_create',
          message: `${(req as any).user.username} created ${isFolder ? 'folder' : 'file'}: ${path}`,
          actorUsername: (req as any).user.username,
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
    } catch (error) {
      console.error('Delete file error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update file content
router.put(
  '/:id',
  auth,
  checkRepositoryAccess('editor'),
  [body('content').optional().isString(), body('language').optional().isString(), body('name').optional().isLength({ min: 1, max: 255 }).trim().escape(), body('parentFolder').optional({ nullable: true, checkFalsy: true }).isMongoId()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const file: any = await File.findById((req as any).params.id);
      if (!file) {
        return res.status(404).json({ message: 'File not found' });
      }
      const prevContent = file.content || '';

      // Check if file belongs to the repository
      if (file.repository.toString() !== (req as any).repository._id.toString()) {
        return res.status(403).json({ message: 'File does not belong to this repository' });
      }

      const updates: any = {};
      const allowedUpdates = ['content', 'language', 'name', 'parentFolder'];

      allowedUpdates.forEach((field) => {
        if ((req.body as any)[field] !== undefined) {
          updates[field] = (req.body as any)[field];
        }
      });

      // Validate parent folder if provided
      if (updates.parentFolder !== undefined) {
        if (!updates.parentFolder) {
          updates.parentFolder = null;
        } else {
          const parent: any = await File.findById(updates.parentFolder);
          if (!parent || !parent.isFolder || parent.repository.toString() !== (req as any).repository._id.toString()) {
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
          const parent: any = await File.findById(updates.parentFolder);
          basePath = parent ? parent.path : '';
        } else if (file.parentFolder) {
          const parent: any = await File.findById(file.parentFolder);
          basePath = parent ? parent.path : '';
        }
        newPath = basePath ? `${basePath}/${newName}` : newName;
        updates.path = newPath;
      }

      updates.lastModifiedBy = (req as any).user._id;

      const updatedFile: any = await File.findByIdAndUpdate((req as any).params.id, updates, { new: true, runValidators: true })
        .populate('createdBy', 'username')
        .populate('lastModifiedBy', 'username');

      const roomId = (req.body as any).roomId;

      // Store history snapshot when content changes
      if (updates.content !== undefined && String(updatedFile.content || '') !== String(prevContent)) {
        const contentToHash = String(updatedFile.content || '');
        const hash = crypto.createHash('sha1').update(contentToHash, 'utf8').digest('hex');
        await FileRevision.create({
          file: updatedFile._id,
          repository: updatedFile.repository,
          createdBy: (req as any).user._id,
          content: contentToHash,
          contentHash: hash,
          language: updatedFile.language,
          name: updatedFile.name,
          path: updatedFile.path
        });

        if (roomId) {
          await logRoomActivity({
            roomId,
            actorId: (req as any).user._id,
            actorUsername: (req as any).user.username,
            type: 'file_edit',
            message: `${(req as any).user.username} edited file: ${updatedFile.path}`,
            meta: { fileId: updatedFile._id.toString(), path: updatedFile.path }
          });
          const io = getIO();
          io?.to(roomId)?.emit('room-activity', {
            type: 'file_edit',
            message: `${(req as any).user.username} edited file: ${updatedFile.path}`,
            actorUsername: (req as any).user.username,
            createdAt: new Date().toISOString(),
            meta: { fileId: updatedFile._id.toString(), path: updatedFile.path }
          });
        }

        // Retain last 50 revisions per file
        const toDelete = await FileRevision.find({ file: updatedFile._id }).sort({ createdAt: -1 }).skip(50).select('_id');
        if (toDelete.length) {
          await FileRevision.deleteMany({ _id: { $in: toDelete.map((d: any) => d._id) } });
        }
      }

      // Log rename/move (if name/parent/path changed and no content change)
      if (roomId && updates.content === undefined && (updates.name || updates.parentFolder !== undefined || updates.path)) {
        await logRoomActivity({
          roomId,
          actorId: (req as any).user._id,
          actorUsername: (req as any).user.username,
          type: 'file_rename_move',
          message: `${(req as any).user.username} renamed/moved: ${updatedFile.path}`,
          meta: { fileId: updatedFile._id.toString(), path: updatedFile.path }
        });
        const io = getIO();
        io?.to(roomId)?.emit('room-activity', {
          type: 'file_rename_move',
          message: `${(req as any).user.username} renamed/moved: ${updatedFile.path}`,
          actorUsername: (req as any).user.username,
          createdAt: new Date().toISOString(),
          meta: { fileId: updatedFile._id.toString(), path: updatedFile.path }
        });
      }

      res.json({
        message: 'File updated successfully',
        file: updatedFile
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete file or folder
router.delete('/:id', auth, checkRepositoryAccess('editor'), async (req, res) => {
  try {
    const roomId = (req.body as any)?.roomId || (req.query as any)?.roomId;
    const file: any = await File.findById((req as any).params.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if file belongs to the repository
    if (file.repository.toString() !== (req as any).repository._id.toString()) {
      return res.status(403).json({ message: 'File does not belong to this repository' });
    }

    // If it's a folder, delete all children recursively
    if (file.isFolder) {
      await deleteFolderRecursively(file._id);
    }

    await File.findByIdAndDelete((req as any).params.id);

    if (roomId) {
      await logRoomActivity({
        roomId,
        actorId: (req as any).user._id,
        actorUsername: (req as any).user.username,
        type: file.isFolder ? 'folder_delete' : 'file_delete',
        message: `${(req as any).user.username} deleted ${file.isFolder ? 'folder' : 'file'}: ${file.path}`,
        meta: { fileId: file._id.toString(), path: file.path }
      });
      const io = getIO();
      io?.to(roomId)?.emit('room-activity', {
        type: file.isFolder ? 'folder_delete' : 'file_delete',
        message: `${(req as any).user.username} deleted ${file.isFolder ? 'folder' : 'file'}: ${file.path}`,
        actorUsername: (req as any).user.username,
        createdAt: new Date().toISOString(),
        meta: { fileId: file._id.toString(), path: file.path }
      });
    }

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to build file tree
function buildFileTree(files: any[]) {
  const fileMap = new Map<string, any>();
  const rootFiles: any[] = [];

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
    } else {
      rootFiles.push(fileObj);
    }
  });

  return rootFiles;
}

// Helper function to delete folder recursively
async function deleteFolderRecursively(folderId: any) {
  const children: any[] = await File.find({ parentFolder: folderId });

  for (const child of children) {
    if (child.isFolder) {
      await deleteFolderRecursively(child._id);
    }
    await File.findByIdAndDelete(child._id);
  }
}

export default router;



