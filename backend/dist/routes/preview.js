"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const sessions = new Map();
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
function getTempDir() {
    // When running from backend/dist, __dirname changes.
    // Using cwd keeps temp files in backend/temp as before.
    return path_1.default.join(process.cwd(), 'temp');
}
function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
        if (now - session.createdAt <= SESSION_TTL_MS)
            continue;
        sessions.delete(token);
        fs_1.promises.rm(session.dir, { recursive: true, force: true }).catch(() => { });
    }
}
function sanitizeAssetPath(inputPath) {
    // Convert to posix separators so path checks behave consistently.
    let p = String(inputPath || '').replace(/\\/g, '/');
    // Remove leading slashes.
    p = p.replace(/^\/+/, '');
    // Reject absolute paths and traversal.
    // Also reject null bytes.
    if (!p || p.includes('\0'))
        throw new Error('Invalid asset path');
    if (path_1.default.posix.isAbsolute(p))
        throw new Error('Invalid asset path');
    if (p.startsWith('..') || p.includes('/../') || p.includes('..\\'))
        throw new Error('Invalid asset path');
    return p;
}
async function ensureWithinDir(baseDir, fullPath) {
    const resolvedBase = path_1.default.resolve(baseDir);
    const resolvedFull = path_1.default.resolve(fullPath);
    if (!resolvedFull.startsWith(resolvedBase + path_1.default.sep) && resolvedFull !== resolvedBase) {
        throw new Error('Asset path escapes preview directory');
    }
}
router.post('/create', auth_1.auth, [
    // Keep validation simple and defensive.
    // (express-validator can be added later if needed)
    (req, res, next) => {
        const { html, assets } = req.body;
        if (typeof html !== 'string' || !html.trim())
            return res.status(400).json({ message: 'html is required' });
        if (assets !== undefined && !Array.isArray(assets))
            return res.status(400).json({ message: 'assets must be an array' });
        return next();
    }
], async (req, res) => {
    try {
        cleanupExpiredSessions();
        const { html, assets = [] } = req.body;
        const token = crypto_1.default.randomBytes(16).toString('hex');
        const dir = path_1.default.join(getTempDir(), 'preview', token);
        await fs_1.promises.mkdir(dir, { recursive: true });
        await fs_1.promises.writeFile(path_1.default.join(dir, 'index.html'), html, 'utf8');
        if (Array.isArray(assets)) {
            for (const asset of assets) {
                const assetPath = sanitizeAssetPath(asset?.path);
                const content = typeof asset?.content === 'string' ? asset.content : '';
                const full = path_1.default.join(dir, assetPath);
                await ensureWithinDir(dir, full);
                await fs_1.promises.mkdir(path_1.default.dirname(full), { recursive: true });
                await fs_1.promises.writeFile(full, content, 'utf8');
            }
        }
        sessions.set(token, { dir, createdAt: Date.now() });
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        return res.json({
            url: `${baseUrl}/api/preview/${token}/index.html`
        });
    }
    catch (error) {
        return res.status(400).json({ message: error?.message || 'Failed to create preview' });
    }
});
async function serveFromSession(req, res) {
    cleanupExpiredSessions();
    const token = String(req.params.token || '');
    const session = sessions.get(token);
    if (!session)
        return res.status(404).send('Preview not found');
    // Determine which file is requested inside the preview folder.
    // Example iframe src: /api/preview/<token>/index.html
    // Example asset request: /api/preview/<token>/app.js
    const originalPath = String(req.originalUrl || req.url || '').split('?')[0];
    const base = `/api/preview/${token}`;
    let rel = '';
    if (originalPath === base || originalPath === base + '/') {
        rel = 'index.html';
    }
    else if (originalPath.startsWith(base + '/')) {
        rel = originalPath.slice((base + '/').length);
    }
    else {
        // Fallback: try to parse relative to the router mount.
        const pathOnly = String(req.path || req.url || '').split('?')[0];
        if (pathOnly === `/${token}` || pathOnly === `/${token}/`) {
            rel = 'index.html';
        }
        else if (pathOnly.startsWith(`/${token}/`)) {
            rel = pathOnly.slice((`/${token}/`).length);
        }
        else {
            // If we can't confidently parse it, default to index.html.
            rel = 'index.html';
        }
    }
    // Prevent traversal even if wildcard is manipulated.
    let safeRel;
    try {
        safeRel = sanitizeAssetPath(rel);
    }
    catch {
        return res.status(400).send('Invalid asset path');
    }
    const full = path_1.default.join(session.dir, safeRel);
    await ensureWithinDir(session.dir, full);
    return res.sendFile(full);
}
// Serve index.html and any referenced assets for this preview session.
router.use('/:token', async (req, res) => {
    return serveFromSession(req, res);
});
exports.default = router;
