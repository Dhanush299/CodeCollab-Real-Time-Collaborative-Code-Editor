import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';

interface CopilotModalProps {
  action: 'Generate' | 'Insert' | 'Replace' | 'Suggest';
  language: string;
  currentCode?: string;
  onClose: () => void;
  onApply: (code: string) => void;
}

const CopilotModal = ({ action, language, currentCode = '', onClose, onApply }: CopilotModalProps) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError('');

    try {
      let response;
      
      switch (action) {
        case 'Generate':
          response = await axios.post('/ai/generate', {
            description: prompt,
            language,
            context: currentCode
          });
          onApply(response.data.code);
          break;

        case 'Insert':
        case 'Replace':
          response = await axios.post('/ai/suggest', {
            prompt: prompt,
            language,
            context: currentCode
          });
          if (response.data.suggestions && response.data.suggestions.length > 0) {
            onApply(response.data.suggestions[0].text);
          } else {
            setError('No suggestions available');
            return;
          }
          break;

        case 'Suggest':
          response = await axios.post('/ai/suggest', {
            prompt: prompt,
            language,
            context: currentCode
          });
          if (response.data.suggestions && response.data.suggestions.length > 0) {
            // For suggest, we could show a preview first, but for now just apply
            onApply(response.data.suggestions[0].text);
          } else {
            setError('No suggestions available');
            return;
          }
          break;

        default:
          setError('Unknown action');
          return;
      }

      onClose();
    } catch (error: any) {
      console.error('Copilot error:', error);
      setError(error.response?.data?.message || 'Failed to get AI response. Make sure OpenAI API key is configured.');
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = () => {
    switch (action) {
      case 'Generate':
        return 'Generate Code';
      case 'Insert':
        return 'Insert Code';
      case 'Replace':
        return 'Replace Code';
      case 'Suggest':
        return 'Get Suggestion';
      default:
        return 'AI Copilot';
    }
  };

  const getPlaceholder = () => {
    switch (action) {
      case 'Generate':
        return 'Describe what code you want to generate...';
      case 'Insert':
        return 'Describe what code to insert...';
      case 'Replace':
        return 'Describe what code to replace and with what...';
      case 'Suggest':
        return 'Describe what code suggestion you need...';
      default:
        return 'Enter your request...';
    }
  };

  const modalContent = (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
          zIndex: 10001
        }}
      >
        <div className="modal-header">
          <h3>{getActionLabel()}</h3>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="copilot-prompt">
                {action === 'Generate' ? 'Description' : 'Prompt'} *
              </label>
              <textarea
                id="copilot-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={getPlaceholder()}
                required
                disabled={loading}
                rows={5}
                style={{ resize: 'vertical' }}
              />
            </div>
            {error && (
              <div className="error-message" style={{ marginTop: '1rem' }}>
                {error}
              </div>
            )}
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !prompt.trim()}
            >
              {loading ? 'Generating...' : action}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default CopilotModal;

