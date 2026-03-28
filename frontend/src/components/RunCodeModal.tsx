import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type Props = {
  onClose: () => void;
  file: any;
  getEditorContent?: () => string;
  repoFiles?: any[];
};

const RunCodeModal = ({ onClose, file, getEditorContent, repoFiles = [] }: Props) => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [htmlPreviewUrl, setHtmlPreviewUrl] = useState('');

  const language = String(file.language || 'python').toLowerCase();

  // Inject a tiny bridge so HTML can send console logs back to the modal.
  // This keeps the "Run" experience consistent with other languages.
  const injectedBridgeScript = useMemo(() => {
    return `
      <script>
        (function() {
          function stringifyArgs(args) {
            try { return Array.prototype.slice.call(args).map(function(a){ return String(a); }).join(' '); }
            catch (e) { return ''; }
          }
          function send(type, msg) {
            try {
              window.parent.postMessage({ __codecollabRun: true, type: type, message: msg }, '*');
            } catch (e) {}
          }
          var origLog = console.log;
          console.log = function() {
            try { origLog.apply(console, arguments); } catch(e) {}
            send('log', stringifyArgs(arguments));
          };
          var origError = console.error;
          console.error = function() {
            try { origError.apply(console, arguments); } catch(e) {}
            send('error', stringifyArgs(arguments));
          };
        })();
      </script>
    `;
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data: any = event.data;
      if (!data || !data.__codecollabRun) return;
      if (data.type === 'error') {
        setError((prev) => (prev ? prev + '\n' + data.message : data.message));
      } else {
        setOutput((prev) => (prev ? prev + '\n' + data.message : data.message));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleRun = async () => {
    setLoading(true);
    setOutput('');
    setError('');
    setExecutionTime(null);
    setHasRun(true);

    try {
      // Get current editor content if available, otherwise use file content
      const code = getEditorContent ? getEditorContent() : (file.content || '');
      
      if (!code.trim()) {
        setError('No code to execute. Please write some code first.');
        setLoading(false);
        return;
      }

      // HTML should run/render in the browser (in a sandboxed iframe),
      // not via the backend execution endpoint.
      if (language === 'html') {
        if (!Array.isArray(repoFiles) || repoFiles.length === 0) {
          // Fallback: run as srcDoc if we don't have the repo file tree.
          const bridgeApplied =
            /<\/head>/i.test(code) ? code.replace(/<\/head>/i, `${injectedBridgeScript}</head>`) : `${injectedBridgeScript}${code}`;
          setError('HTML preview with separate files needs the repository file tree. Re-open the file from the Repository page.');
          setHtmlPreviewUrl('');
          setLoading(false);
          return;
        }

        const extractAssetRefs = (html: string) => {
          const refs = new Set<string>();

          for (const m of html.matchAll(/<script[^>]*\s+src\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
            const v = m[1];
            if (v) refs.add(v);
          }
          for (const m of html.matchAll(/<link[^>]*\s+href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
            const v = m[1];
            if (v) refs.add(v);
          }

          return Array.from(refs);
        };

        const normalizeRefPath = (ref: string) => {
          const clean = String(ref).split('#')[0].split('?')[0].trim();
          return clean.replace(/^(\.\/)+/, '').replace(/^\//, '');
        };

        const flattenFiles = (nodes: any[]): any[] => {
          const out: any[] = [];
          const stack: any[] = Array.isArray(nodes) ? [...nodes] : [];
          while (stack.length) {
            const n = stack.pop();
            if (!n) continue;
            if (Array.isArray(n.children)) stack.push(...n.children);
            if (!n.isFolder) out.push(n);
          }
          return out;
        };

        const flat = flattenFiles(repoFiles);

        const refs = extractAssetRefs(code);
        const assets: Array<{ path: string; content: string }> = [];

        const findMatchingFile = (refRel: string) => {
          const fileName = refRel.split('/').pop() || refRel;
          return flat.find((f) => f.name === fileName || f.path === refRel || String(f.path || '').endsWith('/' + fileName));
        };

        // Create preview by serving a real HTML file via backend HTTP.
        // We still inject the bridge script so console.log is captured.
        const bridgeApplied =
          /<\/head>/i.test(code) ? code.replace(/<\/head>/i, `${injectedBridgeScript}</head>`) : `${injectedBridgeScript}${code}`;

        for (const ref of refs) {
          const refRel = normalizeRefPath(ref);
          const fileNode = findMatchingFile(refRel);
          if (!fileNode) continue;

          const resp = await axios.get(`/files/${fileNode._id}`);
          const content = resp.data?.file?.content ?? '';
          assets.push({ path: refRel, content });
        }

        const previewResp = await axios.post('/preview/create', {
          html: bridgeApplied,
          assets
        });

        setHtmlPreviewUrl(previewResp.data.url);
        setLoading(false);
        return;
      }

      const response = await axios.post('/execute', {
        code: code,
        language,
        input: input
      });

      const { output: resultOutput, error: resultError, executionTime: time, success } = response.data;

      if (success !== false) {
        // Show output if available, even if there's also an error (like stderr)
        setOutput(resultOutput ?? '');
        setError(resultError ?? '');
        if (time) {
          setExecutionTime(time);
        }
      } else {
        setError(resultError || 'Execution failed');
        if (time) {
          setExecutionTime(time);
        }
      }
    } catch (error: any) {
      console.error('Execution error:', error);
      setError(error.response?.data?.message || error.message || 'Failed to execute code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content run-code-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Run Code - {file.name}</h3>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>

        <div className="run-code-content">
          <div className="input-section">
            <h4>Input (optional)</h4>
            <textarea
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              placeholder="Enter input for your program..."
              rows={4}
              disabled={loading}
            />
          </div>

          <div className="output-section">
            <div className="output-header">
              <h4>Output</h4>
              <button
                onClick={handleRun}
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? 'Running...' : 'Run Code'}
              </button>
            </div>

            {executionTime && (
              <div className="execution-info">
                Execution time: {executionTime}ms
              </div>
            )}

            {language === 'html' && htmlPreviewUrl && (
              <div className="html-preview" style={{ marginBottom: '1rem' }}>
                <h4 style={{ marginBottom: '0.5rem' }}>Browser Preview</h4>
                <iframe
                  title="HTML preview"
                  sandbox="allow-scripts"
                  src={htmlPreviewUrl}
                  style={{
                    width: '100%',
                    height: '280px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'white'
                  }}
                />
              </div>
            )}

            {output && (
              <div className="output-result">
                <pre>{output}</pre>
              </div>
            )}

            {error && (
              <div className="error-result">
                <pre>{error}</pre>
              </div>
            )}

            {!hasRun && !output && !error && !loading && (
              <div className="no-output">
                Click "Run Code" to execute your program
              </div>
            )}

            {language !== 'html' && hasRun && !output && !error && !loading && (
              <div className="no-output">
                Program finished with no output.
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default RunCodeModal;
