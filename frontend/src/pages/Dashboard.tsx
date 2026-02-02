import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import RepositoryCard from '../components/RepositoryCard';
import CreateRepositoryModal from '../components/CreateRepositoryModal';
import AddCollaboratorModal from '../components/AddCollaboratorModal';

const Dashboard = () => {
  const [repositories, setRepositories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddCollaboratorModal, setShowAddCollaboratorModal] = useState(false);
  const [collabRepoId, setCollabRepoId] = useState<string | null>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchRepositories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRepositories = async () => {
    try {
      const response = await axios.get('/repositories');
      setRepositories(response.data.repositories);
    } catch (error) {
      console.error('Failed to fetch repositories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRepository = async (repoData: any) => {
    try {
      const response = await axios.post('/repositories', repoData);
      setRepositories([response.data.repository, ...repositories]);
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to create repository:', error);
      alert('Failed to create repository');
    }
  };

  const handleDeleteRepository = async (repoId: string) => {
    if (!window.confirm('Are you sure you want to delete this repository?')) {
      return;
    }

    try {
      await axios.delete(`/repositories/${repoId}`);
      setRepositories(repositories.filter((repo) => repo._id !== repoId));
    } catch (error) {
      console.error('Failed to delete repository:', error);
      alert('Failed to delete repository');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleOpenAddCollaborator = (repoId: string) => {
    setCollabRepoId(repoId);
    setShowAddCollaboratorModal(true);
  };

  const handleAddCollaborator = async ({ email, role }: { email: string; role: string }) => {
    if (!collabRepoId) return;
    try {
      const res = await axios.post(`/repositories/${collabRepoId}/collaborators`, {
        email,
        role
      });
      if (res.data?.message) {
        console.log(res.data.message);
      }
      await fetchRepositories();
      setShowAddCollaboratorModal(false);
      setCollabRepoId(null);
    } catch (error: any) {
      console.error('Failed to add collaborator:', error);
      alert(error.response?.data?.message || 'Failed to add collaborator');
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>CodeCollab</h1>
        </div>
        <div className="header-right">
          <span className="user-info">Welcome, {user?.username}</span>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
            New Repository
          </button>
          <button onClick={handleLogout} className="btn btn-secondary">
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="repositories-section">
          <h2>Your Repositories</h2>

          {repositories.length === 0 ? (
            <div className="empty-state">
              <p>You don't have any repositories yet.</p>
              <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
                Create Your First Repository
              </button>
            </div>
          ) : (
            <div className="repositories-grid">
              {repositories.map((repo) => (
                <RepositoryCard
                  key={repo._id}
                  repository={repo}
                  onDelete={handleDeleteRepository}
                  onOpen={(id: string) => navigate(`/repository/${id}`)}
                  onAddCollaborator={handleOpenAddCollaborator}
                  onCollaboratorRemoved={fetchRepositories}
                />
              ))}
            </div>
          )}
        </div>

        <div className="quick-actions">
          <h3>Quick Actions</h3>
          <button onClick={() => navigate('/join-room')} className="btn btn-outline">
            Join Collaboration Room
          </button>
        </div>
      </main>

      {showCreateModal && <CreateRepositoryModal onClose={() => setShowCreateModal(false)} onCreate={handleCreateRepository} />}
      {showAddCollaboratorModal && (
        <AddCollaboratorModal
          onClose={() => {
            setShowAddCollaboratorModal(false);
            setCollabRepoId(null);
          }}
          onAdd={handleAddCollaborator}
        />
      )}
    </div>
  );
};

export default Dashboard;


