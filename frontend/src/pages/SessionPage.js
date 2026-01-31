import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { joinSession } from '../services/api';
import { connectSocket } from '../services/socket';
import { getTranslation } from '../i18n/translations';
import WaitingRoom from '../components/WaitingRoom';
import SessionRoom from '../components/SessionRoom';
import JudgmentView from '../components/JudgmentView';
import './SessionPage.css';

function SessionPage() {
  const { sessionId, token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [participantData, setParticipantData] = useState(null);
  const [sessionStatus, setSessionStatus] = useState('waiting'); // waiting, active, completed
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);

  // Get language from session data once loaded
  const language = participantData?.language || 'en';
  const t = (key) => getTranslation(language, key);

  useEffect(() => {
    const initializeSession = async () => {
      try {
        // Join session via API
        const data = await joinSession(sessionId, token);
        setParticipantData(data);
        setSessionStatus(data.status);

        // Connect to socket
        const newSocket = connectSocket();
        socketRef.current = newSocket;
        setSocket(newSocket);

        // Emit join event
        newSocket.emit('join-session', {
          sessionId: data.sessionId,
          participantId: data.participantId,
          participantNumber: data.participantNumber,
        });

        // Listen for session status changes
        newSocket.on('all-participants-ready', () => {
          setSessionStatus('ready');
        });

        newSocket.on('round-started', () => {
          setSessionStatus('active');
        });

        newSocket.on('judgment-ready', () => {
          setSessionStatus('completed');
        });

        newSocket.on('error', (data) => {
          console.error('Socket error:', data);
          setError(data.message);
        });

        setLoading(false);
      } catch (err) {
        console.error('Error initializing session:', err);
        setError(getTranslation('en', 'failedJoinSession'));
        setLoading(false);
      }
    };

    initializeSession();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [sessionId, token]);

  if (loading) {
    return (
      <div className="container">
        <div className="card glass-card">
          <div className="loading">
            <div className="spinner"></div>
            <p>{t('joiningSession')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="card error">
          <h2>{t('error')}</h2>
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={() => window.location.href = '/'}>
            {t('returnHome')}
          </button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    // P1 goes directly to SessionRoom, P2 may see waiting
    if (sessionStatus === 'waiting_p2_join' || sessionStatus === 'active' || 
        sessionStatus === 'waiting_p2_acceptance' || sessionStatus === 'p2_answering' || 
        sessionStatus === 'waiting_p1_context' || sessionStatus === 'waiting_p2_context' || 
        sessionStatus === 'fact_verification' ||
        sessionStatus === 'generating_judgment') {
      return (
        <SessionRoom
          sessionId={sessionId}
          participantId={participantData.participantId}
          participantNumber={participantData.participantNumber}
          sessionData={participantData}
          socket={socket}
        />
      );
    }

    if (sessionStatus === 'completed') {
      return <JudgmentView sessionId={sessionId} participantData={participantData} />;
    }

    if (sessionStatus === 'rejected') {
      return (
        <div className="card">
          <h2>{t('sessionRejected')}</h2>
          <p>{t('sessionRejectedDesc')}</p>
          <button className="btn btn-secondary" onClick={() => window.location.href = '/'}>
            {t('returnHome')}
          </button>
        </div>
      );
    }

    // Default waiting room
    return (
      <WaitingRoom
        sessionId={sessionId}
        participantData={participantData}
        socket={socket}
      />
    );
  };

  return (
    <div className="container">
      {renderContent()}
    </div>
  );
}

export default SessionPage;
