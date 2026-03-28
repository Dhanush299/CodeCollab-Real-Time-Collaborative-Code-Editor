import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import FileTree from '../components/FileTree';
import CreateFileModal from '../components/CreateFileModal';
import RunCodeModal from '../components/RunCodeModal';

const Repository = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [repository, setRepository] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [currentFile, setCurrentFile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [customRoomId, setCustomRoomId] = useState('');
  const [roomError, setRoomError] = useState('');
  const editorRef = useRef<any>(null);

  useEffect(() => {
    fetchRepository();
    fetchFiles();
  }, [id]);

  const fetchRepository = async () => {
    try {
      const response = await axios.get(`/repositories/${id}`);
      setRepository(response.data.repository);
    } catch (error) {
      console.error('Failed to fetch repository:', error);
      navigate('/');
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await axios.get(`/files/repository/${id}`);
      setFiles(response.data.files);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch files:', error);
      setLoading(false);
    }
  };

  const handleFileSelect = async (file: any) => {
    if (file.isFolder) return;

    // Clear any pending save operations for the previous file
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      const response = await axios.get(`/files/${file._id}`);
      setCurrentFile(response.data.file);
      setEditorContent(response.data.file.content || '');
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  const handleFileCreate = async (fileData: any) => {
    try {
      const response = await axios.post('/files', {
        ...fileData,
        repositoryId: id
      });
      await fetchFiles(); // Refresh file tree
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to create file:', error);
      alert('Failed to create file');
    }
  };

  const handleFileUpdate = async (content: string, language?: string) => {
    const file = currentFileRef.current;
    if (!file) return;

    try {
      await axios.put(`/files/${file._id}`, { content, ...(language ? { language } : {}) });
      // Update local state using functional updates to avoid stale closures
      const updatedFile = { ...file, content, ...(language ? { language } : {}) };
      setCurrentFile(updatedFile);
      currentFileRef.current = updatedFile;
      // Update in files list using functional update
      setFiles((prevFiles) =>
        prevFiles.map((f) => (f._id === file._id ? updatedFile : f))
      );
    } catch (error) {
      console.error('Failed to update file:', error);
      alert('Failed to save file changes. Please try again.');
    }
  };

  const handleFileDelete = async (fileId: string) => {
    if (!window.confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      await axios.delete(`/files/${fileId}`);
      await fetchFiles();
      if (currentFile && currentFile._id === fileId) {
        setCurrentFile(null);
        setEditorContent('');
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Failed to delete file');
    }
  };

  const handleCreateRoom = async (roomIdOverride: string | null = null) => {
    try {
      const payload: any = { repositoryId: id };
      if (roomIdOverride) {
        payload.roomId = roomIdOverride;
      }
      const response = await axios.post('/rooms', payload);
      setRoomId(response.data.room.roomId);
      setShowRoomModal(false);
      setCustomRoomId('');
      setRoomError('');
      navigate(`/room/${response.data.room.roomId}`);
    } catch (error: any) {
      console.error('Failed to create room:', error);
      const msg = error.response?.data?.message || 'Failed to create collaboration room';
      setRoomError(msg);
      alert(msg);
    }
  };

  const handleCustomRoomCreate = () => {
    const trimmed = customRoomId.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setRoomError('Room ID must be exactly 6 digits.');
      return;
    }
    handleCreateRoom(trimmed);
  };

  const [editorContent, setEditorContent] = useState('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentFileRef = useRef<any>(null);

  // Keep currentFileRef in sync with currentFile
  useEffect(() => {
    currentFileRef.current = currentFile;
  }, [currentFile]);

  const handleEditorChange = (value?: string) => {
    const newContent = value || '';
    setEditorContent(newContent);
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce the save operation
    saveTimeoutRef.current = setTimeout(() => {
      const file = currentFileRef.current;
      if (file) {
        handleFileUpdate(newContent);
      }
    }, 500); // Wait 500ms after user stops typing
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  if (loading) {
    return (
      <div className="repository-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (!repository) {
    return (
      <div className="repository-container">
        <div className="error-message">Repository not found</div>
      </div>
    );
  }

  return (
    <div className="repository-container">
      <header className="repository-header">
        <div className="header-left">
          <button onClick={() => navigate('/')} className="btn btn-link">
            ← Back to Dashboard
          </button>
          <h1>{repository.name}</h1>
          {repository.description && (
            <p className="repository-description">{repository.description}</p>
          )}
        </div>
        <div className="header-right">
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-outline"
          >
            New File
          </button>
          <button
            onClick={() => setShowRoomModal(true)}
            className="btn btn-primary"
          >
            Create Room
          </button>
        </div>
      </header>

      <div className="repository-content">
        <div className="file-tree-panel">
          <FileTree
            files={files}
            onFileSelect={handleFileSelect}
            onFileDelete={handleFileDelete}
            currentFile={currentFile}
          />
        </div>

        <div className="editor-panel">
          {currentFile ? (
            <>
              <div className="editor-header">
                <span className="file-name">{currentFile.name}</span>
                <div className="file-actions">
                  <select
                    value={currentFile.language}
                    onChange={(e) => handleFileUpdate(editorContent, e.target.value)}
                    className="language-select"
                  >
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="python">Python</option>
                    <option value="java">Java</option>
                    <option value="cpp">C++</option>
                    <option value="c">C</option>
                    <option value="ruby">Ruby</option>
                    <option value="php">PHP</option>
                    <option value="go">Go</option>
                    <option value="rust">Rust</option>
                    <option value="html">HTML</option>
                    <option value="css">CSS</option>
                    <option value="markdown">Markdown</option>
                  </select>
                  <button
                    onClick={() => setShowRunModal(true)}
                    className="btn btn-primary"
                  >
                    Run Code
                  </button>
                </div>
              </div>

              <div className="editor-wrapper">
                <Editor
                  key={currentFile._id}
                  height="100%"
                  language={currentFile.language}
                  value={editorContent}
                  onChange={handleEditorChange}
                  onMount={handleEditorDidMount}
                  options={{
                    minimap: { enabled: true },
                    fontSize: 14,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    tabSize: 2,
                    insertSpaces: true,
                    readOnly: false
                  }}
                />
              </div>
            </>
          ) : (
            <div className="no-file-selected">
              <h3>Select a file to start editing</h3>
              <p>Choose a file from the file tree on the left, or create a new one.</p>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateFileModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleFileCreate}
          files={files}
        />
      )}

      {showRunModal && currentFile && (
        <RunCodeModal
          onClose={() => setShowRunModal(false)}
          file={currentFile}
          repoFiles={files}
          getEditorContent={() => editorRef.current?.getValue() || editorContent}
        />
      )}

      {showRoomModal && (
        <div className="modal-overlay" onClick={() => setShowRoomModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Room</h3>
              <button onClick={() => setShowRoomModal(false)} className="close-btn">&times;</button>
            </div>
            <div className="modal-body">
              <p className="room-modal-description">Choose how you want to set the room ID:</p>
              
              <div className="room-creation-options">
                <button 
                  className="btn btn-primary btn-block" 
                  onClick={() => handleCreateRoom(null)}
                >
                  Generate unique 6-digit ID
                </button>
                
                <div className="form-group" style={{ marginTop: '1.5rem' }}>
                  <label htmlFor="customRoomId">Use custom 6-digit ID</label>
                  <div className="custom-room-input-group">
                    <input
                      id="customRoomId"
                      type="text"
                      maxLength={6}
                      placeholder="e.g., 123456"
                      value={customRoomId}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, ''); // Only allow digits
                        setCustomRoomId(value);
                        setRoomError('');
                      }}
                      className="custom-room-input"
                    />
                    <button 
                      className="btn btn-outline" 
                      onClick={handleCustomRoomCreate}
                    >
                      Create
                    </button>
                  </div>
                </div>
                
                {roomError && (
                  <div className="error-message" style={{ marginTop: '1rem' }}>
                    {roomError}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Repository;
