import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CollaboratorsModal from './CollaboratorsModal';

type Props = {
  repository: any;
  onDelete: (repoId: string) => void;
  onOpen: (repoId: string) => void;
  onAddCollaborator?: (repoId: string) => void;
  onCollaboratorRemoved?: () => void;
};

const RepositoryCard = ({ repository, onDelete, onOpen, onAddCollaborator, onCollaboratorRemoved }: Props) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = user?.id || user?._id;
  const [showCollaboratorsModal, setShowCollaboratorsModal] = useState(false);
  const collaboratorsRef = useRef<HTMLDivElement>(null);

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Don't navigate if clicking on buttons, collaborators section, or their children
    if (
      target.closest('button') ||
      target.closest('.repository-actions') ||
      target.closest('.repository-collaborators') ||
      target.closest('[data-collaborators="true"]')
    ) {
      return;
    }
    
    onOpen(repository._id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(repository._id);
  };

  const handleCreateRoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to repository first, then create room
    navigate(`/repository/${repository._id}`);
  };

  const handleAddCollaborator = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddCollaborator?.(repository._id);
  };

  const handleShowCollaborators = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setShowCollaboratorsModal(true);
  };

  return (
    <div className="repository-card" onClick={handleCardClick} style={{ cursor: 'pointer' }}>
      <div className="repository-header">
        <h3 className="repository-name">
          {repository.name}
        </h3>
        <div className="repository-actions">
          <button
            onClick={handleCreateRoom}
            className="btn btn-small btn-outline"
            title="Create collaboration room"
          >
            👥
          </button>
          <button
            onClick={handleAddCollaborator}
            className="btn btn-small btn-outline"
            title="Add collaborator"
          >
            ➕
          </button>
          <button
            onClick={handleDelete}
            className="btn btn-small btn-danger"
            title="Delete repository"
          >
            🗑️
          </button>
        </div>
      </div>

      <p className="repository-description">
        {repository.description || 'No description provided'}
      </p>

      <div className="repository-meta">
        <span className="repository-language">
          {repository.language || 'No language set'}
        </span>
        <span className="repository-updated">
          Updated {new Date(repository.updatedAt).toLocaleDateString()}
        </span>
      </div>

      <div 
        ref={collaboratorsRef}
        className="repository-collaborators"
        data-collaborators="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="collaborators-count-btn"
          data-collaborators="true"
          onClick={(e) => {
            e.stopPropagation();
            handleShowCollaborators(e);
          }}
          title="Click to view collaborators"
        >
          👥 {repository.collaborators?.length || 0} collaborator{repository.collaborators?.length !== 1 ? 's' : ''}
        </button>
      </div>

      {showCollaboratorsModal && (
        <CollaboratorsModal
          collaborators={repository.collaborators || []}
          owner={repository.owner}
          repositoryId={repository._id}
          currentUserId={currentUserId}
          onClose={() => setShowCollaboratorsModal(false)}
          onCollaboratorRemoved={() => {
            onCollaboratorRemoved?.();
            setShowCollaboratorsModal(false);
          }}
        />
      )}
    </div>
  );
};

export default RepositoryCard;
