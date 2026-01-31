import React, { useState, useEffect } from 'react';
import './WaitingRoom.css';

function WaitingRoom({ sessionId, participantData, socket }) {
  const [participantsJoined, setParticipantsJoined] = useState(1);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on('participant-joined', (data) => {
      setParticipantsJoined(data.totalJoined);
      setTotalParticipants(data.totalExpected);
    });

    socket.on('all-participants-ready', () => {
      setIsReady(true);
    });

    socket.on('participant-disconnected', (data) => {
      console.log(`Participant ${data.participantNumber} disconnected`);
    });
  }, [socket]);

  const handleStartSession = () => {
    if (socket && participantData.isInitiator && isReady) {
      socket.emit('start-session', { sessionId });
    }
  };

  return (
    <div className="card glass-card">
      <h1>⏳ Waiting Room</h1>
      
      {participantData.conflictDescription && (
        <div className="conflict-topic-section">
          <h3>🎯 Conflict Topic</h3>
          <div className="conflict-topic">
            {participantData.conflictDescription}
          </div>
        </div>
      )}
      
      <div className="participant-info">
        <p className="your-role">
          You are: <span className="badge badge-info">Participant {participantData.participantNumber}</span>
          {participantData.isInitiator && <span className="badge badge-warning">Session Initiator</span>}
        </p>
      </div>

      <div className="progress-section">
        <h3>Waiting for Participants</h3>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${(participantsJoined / totalParticipants) * 100}%` }}
          ></div>
        </div>
        <p className="progress-text">
          {participantsJoined} of {totalParticipants} participants joined
        </p>
      </div>

      <div className="instructions">
        <h3>📋 What to Expect</h3>
        <ul>
          <li>Participant 1 will answer initial questions about the conflict</li>
          <li>Participant 2 will review and decide whether to accept</li>
          <li>Both participants will have a chance to provide their perspective</li>
          {participantData.visibilityMode === 'open' && (
            <li>You can see and dispute other participant's responses</li>
          )}
          <li>The AI will provide a comprehensive judgment on a 6-point scale</li>
        </ul>
      </div>

      {isReady && participantData.isInitiator && (
        <button
          className="btn btn-primary"
          onClick={handleStartSession}
          aria-label="Start mediation session"
        >
          Start Mediation Session
        </button>
      )}

      {isReady && !participantData.isInitiator && (
        <div className="waiting-message">
          <p>✅ All participants are here! Waiting for the initiator to start the session...</p>
        </div>
      )}
    </div>
  );
}

export default WaitingRoom;
