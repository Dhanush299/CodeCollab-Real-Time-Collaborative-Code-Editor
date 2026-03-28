"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const vm2_1 = require("vm2");
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const auth_1 = require("../middleware/auth");
const logRoomActivity_1 = require("../utils/logRoomActivity");
const socket_1 = require("../socket");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const router = express_1.default.Router();
// Execute code
router.post('/', auth_1.auth, [
    (0, express_validator_1.body)('code').isString().isLength({ max: 10000 }),
    (0, express_validator_1.body)('language').isIn([
        'javascript',
        'python',
        'java',
        'cpp',
        'c',
        'ruby',
        'php',
        'go',
        'rust',
        'typescript',
        'html',
        'css',
        'markdown'
    ]),
    (0, express_validator_1.body)('input').optional().isString().isLength({ max: 1000 })
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { code, language, input = '', roomId, fileId, filePath } = req.body;
        try {
            let result;
            switch (language) {
                case 'javascript':
                    result = await executeJavaScript(code, input);
                    break;
                case 'python':
                    result = await executePython(code, input);
                    break;
                case 'html':
                    result = await executeHtml(code, input);
                    break;
                case 'css':
                    result = await executeCss(code, input);
                    break;
                case 'markdown':
                    result = await executeMarkdown(code, input);
                    break;
                case 'java':
                    result = await executeJava(code, input);
                    break;
                case 'cpp':
                case 'c':
                    result = await executeCpp(code, input, language);
                    break;
                case 'ruby':
                    result = await executeRuby(code, input);
                    break;
                case 'php':
                    result = await executePHP(code, input);
                    break;
                case 'go':
                    result = await executeGo(code, input);
                    break;
                case 'rust':
                    result = await executeRust(code, input);
                    break;
                case 'typescript':
                    result = await executeTypeScript(code, input);
                    break;
                default:
                    return res.status(400).json({ message: 'Unsupported language' });
            }
            res.json({
                success: true,
                output: result.output,
                error: result.error,
                executionTime: result.executionTime
            });
            // Activity log (best-effort)
            if (roomId) {
                await (0, logRoomActivity_1.logRoomActivity)({
                    roomId,
                    actorId: req.user._id,
                    actorUsername: req.user.username,
                    type: 'run_code',
                    message: `${req.user.username} ran code${filePath ? ` in ${filePath}` : ''}`,
                    meta: { language, fileId: fileId || null, filePath: filePath || null, executionTime: result.executionTime }
                });
                const io = (0, socket_1.getIO)();
                io?.to(roomId)?.emit('room-activity', {
                    type: 'run_code',
                    message: `${req.user.username} ran code${filePath ? ` in ${filePath}` : ''}`,
                    actorUsername: req.user.username,
                    createdAt: new Date().toISOString(),
                    meta: { language, fileId: fileId || null, filePath: filePath || null, executionTime: result.executionTime }
                });
            }
        }
        catch (error) {
            res.json({
                success: false,
                output: '',
                error: error?.message || 'Execution failed',
                executionTime: 0
            });
        }
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
function getTempDir() {
    // When running compiled code from backend/dist, __dirname changes.
    // Using cwd keeps temp files in backend/temp as before.
    return path_1.default.join(process.cwd(), 'temp');
}
async function runCommandWithStdin(command, args, input, timeoutMs, maxBufferBytes) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, { windowsHide: true });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);
        child.stdout.on('data', (d) => {
            stdout += d.toString();
            if (stdout.length > maxBufferBytes) {
                clearTimeout(timeout);
                child.kill();
                reject(new Error('Output limit exceeded'));
            }
        });
        child.stderr.on('data', (d) => {
            stderr += d.toString();
            if (stderr.length > maxBufferBytes) {
                clearTimeout(timeout);
                child.kill();
                reject(new Error('Error output limit exceeded'));
            }
        });
        child.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        child.on('close', (code) => {
            clearTimeout(timeout);
            if (timedOut) {
                reject(new Error(`Execution timed out after ${timeoutMs}ms`));
                return;
            }
            if (code === 0) {
                resolve({ stdout, stderr });
            }
            else {
                const err = new Error(`Command failed with exit code ${code}`);
                err.stdout = stdout;
                err.stderr = stderr;
                reject(err);
            }
        });
        // Feed stdin for languages that rely on input().
        // Write (even empty) so stdin is properly initialized, then end it.
        if (typeof input === 'string') {
            child.stdin.write(input);
        }
        child.stdin.end();
    });
}
function isCommandMissing(err) {
    const msg = String(err?.message || '').toLowerCase();
    return (err?.code === 'ENOENT' ||
        msg.includes('not recognized') ||
        msg.includes('is not recognized') ||
        msg.includes('cannot find') ||
        msg.includes('no such file') ||
        msg.includes('executable'));
}
// Execute JavaScript code safely
async function executeJavaScript(code, input) {
    const startTime = Date.now();
    try {
        const vm = new vm2_1.VM({
            timeout: 5000,
            sandbox: {
                console: {
                    log: (...args) => {
                        if (!vm.output)
                            vm.output = [];
                        vm.output.push(args.join(' '));
                    }
                },
                process: {
                    stdin: input
                },
                // Some users write alert() in their HTML scripts; map it to console output.
                alert: (...args) => {
                    if (!vm.output)
                        vm.output = [];
                    vm.output.push(args.join(' '));
                }
            }
        });
        vm.output = [];
        vm.run(code);
        const executionTime = Date.now() - startTime;
        return {
            output: vm.output.join('\n'),
            error: null,
            executionTime
        };
    }
    catch (error) {
        const executionTime = Date.now() - startTime;
        return {
            output: '',
            error: error?.message,
            executionTime
        };
    }
}
// Execute Python code
async function executePython(code, input) {
    const startTime = Date.now();
    try {
        const tempDir = getTempDir();
        await fs_1.promises.mkdir(tempDir, { recursive: true });
        const tempFile = path_1.default.join(tempDir, `temp_${Date.now()}.py`);
        await fs_1.promises.writeFile(tempFile, code);
        const isWindows = process.platform === 'win32';
        // Windows can have Python exposed as `py` instead of `python`.
        const candidates = isWindows
            ? [
                { command: 'python', args: [tempFile] },
                { command: 'python3', args: [tempFile] },
                { command: 'py', args: ['-3', tempFile] },
                { command: 'py', args: [tempFile] }
            ]
            : [
                { command: 'python3', args: [tempFile] },
                { command: 'python', args: [tempFile] }
            ];
        let lastError = null;
        for (const candidate of candidates) {
            try {
                const { stdout, stderr } = await runCommandWithStdin(candidate.command, candidate.args, input, 10000, 1024 * 1024);
                await fs_1.promises.unlink(tempFile).catch(() => { });
                const executionTime = Date.now() - startTime;
                return {
                    output: stdout || '',
                    error: stderr || '',
                    executionTime
                };
            }
            catch (error) {
                lastError = error;
                // If the command itself is missing, try next candidate.
                // Otherwise (syntax error, runtime error, timeout), don't mask it
                // by trying a different Python binary.
                if (isCommandMissing(error)) {
                    continue;
                }
                break;
            }
        }
        await fs_1.promises.unlink(tempFile).catch(() => { });
        const executionTime = Date.now() - startTime;
        return {
            output: '',
            error: lastError?.stderr ||
                lastError?.message ||
                'Python execution failed. Make sure Python is installed and available on PATH.',
            executionTime
        };
    }
    catch (error) {
        const executionTime = Date.now() - startTime;
        try {
            const tempDir = getTempDir();
            const files = await fs_1.promises.readdir(tempDir);
            const tempFiles = files.filter((f) => f.startsWith('temp_') && f.endsWith('.py'));
            for (const file of tempFiles) {
                await fs_1.promises.unlink(path_1.default.join(tempDir, file)).catch(() => { });
            }
        }
        catch {
            // ignore
        }
        return {
            output: '',
            error: error?.stderr || error?.message || 'Python execution failed. Make sure Python is installed and in your PATH.',
            executionTime
        };
    }
}
// Execute HTML by running inline <script> blocks as JavaScript.
// If there are no <script> tags, we return extracted text content so the UI shows something.
async function executeHtml(code, input) {
    const startTime = Date.now();
    try {
        const scriptMatches = Array.from(code.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)).map((m) => m[1] || '');
        if (scriptMatches.length > 0) {
            const inlineJs = scriptMatches.join('\n');
            return await executeJavaScript(inlineJs, input);
        }
        // Basic text extraction: remove comments/styles/scripts, then strip tags.
        const text = code
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return {
            output: text,
            error: '',
            executionTime: Date.now() - startTime
        };
    }
    catch (error) {
        return {
            output: '',
            error: error?.message || 'HTML execution failed',
            executionTime: Date.now() - startTime
        };
    }
}
// CSS/Markdown don't have a meaningful "execution" in this sandbox.
// We return their content so the modal always shows something.
async function executeCss(code, _input) {
    return {
        output: code,
        error: '',
        executionTime: 0
    };
}
async function executeMarkdown(code, _input) {
    return {
        output: code,
        error: '',
        executionTime: 0
    };
}
// Execute Java code
async function executeJava(code, input) {
    const startTime = Date.now();
    try {
        const tempDir = getTempDir();
        await fs_1.promises.mkdir(tempDir, { recursive: true });
        const classMatch = code.match(/public\s+class\s+(\w+)/);
        if (!classMatch) {
            throw new Error('Java code must contain a public class');
        }
        const className = classMatch[1];
        const tempFile = path_1.default.join(tempDir, `${className}.java`);
        await fs_1.promises.writeFile(tempFile, code);
        await execAsync(`javac "${tempFile}"`, { timeout: 5000 });
        const { stdout, stderr } = await execAsync(`java -cp "${tempDir}" ${className}`, {
            timeout: 10000,
            input,
            maxBuffer: 1024 * 1024
        });
        const classFile = path_1.default.join(tempDir, `${className}.class`);
        await fs_1.promises.unlink(tempFile).catch(() => { });
        await fs_1.promises.unlink(classFile).catch(() => { });
        const executionTime = Date.now() - startTime;
        return {
            output: stdout,
            error: stderr,
            executionTime
        };
    }
    catch (error) {
        const executionTime = Date.now() - startTime;
        return {
            output: '',
            error: error?.stderr || error?.message,
            executionTime
        };
    }
}
// Execute C/C++ code
async function executeCpp(code, input, language) {
    const startTime = Date.now();
    try {
        const tempDir = getTempDir();
        await fs_1.promises.mkdir(tempDir, { recursive: true });
        const extension = language === 'cpp' ? 'cpp' : 'c';
        const base = `temp_${Date.now()}`;
        const tempSource = path_1.default.join(tempDir, `${base}.${extension}`);
        const tempExecutable = path_1.default.join(tempDir, `${base}.exe`);
        await fs_1.promises.writeFile(tempSource, code);
        const compiler = language === 'cpp' ? 'g++' : 'gcc';
        await execAsync(`${compiler} "${tempSource}" -o "${tempExecutable}"`, { timeout: 10000 });
        const { stdout, stderr } = await execAsync(`"${tempExecutable}"`, {
            timeout: 10000,
            input,
            maxBuffer: 1024 * 1024
        });
        await fs_1.promises.unlink(tempSource).catch(() => { });
        await fs_1.promises.unlink(tempExecutable).catch(() => { });
        const executionTime = Date.now() - startTime;
        return {
            output: stdout,
            error: stderr,
            executionTime
        };
    }
    catch (error) {
        const executionTime = Date.now() - startTime;
        return {
            output: '',
            error: error?.stderr || error?.message,
            executionTime
        };
    }
}
// Execute Ruby code
async function executeRuby(code, input) {
    const startTime = Date.now();
    try {
        const tempDir = getTempDir();
        await fs_1.promises.mkdir(tempDir, { recursive: true });
        const tempFile = path_1.default.join(tempDir, `temp_${Date.now()}.rb`);
        await fs_1.promises.writeFile(tempFile, code);
        const { stdout, stderr } = await execAsync(`ruby "${tempFile}"`, {
            timeout: 10000,
            input,
            maxBuffer: 1024 * 1024
        });
        await fs_1.promises.unlink(tempFile).catch(() => { });
        const executionTime = Date.now() - startTime;
        return {
            output: stdout,
            error: stderr,
            executionTime
        };
    }
    catch (error) {
        const executionTime = Date.now() - startTime;
        return {
            output: '',
            error: error?.stderr || error?.message,
            executionTime
        };
    }
}
// Execute PHP code
async function executePHP(code, input) {
    const startTime = Date.now();
    try {
        const tempDir = getTempDir();
        await fs_1.promises.mkdir(tempDir, { recursive: true });
        const tempFile = path_1.default.join(tempDir, `temp_${Date.now()}.php`);
        await fs_1.promises.writeFile(tempFile, code);
        const { stdout, stderr } = await execAsync(`php "${tempFile}"`, {
            timeout: 10000,
            input,
            maxBuffer: 1024 * 1024
        });
        await fs_1.promises.unlink(tempFile).catch(() => { });
        const executionTime = Date.now() - startTime;
        return {
            output: stdout,
            error: stderr,
            executionTime
        };
    }
    catch (error) {
        const executionTime = Date.now() - startTime;
        return {
            output: '',
            error: error?.stderr || error?.message,
            executionTime
        };
    }
}
// Execute Go code
async function executeGo(code, input) {
    const startTime = Date.now();
    try {
        const tempDir = getTempDir();
        await fs_1.promises.mkdir(tempDir, { recursive: true });
        const tempFile = path_1.default.join(tempDir, `temp_${Date.now()}.go`);
        await fs_1.promises.writeFile(tempFile, code);
        const { stdout, stderr } = await execAsync(`go run "${tempFile}"`, {
            timeout: 15000,
            input,
            maxBuffer: 1024 * 1024
        });
        await fs_1.promises.unlink(tempFile).catch(() => { });
        const executionTime = Date.now() - startTime;
        return {
            output: stdout,
            error: stderr,
            executionTime
        };
    }
    catch (error) {
        const executionTime = Date.now() - startTime;
        return {
            output: '',
            error: error?.stderr || error?.message,
            executionTime
        };
    }
}
// Execute Rust code
async function executeRust(code, input) {
    const startTime = Date.now();
    try {
        const tempDir = getTempDir();
        await fs_1.promises.mkdir(tempDir, { recursive: true });
        const tempFile = path_1.default.join(tempDir, `temp_${Date.now()}.rs`);
        await fs_1.promises.writeFile(tempFile, code);
        const exePath = path_1.default.join(tempDir, 'temp.exe');
        const { stdout, stderr } = await execAsync(`rustc "${tempFile}" --out-dir "${tempDir}" && "${path_1.default.join(tempDir, 'temp')}"`, {
            timeout: 20000,
            input,
            maxBuffer: 1024 * 1024
        });
        await fs_1.promises.unlink(tempFile).catch(() => { });
        await fs_1.promises.unlink(exePath).catch(() => { });
        await fs_1.promises.unlink(path_1.default.join(tempDir, 'temp')).catch(() => { });
        const executionTime = Date.now() - startTime;
        return {
            output: stdout,
            error: stderr,
            executionTime
        };
    }
    catch (error) {
        const executionTime = Date.now() - startTime;
        return {
            output: '',
            error: error?.stderr || error?.message,
            executionTime
        };
    }
}
// Execute TypeScript code (compile to JS then run)
async function executeTypeScript(code, input) {
    const startTime = Date.now();
    try {
        const tempDir = getTempDir();
        await fs_1.promises.mkdir(tempDir, { recursive: true });
        const base = `temp_${Date.now()}`;
        const tempSource = path_1.default.join(tempDir, `${base}.ts`);
        const tempCompiled = path_1.default.join(tempDir, `${base}.js`);
        await fs_1.promises.writeFile(tempSource, code);
        await execAsync(`npx tsc "${tempSource}" --outFile "${tempCompiled}" --target ES2018`, { timeout: 10000 });
        const compiledCode = await fs_1.promises.readFile(tempCompiled, 'utf8');
        const result = await executeJavaScript(compiledCode, input);
        await fs_1.promises.unlink(tempSource).catch(() => { });
        await fs_1.promises.unlink(tempCompiled).catch(() => { });
        return {
            output: result.output,
            error: result.error,
            executionTime: Date.now() - startTime
        };
    }
    catch (error) {
        const executionTime = Date.now() - startTime;
        return {
            output: '',
            error: error?.message,
            executionTime
        };
    }
}
exports.default = router;
