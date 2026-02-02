import type { Request } from 'express';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User {}

    interface Request {
      user?: any;
      token?: string;
      repository?: any;
      userRepositoryRole?: 'viewer' | 'editor' | 'admin';
    }
  }
}

export {};



