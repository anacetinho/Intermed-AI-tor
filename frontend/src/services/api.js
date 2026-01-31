const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export const createSession = async ({ visibilityMode, initialDescription, language, model, title, workflow, lmstudioUrl, lmstudioModel }) => {
  const response = await fetch(`${API_URL}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      visibilityMode,
      initialDescription,
      language,
      model,
      title,
      workflow,
      lmstudioUrl,
      lmstudioModel
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

export const recordP2Decision = async (sessionId, participantId, decision) => {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/p2-decision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      participantId,
      decision
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to record decision');
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

export const generateP2Link = async (sessionId, participantId) => {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/generate-p2-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      participantId
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate P2 link');
  }

  return response.json();
};

// File upload for Advanced workflow
export const uploadFile = async (sessionId, participantId, stage, file) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('participantId', participantId);
  formData.append('stage', stage);

  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload file');
  }

  return response.json();
};

// Get attachments for session
export const getAttachments = async (sessionId, stage = null) => {
  const url = stage 
    ? `${API_URL}/api/sessions/${sessionId}/attachments?stage=${stage}`
    : `${API_URL}/api/sessions/${sessionId}/attachments`;
    
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to get attachments');
  }

  return response.json();
};

// Get attachment file URL
export const getAttachmentUrl = (sessionId, attachmentId) => {
  return `${API_URL}/api/sessions/${sessionId}/attachments/${attachmentId}/file`;
};

// Delete attachment
export const deleteAttachment = async (sessionId, attachmentId) => {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/attachments/${attachmentId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete attachment');
  }

  return response.json();
};

// Get P1 initial answers (for open mode)
export const getP1Answers = async (sessionId) => {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/p1-answers`);

  if (!response.ok) {
    throw new Error('Failed to get P1 answers');
  }

  return response.json();
};

// Get participant context (for debug mode)
export const getParticipantContext = async (sessionId) => {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/participant-context`);

  if (!response.ok) {
    throw new Error('Failed to get participant context');
  }

  return response.json();
};
