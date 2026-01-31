const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export const createSession = async (participantCount, visibilityMode, initialDescription) => {
  const response = await fetch(`${API_URL}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      participantCount,
      visibilityMode,
      initialDescription,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create session');
  }

  return response.json();
};

export const joinSession = async (sessionId, token) => {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/join/${token}`);

  if (!response.ok) {
    throw new Error('Failed to join session');
  }

  return response.json();
};

export const getJudgment = async (sessionId) => {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/judgment`);

  if (!response.ok) {
    throw new Error('Judgment not available');
  }

  return response.json();
};

