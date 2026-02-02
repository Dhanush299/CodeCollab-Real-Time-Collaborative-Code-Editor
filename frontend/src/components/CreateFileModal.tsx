import React, { useState } from 'react';

type FormData = {
  name: string;
  content: string;
  language: string;
  isFolder: boolean;
  parentFolder: string;
};

type Props = {
  onClose: () => void;
  onCreate: (data: FormData) => Promise<any> | any;
  files: any[];
};

const CreateFileModal = ({ onClose, onCreate, files }: Props) => {
  const [formData, setFormData] = useState({
    name: '',
    content: '',
    language: 'javascript',
    isFolder: false,
    parentFolder: ''
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target as any;
    const { name, value, type, checked } = target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onCreate(formData);
      setFormData({
        name: '',
        content: '',
        language: 'javascript',
        isFolder: false,
        parentFolder: ''
      });
    } catch (error) {
      console.error('Create file error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get all folders for parent selection
  const getFolders = (fileList: any[], level = 0) => {
    let folders: any[] = [];
    fileList.forEach((file) => {
      if (file.isFolder) {
        folders.push({
          ...file,
          displayName: '  '.repeat(level) + file.name
        });
        if (file.children) {
          folders = folders.concat(getFolders(file.children, level + 1));
        }
      }
    });
    return folders;
  };

  const folders = getFolders(files);

  const languages = [
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'cpp', label: 'C++' },
    { value: 'c', label: 'C' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'php', label: 'PHP' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'json', label: 'JSON' },
    { value: 'txt', label: 'Text' }
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create New File/Folder</h3>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                disabled={loading}
                placeholder={formData.isFolder ? "folder-name" : "file-name.js"}
              />
            </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="isFolder"
                checked={formData.isFolder}
                onChange={handleChange}
                disabled={loading}
              />
              This is a folder
            </label>
          </div>

          {!formData.isFolder && (
            <>
              <div className="form-group">
                <label htmlFor="language">Language</label>
                <select
                  id="language"
                  name="language"
                  value={formData.language}
                  onChange={handleChange}
                  disabled={loading}
                >
                  {languages.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="content">Initial Content</label>
                <textarea
                  id="content"
                  name="content"
                  value={formData.content}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="Optional initial content"
                  rows={6}
                />
              </div>
            </>
          )}

          {folders.length > 0 && (
            <div className="form-group">
              <label htmlFor="parentFolder">Parent Folder (optional)</label>
              <select
                id="parentFolder"
                name="parentFolder"
                value={formData.parentFolder}
                onChange={handleChange}
                disabled={loading}
              >
                <option value="">Root directory</option>
                {folders.map((folder) => (
                  <option key={folder._id} value={folder._id}>
                    {folder.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !formData.name.trim()}
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateFileModal;
