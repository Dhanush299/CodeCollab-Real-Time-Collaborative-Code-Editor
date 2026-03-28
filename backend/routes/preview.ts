import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { auth } from '../middleware/auth';

const router = express.Router();

type PreviewSession = {
  dir: string;
  createdAt: number;
};

const sessions = new Map<string, PreviewSession>();
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getTempDir() {
  // When running from backend/dist, __dirname changes.
  // Using cwd keeps temp files in backend/temp as before.
  return path.join(process.cwd(), 'temp');
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.createdAt <= SESSION_TTL_MS) continue;
    sessions.delete(token);
    fs.rm(session.dir, { recursive: true, force: true }).catch(() => {});
  }
}

function sanitizeAssetPath(inputPath: string): string {
  // Convert to posix separators so path checks behave consistently.
  let p = String(inputPath || '').replace(/\\/g, '/');

  // Remove leading slashes.
  p = p.replace(/^\/+/, '');

  // Reject absolute paths and traversal.
  // Also reject null bytes.
  if (!p || p.includes('\0')) throw new Error('Invalid asset path');
  if (path.posix.isAbsolute(p)) throw new Error('Invalid asset path');
  if (p.startsWith('..') || p.includes('/../') || p.includes('..\\')) throw new Error('Invalid asset path');

  return p;
}

async function ensureWithinDir(baseDir: string, fullPath: string) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedFull = path.resolve(fullPath);
  if (!resolvedFull.startsWith(resolvedBase + path.sep) && resolvedFull !== resolvedBase) {
    throw new Error('Asset path escapes preview directory');
  }
}

router.post(
  '/create',
  auth,
  [
    // Keep validation simple and defensive.
    // (express-validator can be added later if needed)
    (req, res, next) => {
      const { html, assets } = req.body as any;
      if (typeof html !== 'string' || !html.trim()) return res.status(400).json({ message: 'html is required' });
      if (assets !== undefined && !Array.isArray(assets)) return res.status(400).json({ message: 'assets must be an array' });
      return next();
    }
  ],
  async (req, res) => {
    try {
      cleanupExpiredSessions();

      const { html, assets = [] } = req.body as any;

      const token = crypto.randomBytes(16).toString('hex');
      const dir = path.join(getTempDir(), 'preview', token);

      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');

      if (Array.isArray(assets)) {
        for (const asset of assets) {
          const assetPath = sanitizeAssetPath(asset?.path);
          const content = typeof asset?.content === 'string' ? asset.content : '';
          const full = path.join(dir, assetPath);
          await ensureWithinDir(dir, full);
          await fs.mkdir(path.dirname(full), { recursive: true });
          await fs.writeFile(full, content, 'utf8');
        }
      }

      sessions.set(token, { dir, createdAt: Date.now() });

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      return res.json({
        url: `${baseUrl}/api/preview/${token}/index.html`
      });
    } catch (error: any) {
      return res.status(400).json({ message: error?.message || 'Failed to create preview' });
    }
  }
);

async function serveFromSession(req: express.Request, res: express.Response) {
  cleanupExpiredSessions();

  const token = String(req.params.token || '');
  const session = sessions.get(token);
  if (!session) return res.status(404).send('Preview not found');

  // Determine which file is requested inside the preview folder.
  // Example iframe src: /api/preview/<token>/index.html
  // Example asset request: /api/preview/<token>/app.js
  const originalPath = String(req.originalUrl || req.url || '').split('?')[0];
  const base = `/api/preview/${token}`;

  let rel = '';
  if (originalPath === base || originalPath === base + '/') {
    rel = 'index.html';
  } else if (originalPath.startsWith(base + '/')) {
    rel = originalPath.slice((base + '/').length);
  } else {
    // Fallback: try to parse relative to the router mount.
    const pathOnly = String((req as any).path || req.url || '').split('?')[0];
    if (pathOnly === `/${token}` || pathOnly === `/${token}/`) {
      rel = 'index.html';
    } else if (pathOnly.startsWith(`/${token}/`)) {
      rel = pathOnly.slice((`/${token}/`).length);
    } else {
      // If we can't confidently parse it, default to index.html.
      rel = 'index.html';
    }
  }

  // Prevent traversal even if wildcard is manipulated.
  let safeRel: string;
  try {
    safeRel = sanitizeAssetPath(rel);
  } catch {
    return res.status(400).send('Invalid asset path');
  }

  const full = path.join(session.dir, safeRel);
  await ensureWithinDir(session.dir, full);

  return res.sendFile(full);
}

// Serve index.html and any referenced assets for this preview session.
router.use('/:token', async (req, res) => {
  return serveFromSession(req, res);
});

export default router;

