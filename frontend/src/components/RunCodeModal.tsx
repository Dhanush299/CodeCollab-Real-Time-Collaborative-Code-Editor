import React, { useState } from 'react';
import axios from 'axios';

type Props = {
  onClose: () => void;
  file: any;
  getEditorContent?: () => string;
};

const RunCodeModal = ({ onClose, file, getEditorContent }: Props) => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [executionTime, setExecutionTime] = useState<number | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setOutput('');
    setError('');
    setExecutionTime(null);

    try {
      // Get current editor content if available, otherwise use file content
      const code = getEditorContent ? getEditorContent() : (file.content || '');
      
      if (!code.trim()) {
        setError('No code to execute. Please write some code first.');
        setLoading(false);
        return;
      }

      const response = await axios.post('/execute', {
        code: code,
        language: file.language || 'python',
        input: input
      });

      const { output: resultOutput, error: resultError, executionTime: time, success } = response.data;

      if (success !== false) {
        // Show output if available, even if there's also an error (like stderr)
        if (resultOutput) {
          setOutput(resultOutput);
        }
        if (resultError) {
          setError(resultError);
        }
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

            {!output && !error && !loading && (
              <div className="no-output">
                Click "Run Code" to execute your program
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
