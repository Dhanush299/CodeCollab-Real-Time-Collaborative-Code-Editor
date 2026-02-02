import express from 'express';
import { body, validationResult } from 'express-validator';
import { VM } from 'vm2';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { auth } from '../middleware/auth';
import { logRoomActivity } from '../utils/logRoomActivity';
import { getIO } from '../socket';

const execAsync = promisify(exec);
const router = express.Router();

// Execute code
router.post(
  '/',
  auth,
  [
    body('code').isString().isLength({ max: 10000 }),
    body('language').isIn(['javascript', 'python', 'java', 'cpp', 'c', 'ruby', 'php', 'go', 'rust', 'typescript']),
    body('input').optional().isString().isLength({ max: 1000 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { code, language, input = '', roomId, fileId, filePath } = req.body as any;

      try {
        let result: any;
        switch (language) {
          case 'javascript':
            result = await executeJavaScript(code, input);
            break;
          case 'python':
            result = await executePython(code, input);
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
          await logRoomActivity({
            roomId,
            actorId: (req as any).user._id,
            actorUsername: (req as any).user.username,
            type: 'run_code',
            message: `${(req as any).user.username} ran code${filePath ? ` in ${filePath}` : ''}`,
            meta: { language, fileId: fileId || null, filePath: filePath || null, executionTime: result.executionTime }
          });
          const io = getIO();
          io?.to(roomId)?.emit('room-activity', {
            type: 'run_code',
            message: `${(req as any).user.username} ran code${filePath ? ` in ${filePath}` : ''}`,
            actorUsername: (req as any).user.username,
            createdAt: new Date().toISOString(),
            meta: { language, fileId: fileId || null, filePath: filePath || null, executionTime: result.executionTime }
          });
        }
      } catch (error: any) {
        res.json({
          success: false,
          output: '',
          error: error?.message || 'Execution failed',
          executionTime: 0
        });
      }
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

function getTempDir() {
  // When running compiled code from backend/dist, __dirname changes.
  // Using cwd keeps temp files in backend/temp as before.
  return path.join(process.cwd(), 'temp');
}

// Execute JavaScript code safely
async function executeJavaScript(code: string, input: string) {
  const startTime = Date.now();

  try {
    const vm: any = new VM({
      timeout: 5000,
      sandbox: {
        console: {
          log: (...args: any[]) => {
            if (!vm.output) vm.output = [];
            vm.output.push(args.join(' '));
          }
        },
        process: {
          stdin: input
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
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    return {
      output: '',
      error: error?.message,
      executionTime
    };
  }
}

// Execute Python code
async function executePython(code: string, input: string) {
  const startTime = Date.now();

  try {
    const tempDir = getTempDir();
    await fs.mkdir(tempDir, { recursive: true });

    const tempFile = path.join(tempDir, `temp_${Date.now()}.py`);
    await fs.writeFile(tempFile, code);

    const isWindows = process.platform === 'win32';
    const pythonCmd = isWindows ? 'python' : 'python3';

    let stdout: string | undefined;
    let stderr: string | undefined;
    let lastError: any = null;

    for (const cmd of [pythonCmd, isWindows ? 'python3' : 'python']) {
      try {
        const result: any = await execAsync(`${cmd} "${tempFile}"`, {
          timeout: 10000,
          input,
          maxBuffer: 1024 * 1024
        } as any);
        stdout = result.stdout;
        stderr = result.stderr;
        lastError = null;
        break;
      } catch (error: any) {
        lastError = error;
        continue;
      }
    }

    await fs.unlink(tempFile).catch(() => {});

    if (lastError) throw lastError;

    const executionTime = Date.now() - startTime;

    return {
      output: stdout || '',
      error: stderr || '',
      executionTime
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    try {
      const tempDir = getTempDir();
      const files = await fs.readdir(tempDir);
      const tempFiles = files.filter((f) => f.startsWith('temp_') && f.endsWith('.py'));
      for (const file of tempFiles) {
        await fs.unlink(path.join(tempDir, file)).catch(() => {});
      }
    } catch {
      // ignore
    }

    return {
      output: '',
      error: error?.stderr || error?.message || 'Python execution failed. Make sure Python is installed and in your PATH.',
      executionTime
    };
  }
}

// Execute Java code
async function executeJava(code: string, input: string) {
  const startTime = Date.now();

  try {
    const tempDir = getTempDir();
    await fs.mkdir(tempDir, { recursive: true });

    const classMatch = code.match(/public\s+class\s+(\w+)/);
    if (!classMatch) {
      throw new Error('Java code must contain a public class');
    }

    const className = classMatch[1];
    const tempFile = path.join(tempDir, `${className}.java`);
    await fs.writeFile(tempFile, code);

    await execAsync(`javac "${tempFile}"`, { timeout: 5000 } as any);
    const { stdout, stderr }: any = await execAsync(`java -cp "${tempDir}" ${className}`, {
      timeout: 10000,
      input,
      maxBuffer: 1024 * 1024
    } as any);

    const classFile = path.join(tempDir, `${className}.class`);
    await fs.unlink(tempFile).catch(() => {});
    await fs.unlink(classFile).catch(() => {});

    const executionTime = Date.now() - startTime;

    return {
      output: stdout,
      error: stderr,
      executionTime
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    return {
      output: '',
      error: error?.stderr || error?.message,
      executionTime
    };
  }
}

// Execute C/C++ code
async function executeCpp(code: string, input: string, language: 'cpp' | 'c') {
  const startTime = Date.now();

  try {
    const tempDir = getTempDir();
    await fs.mkdir(tempDir, { recursive: true });

    const extension = language === 'cpp' ? 'cpp' : 'c';
    const base = `temp_${Date.now()}`;
    const tempSource = path.join(tempDir, `${base}.${extension}`);
    const tempExecutable = path.join(tempDir, `${base}.exe`);

    await fs.writeFile(tempSource, code);

    const compiler = language === 'cpp' ? 'g++' : 'gcc';
    await execAsync(`${compiler} "${tempSource}" -o "${tempExecutable}"`, { timeout: 10000 } as any);

    const { stdout, stderr }: any = await execAsync(`"${tempExecutable}"`, {
      timeout: 10000,
      input,
      maxBuffer: 1024 * 1024
    } as any);

    await fs.unlink(tempSource).catch(() => {});
    await fs.unlink(tempExecutable).catch(() => {});

    const executionTime = Date.now() - startTime;

    return {
      output: stdout,
      error: stderr,
      executionTime
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    return {
      output: '',
      error: error?.stderr || error?.message,
      executionTime
    };
  }
}

// Execute Ruby code
async function executeRuby(code: string, input: string) {
  const startTime = Date.now();

  try {
    const tempDir = getTempDir();
    await fs.mkdir(tempDir, { recursive: true });

    const tempFile = path.join(tempDir, `temp_${Date.now()}.rb`);
    await fs.writeFile(tempFile, code);

    const { stdout, stderr }: any = await execAsync(`ruby "${tempFile}"`, {
      timeout: 10000,
      input,
      maxBuffer: 1024 * 1024
    } as any);

    await fs.unlink(tempFile).catch(() => {});
    const executionTime = Date.now() - startTime;

    return {
      output: stdout,
      error: stderr,
      executionTime
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    return {
      output: '',
      error: error?.stderr || error?.message,
      executionTime
    };
  }
}

// Execute PHP code
async function executePHP(code: string, input: string) {
  const startTime = Date.now();

  try {
    const tempDir = getTempDir();
    await fs.mkdir(tempDir, { recursive: true });

    const tempFile = path.join(tempDir, `temp_${Date.now()}.php`);
    await fs.writeFile(tempFile, code);

    const { stdout, stderr }: any = await execAsync(`php "${tempFile}"`, {
      timeout: 10000,
      input,
      maxBuffer: 1024 * 1024
    } as any);

    await fs.unlink(tempFile).catch(() => {});
    const executionTime = Date.now() - startTime;

    return {
      output: stdout,
      error: stderr,
      executionTime
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    return {
      output: '',
      error: error?.stderr || error?.message,
      executionTime
    };
  }
}

// Execute Go code
async function executeGo(code: string, input: string) {
  const startTime = Date.now();

  try {
    const tempDir = getTempDir();
    await fs.mkdir(tempDir, { recursive: true });

    const tempFile = path.join(tempDir, `temp_${Date.now()}.go`);
    await fs.writeFile(tempFile, code);

    const { stdout, stderr }: any = await execAsync(`go run "${tempFile}"`, {
      timeout: 15000,
      input,
      maxBuffer: 1024 * 1024
    } as any);

    await fs.unlink(tempFile).catch(() => {});
    const executionTime = Date.now() - startTime;

    return {
      output: stdout,
      error: stderr,
      executionTime
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    return {
      output: '',
      error: error?.stderr || error?.message,
      executionTime
    };
  }
}

// Execute Rust code
async function executeRust(code: string, input: string) {
  const startTime = Date.now();

  try {
    const tempDir = getTempDir();
    await fs.mkdir(tempDir, { recursive: true });

    const tempFile = path.join(tempDir, `temp_${Date.now()}.rs`);
    await fs.writeFile(tempFile, code);

    const exePath = path.join(tempDir, 'temp.exe');
    const { stdout, stderr }: any = await execAsync(`rustc "${tempFile}" --out-dir "${tempDir}" && "${path.join(tempDir, 'temp')}"`, {
      timeout: 20000,
      input,
      maxBuffer: 1024 * 1024
    } as any);

    await fs.unlink(tempFile).catch(() => {});
    await fs.unlink(exePath).catch(() => {});
    await fs.unlink(path.join(tempDir, 'temp')).catch(() => {});

    const executionTime = Date.now() - startTime;

    return {
      output: stdout,
      error: stderr,
      executionTime
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    return {
      output: '',
      error: error?.stderr || error?.message,
      executionTime
    };
  }
}

// Execute TypeScript code (compile to JS then run)
async function executeTypeScript(code: string, input: string) {
  const startTime = Date.now();

  try {
    const tempDir = getTempDir();
    await fs.mkdir(tempDir, { recursive: true });

    const base = `temp_${Date.now()}`;
    const tempSource = path.join(tempDir, `${base}.ts`);
    const tempCompiled = path.join(tempDir, `${base}.js`);

    await fs.writeFile(tempSource, code);

    await execAsync(`npx tsc "${tempSource}" --outFile "${tempCompiled}" --target ES2018`, { timeout: 10000 } as any);

    const compiledCode = await fs.readFile(tempCompiled, 'utf8');
    const result = await executeJavaScript(compiledCode, input);

    await fs.unlink(tempSource).catch(() => {});
    await fs.unlink(tempCompiled).catch(() => {});

    return {
      output: result.output,
      error: result.error,
      executionTime: Date.now() - startTime
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    return {
      output: '',
      error: error?.message,
      executionTime
    };
  }
}

export default router;



