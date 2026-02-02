import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Repository from '../models/Repository';
import File from '../models/File';
import Room from '../models/Room';

export const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No authentication token provided' });
    }

    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    (req as any).user = user;
    (req as any).token = token;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid authentication token' });
  }
};

export const checkRole = (roles: Array<'viewer' | 'editor' | 'admin'>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!roles.includes((req as any).user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};

export const checkRepositoryAccess = (requiredRole: 'viewer' | 'editor' | 'admin' = 'viewer') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let repositoryId: any =
        (req as any).params.repositoryId ||
        (req as any).params.id ||
        (req as any).body.repositoryId ||
        (req as any).query.repositoryId;

      const fileId = (req as any).params.fileId || (req as any).params.id;

      // Try to resolve repository from file if not provided
      if (!repositoryId && fileId) {
        try {
          const file = await File.findById(fileId);
          if (file) {
            repositoryId = (file as any).repository;
          }
        } catch (e) {
          // ignore
        }
      }

      if (!repositoryId) {
        return res.status(400).json({ message: 'Repository ID required' });
      }

      let repository: any = await Repository.findById(repositoryId);
      // If not found, repositoryId might be a File id; resolve it
      if (!repository && repositoryId) {
        try {
          const file = await File.findById(repositoryId);
          if (file) {
            repositoryId = (file as any).repository;
            repository = await Repository.findById(repositoryId);
          }
        } catch (e) {
          // ignore and fall through
        }
      }

      if (!repository) {
        return res.status(404).json({ message: 'Repository not found' });
      }

      const user = (req as any).user;

      // Check if user is owner
      if (repository.owner.toString() === user._id.toString()) {
        (req as any).userRepositoryRole = 'admin'; // Owner has admin privileges
        (req as any).repository = repository;
        return next();
      }

      // Check if user is a collaborator
      const collaborator = repository.collaborators.find(
        (collab: any) => collab.user.toString() === user._id.toString()
      );

      // If not collaborator, allow if user is an active participant of a room on this repo
      let participantRole: any = null;
      if (!collaborator) {
        const activeRoom = await Room.findOne({
          repository: repository._id,
          isActive: true,
          'participants.user': user._id
        });
        if (activeRoom) {
          const participant = (activeRoom as any).participants.find(
            (p: any) => p.user.toString() === user._id.toString()
          );
          participantRole = participant?.role || 'viewer';
        }
      }

      // Determine effective role (prefer collaborator role, else participant)
      const effectiveRole = collaborator?.role || participantRole;
      if (!effectiveRole) {
        return res.status(403).json({ message: 'Access denied to this repository' });
      }

      // Check role hierarchy: admin > editor > viewer
      const roleHierarchy: Record<string, number> = { admin: 3, editor: 2, viewer: 1 };
      const requiredLevel = roleHierarchy[requiredRole] || 1;
      const userLevel = roleHierarchy[effectiveRole] || 1;

      if (userLevel < requiredLevel) {
        return res.status(403).json({ message: 'Insufficient permissions for this action' });
      }

      (req as any).userRepositoryRole = effectiveRole;
      (req as any).repository = repository;
      next();
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  };
};



