import React, { useState } from 'react';
import { createSession } from '../services/api';
import './HomePage.css';

function HomePage() {
  const [participantCount, setParticipantCount] = useState(2);
  const [visibilityMode, setVisibilityMode] = useState('blind');
  const [initialDescription, setInitialDescription] = useState('');
  const [sessionCreated, setSessionCreated] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCreateSession = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await createSession(
        parseInt(participantCount),
        visibilityMode,
        initialDescription
      );
      
      setSessionData(data);
      setSessionCreated(true);
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Failed to create session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getParticipantLink = (token) => {
    return `${window.location.origin}/session/${sessionData.sessionId}/${token}`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Link copied to clipboard!');
  };

  if (sessionCreated && sessionData) {
    return (
      <div className="container">
        <div className="card">
          <h1>✅ Session Created Successfully!</h1>
          <p className="session-id">Session ID: <strong>{sessionData.sessionId}</strong></p>
          
          <div className="links-section">
            <h2>Participant Links</h2>
            <p className="instruction">
              Share these unique links with each participant. Each person should use their designated link.
            </p>
            
            {sessionData.participants.map((participant) => (
              <div key={participant.participantNumber} className="participant-link">
                <div className="link-header">
                  <span className="badge badge-info">
                    Participant {participant.participantNumber}
                    {participant.isInitiator && ' (Initiator)'}
                  </span>
                </div>
                <div className="link-content">
                  <input
                    type="text"
                    value={getParticipantLink(participant.token)}
                    readOnly
                    className="link-input"
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={() => copyToClipboard(getParticipantLink(participant.token))}
                  >
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="settings-summary">
            <h3>Session Settings</h3>
            <p><strong>Participants:</strong> {participantCount}</p>
            <p><strong>Visibility Mode:</strong> {visibilityMode === 'open' ? 'Open (participants can see each other\'s responses)' : 'Blind (responses hidden until final judgment)'}</p>
            {initialDescription && (
              <p><strong>Initial Description:</strong> {initialDescription}</p>
            )}
          </div>

          <button
            className="btn btn-primary"
            onClick={() => {
              setSessionCreated(false);
              setSessionData(null);
              setInitialDescription('');
            }}
          >
            Create Another Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h1>🤝 IntermediAItor</h1>
        <p className="subtitle">AI-Powered Conflict Resolution Platform</p>
        
        <form onSubmit={handleCreateSession}>
          <div className="form-group">
            <label>Number of Participants</label>
            <input
              type="number"
              min="2"
              max="10"
              value={participantCount}
              onChange={(e) => setParticipantCount(e.target.value)}
              required
            />
            <small>Minimum 2 participants required</small>
          </div>

          <div className="form-group">
            <label>Visibility Mode</label>
            <select
              value={visibilityMode}
              onChange={(e) => setVisibilityMode(e.target.value)}
            >
              <option value="blind">Blind Mode - Responses hidden from other participants</option>
              <option value="open">Open Mode - Participants can see and dispute responses</option>
            </select>
            <small>
              {visibilityMode === 'open'
                ? 'Participants can see each other\'s responses in real-time and mark disputes'
                : 'Responses remain private until the final AI judgment'}
            </small>
          </div>

          <div className="form-group">
            <label>Initial Conflict Description (Optional)</label>
            <textarea
              rows="4"
              value={initialDescription}
              onChange={(e) => setInitialDescription(e.target.value)}
              placeholder="Briefly describe the conflict situation to help the AI understand the context..."
            />
            <small>This helps the AI ask better initial questions</small>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-large"
            disabled={loading}
          >
            {loading ? 'Creating Session...' : 'Create Session'}
          </button>
        </form>

        <div className="info-section">
          <h3>How It Works</h3>
          <ol>
            <li>Create a session and share unique links with participants</li>
            <li>Each participant joins and describes their perspective</li>
            <li>AI conducts 4 rounds of targeted questions</li>
            <li>Participants answer questions (and dispute if visibility is open)</li>
            <li>AI analyzes all information and provides a fair judgment</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
