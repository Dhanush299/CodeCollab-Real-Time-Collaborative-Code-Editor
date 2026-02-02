import React from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';

interface Collaborator {
  user: {
    _id?: string;
    username?: string;
    email?: string;
  } | string;
  role: 'viewer' | 'editor' | 'admin';
  addedAt?: string;
}

interface CollaboratorsModalProps {
  collaborators: Collaborator[];
  owner?: {
    _id: string;
    username: string;
  };
  repositoryId: string;
  currentUserId?: string;
  onClose: () => void;
  onCollaboratorRemoved?: () => void;
}

const CollaboratorsModal = ({ 
  collaborators, 
  owner, 
  repositoryId,
  currentUserId,
  onClose,
  onCollaboratorRemoved 
}: CollaboratorsModalProps) => {
  const isOwner = owner?._id && currentUserId && String(owner._id) === String(currentUserId);

  const handleDeleteCollaborator = async (userId: string, username: string) => {
    if (!window.confirm(`Are you sure you want to remove ${username} as a collaborator?`)) {
      return;
    }

    try {
      await axios.delete(`/repositories/${repositoryId}/collaborators/${userId}`);
      onCollaboratorRemoved?.();
      // Optionally close modal after deletion, or keep it open to show updated list
    } catch (error: any) {
      console.error('Failed to remove collaborator:', error);
      alert(error.response?.data?.message || 'Failed to remove collaborator');
    }
  };
  const getRoleBadge = (role: string) => {
    const roleColors: Record<string, string> = {
      admin: '#dc3545',
      editor: '#007bff',
      viewer: '#6c757d'
    };
    return (
      <span
        style={{
          backgroundColor: roleColors[role] || '#6c757d',
          color: 'white',
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 'bold'
        }}
      >
        {role.toUpperCase()}
      </span>
    );
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
          maxWidth: '500px',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
          zIndex: 10001
        }}
      >
        <div className="modal-header">
          <h2>Collaborators</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {owner && (
            <div className="collaborator-item owner">
              <div className="collaborator-info">
                <strong>{owner.username}</strong>
                <span className="owner-badge">Owner</span>
              </div>
            </div>
          )}
          {collaborators.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6c757d', padding: '20px' }}>
              No collaborators yet
            </p>
          ) : (
            <div className="collaborators-list">
              {collaborators.map((collab, index) => {
                const user = typeof collab.user === 'object' ? collab.user : {};
                const username = user.username || 'Unknown User';
                const userId = user._id || String(index);
                const isOwnerUser = owner?._id && userId && String(owner._id) === String(userId);
                const canDelete = isOwner && !isOwnerUser; // Only owner can delete, and can't delete themselves
                
                return (
                  <div key={userId} className="collaborator-item">
                    <div className="collaborator-info">
                      <strong>{username}</strong>
                      {user.email && <span className="collaborator-email">{user.email}</span>}
                    </div>
                    <div className="collaborator-actions">
                      <div className="collaborator-role">{getRoleBadge(collab.role)}</div>
                      {canDelete && (
                        <button
                          className="btn-delete-collaborator"
                          onClick={() => handleDeleteCollaborator(userId, username)}
                          title={`Remove ${username}`}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Render modal using portal to ensure it's at the document root
  return createPortal(modalContent, document.body);
};

export default CollaboratorsModal;

