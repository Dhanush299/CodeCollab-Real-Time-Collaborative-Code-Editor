import React, { useState } from 'react';

type FileNode = {
  _id: string;
  name: string;
  isFolder?: boolean;
  children?: FileNode[];
};

type Props = {
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  onFileDelete: (fileId: string) => void;
  onRenameMove?: (file: FileNode) => void;
  currentFile?: any;
  canDelete?: boolean;
};

const FileTree = ({ files, onFileSelect, onFileDelete, onRenameMove, currentFile, canDelete = true }: Props) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const renderFile = (file: any, level = 0) => {
    const isSelected = currentFile && currentFile._id === file._id;
    const isExpanded = expandedFolders.has(file._id);

    return (
      <div key={file._id} style={{ paddingLeft: `${level * 20}px` }}>
        <div
          className={`file-tree-item ${isSelected ? 'selected' : ''} ${file.isFolder ? 'folder' : 'file'}`}
          onClick={() => (file.isFolder ? toggleFolder(file._id) : onFileSelect(file))}
        >
          <div className="file-tree-row">
            {file.isFolder ? (
              <span className="folder-icon">
                {isExpanded ? '📂' : '📁'}
              </span>
            ) : (
              <span className="file-icon">
                {getFileIcon(file.name)}
              </span>
            )}
            <span className="file-name">{file.name}</span>
          </div>

          {!file.isFolder && canDelete && (
            <div className="file-actions-compact">
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onRenameMove?.(file);
                }}
                className="file-rename-btn"
                title="Rename or move file"
              >
                ✏️
              </button>
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onFileDelete(file._id);
                }}
                className="file-delete-btn"
                title="Delete file"
              >
                🗑️
              </button>
            </div>
          )}
        </div>

        {file.isFolder && isExpanded && file.children && (
          <div className="file-tree-children">
            {file.children.map((child: any) => renderFile(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const icons = {
      js: '🟨',
      ts: '🔷',
      py: '🐍',
      java: '☕',
      cpp: '⚙️',
      c: '⚙️',
      rb: '💎',
      php: '🐘',
      go: '🐹',
      rs: '🦀',
      html: '🌐',
      css: '🎨',
      md: '📝',
      json: '📄',
      txt: '📄'
    };
    return (icons as any)[ext] || '📄';
  };

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <h3>Files</h3>
      </div>
      <div className="file-tree-content">
        {files.length === 0 ? (
          <div className="empty-tree">
            <p>No files yet</p>
            <small>Create your first file to get started</small>
          </div>
        ) : (
          files.map((file) => renderFile(file))
        )}
      </div>
    </div>
  );
};

export default FileTree;
