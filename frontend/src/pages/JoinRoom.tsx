import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const JoinRoom = () => {
  const { isAuthenticated } = useAuth();
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const trimmedId = roomId.trim();
    if (!trimmedId) {
      setError('Please enter a room ID');
      setLoading(false);
      return;
    }

    try {
      if (!isAuthenticated) {
        setError('Please log in first.');
        return;
      }
      // Check if room exists and join it
      await axios.post(`/rooms/${trimmedId}/join`);
      navigate(`/room/${trimmedId}`);
    } catch (error: any) {
      console.error('Join room error:', error);
      setError(error.response?.data?.message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Join Collaboration Room</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="roomId">Room ID</label>
            <input
              type="text"
              id="roomId"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room ID to join"
              required
              disabled={loading}
            />
            <small className="form-help">
              Ask your collaborator for the room ID
            </small>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !roomId.trim()}
          >
            {loading ? 'Joining...' : 'Join Room'}
          </button>
        </form>

        <div className="auth-links">
          <button
            onClick={() => navigate('/')}
            className="btn btn-link"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default JoinRoom;
