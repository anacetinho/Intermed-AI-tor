import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordP2Decision, generateP2Link, uploadFile, getAttachments, getAttachmentUrl, deleteAttachment, getP1Answers, getParticipantContext } from '../services/api';
import { getTranslation } from '../i18n/translations';
import './SessionRoom.css';

function SessionRoom({ sessionId, participantId, participantNumber, sessionData, socket }) {
  const navigate = useNavigate();
  const [stage, setStage] = useState('loading');
  const [loading, setLoading] = useState(false);
  
  const language = sessionData.language || 'en';
  const t = (key) => getTranslation(language, key);
  
  // P2 link for sharing
  const [p2Link, setP2Link] = useState('');
  const [showP2Link, setShowP2Link] = useState(false);
  
  // P1 initial answers
  const [p1Answers, setP1Answers] = useState({
    whatHappened: '',
    whatLedToIt: '',
    howItMadeThemFeel: '',
    desiredOutcome: ''
  });
  
  // P2 acceptance data
  const [aiSummary, setAiSummary] = useState('');
  const [aiBriefing, setAiBriefing] = useState('');
  
  // P2 response
  const [p2Response, setP2Response] = useState({
    disputeText: '',
    whatHappened: '',
    whatLedToIt: '',
    howItMadeThemFeel: '',
    desiredOutcome: ''
  });
  
  // Context rounds
  const [disputePoints, setDisputePoints] = useState([]);
  const [p1Context, setP1Context] = useState('');
  const [p2Context, setP2Context] = useState('');
  const [p1ContextFromOther, setP1ContextFromOther] = useState('');
  const [p2SummaryForP1Context, setP2SummaryForP1Context] = useState('');
  
  // File attachments (advanced workflow)
  const [attachments, setAttachments] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef(null);
  
  // Fact verification (advanced workflow)
  const [factList, setFactList] = useState([]);
  const [factVerifications, setFactVerifications] = useState({});
  const [factVerificationSubmitted, setFactVerificationSubmitted] = useState(false);
  
    // Email notification (enabled)
    const [email, setEmail] = useState('');
    const [emailSaved, setEmailSaved] = useState(false);

    // Debug mode
    const [debugMode, setDebugMode] = useState(false);
  const [participantContext, setParticipantContext] = useState(null);
  
  // P1 answers for open mode display
  const [p1AnswersForDisplay, setP1AnswersForDisplay] = useState(null);
  
  // Status messages
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!socket) return;
    
    // Determine initial stage based on session status and participant number
    determineStage();

    // Socket event listeners
    socket.on('p1-answers-submitted', (data) => {
      if (participantNumber === 1) {
        if (data && data.p2Link) {
          setP2Link(data.p2Link);
          setShowP2Link(true);
        }
        setStage('waiting-p2-acceptance');
        setStatusMessage(t('waitingP2Accept'));
      }
    });

    socket.on('p2-summary-ready', ({ summary, briefing }) => {
      setAiSummary(summary);
      setAiBriefing(briefing);
      if (participantNumber === 2) {
        setStage('p2-acceptance');
      }
    });

    socket.on('p2-decision-made', ({ decision }) => {
      setLoading(false); // Reset loading state after decision is processed
      if (decision === 'rejected') {
        setStage('rejected');
      } else if (decision === 'accepted') {
        if (participantNumber === 2) {
          setStage('p2-answering');
        } else {
          setStage('waiting-p2-response');
          setStatusMessage(t('p2AcceptedWaiting'));
        }
      }
    });

    socket.on('p2-response-submitted', () => {
      setLoading(false); // Reset loading state
      if (participantNumber === 2) {
        setStage('waiting-p1-context');
        setStatusMessage(t('waitingP1Context'));
      }
    });

    socket.on('dispute-points-ready', ({ disputePoints: points, p2Response: response, p2SummaryForContext }) => {
      setDisputePoints(points);
      if (sessionData.visibilityMode === 'open' && response) {
        setP2Response(response);
      }
      if (p2SummaryForContext) {
        setP2SummaryForP1Context(p2SummaryForContext);
      }
      if (participantNumber === 1) {
        setStage('p1-add-context');
      }
    });

    socket.on('p1-context-submitted', () => {
      setLoading(false); // Reset loading state
      if (participantNumber === 1) {
        setStage('waiting-p2-context');
        setStatusMessage(t('waitingP2Context'));
      }
    });

    socket.on('p1-context-ready', ({ contextSummary }) => {
      setP1ContextFromOther(contextSummary);
      if (participantNumber === 2) {
        setStage('p2-add-context');
      }
    });

    socket.on('p2-context-submitted', () => {
      setLoading(false); // Reset loading state
      if (participantNumber === 2) {
        setStage('generating-judgment');
        setStatusMessage(t('generatingJudgment'));
      }
    });

    socket.on('judgment-ready', () => {
      setStage('judgment-ready');
    });

    // Advanced workflow - fact verification events
    socket.on('fact-list-ready', ({ factList: facts }) => {
      setFactList(facts);
      // Initialize verifications state
      const initialVerifications = {};
      facts.forEach((fact, index) => {
        initialVerifications[index] = { status: '', comment: '' };
      });
      setFactVerifications(initialVerifications);
      setStage('fact-verification');
      setLoading(false);
    });

    socket.on('fact-verification-submitted', () => {
      setFactVerificationSubmitted(true);
      setLoading(false);
      // Transition to waiting stage - will be overridden by waiting-other-verification or judgment-ready
      setStage('waiting-other-verification');
      setStatusMessage(t('waitingOtherVerification'));
    });

    socket.on('waiting-other-verification', () => {
      setStage('waiting-other-verification');
      setStatusMessage(t('waitingOtherVerification'));
      setLoading(false);
    });

    socket.on('error', ({ message }) => {
      alert(`Error: ${message}`);
      setLoading(false);
    });

    return () => {
      socket.off('p1-answers-submitted');
      socket.off('p2-summary-ready');
      socket.off('p2-decision-made');
      socket.off('p2-response-submitted');
      socket.off('dispute-points-ready');
      socket.off('p1-context-submitted');
      socket.off('p1-context-ready');
      socket.off('p2-context-submitted');
      socket.off('judgment-ready');
      socket.off('fact-list-ready');
      socket.off('fact-verification-submitted');
      socket.off('waiting-other-verification');
      socket.off('error');
    };
  }, [socket, participantNumber, sessionData]);

  // Fetch P1 answers for open mode when P2 is answering
  useEffect(() => {
    const fetchP1Answers = async () => {
      if (sessionData.visibilityMode === 'open' && participantNumber === 2 && 
          (stage === 'p2-answering' || stage === 'p2-acceptance')) {
        try {
          const answers = await getP1Answers(sessionId);
          setP1AnswersForDisplay(answers);
        } catch (error) {
          console.error('Failed to fetch P1 answers:', error);
        }
      }
    };
    fetchP1Answers();
  }, [sessionId, sessionData.visibilityMode, participantNumber, stage]);

  // Fetch participant context for debug mode
  useEffect(() => {
    const fetchContext = async () => {
      if (debugMode) {
        try {
          const context = await getParticipantContext(sessionId);
          setParticipantContext(context);
        } catch (error) {
          console.error('Failed to fetch participant context:', error);
        }
      }
    };
    fetchContext();
    // Poll for updates when debug mode is on
    const interval = debugMode ? setInterval(fetchContext, 5000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionId, debugMode, stage]);

  const determineStage = () => {
    const status = sessionData.status;
    
    if (status === 'rejected') {
      setStage('rejected');
    } else if (status === 'completed') {
      setStage('judgment-ready');
    } else if (status === 'generating_judgment') {
      setStage('generating-judgment');
      setStatusMessage(t('generatingJudgment'));
    } else if (status === 'fact_verification') {
      // Advanced workflow - fact verification stage
      // Check if we have fact list data in sessionData
      if (sessionData.factList) {
        setFactList(sessionData.factList);
        const initialVerifications = {};
        sessionData.factList.forEach((fact, index) => {
          initialVerifications[index] = { status: '', comment: '' };
        });
        setFactVerifications(initialVerifications);
      }
      // Check if this participant already submitted their verification
      const myVerification = participantNumber === 1 
        ? sessionData.p1FactVerifications 
        : sessionData.p2FactVerifications;
      if (myVerification) {
        setFactVerificationSubmitted(true);
        setStage('waiting-other-verification');
        setStatusMessage(t('waitingOtherVerification'));
      } else {
        setStage('fact-verification');
      }
    } else if (participantNumber === 1) {
      if (status === 'waiting' || status === 'waiting_p2_join') {
        setStage('p1-initial-questions');
      } else if (status === 'waiting_p2_acceptance') {
        setStage('waiting-p2-acceptance');
        setStatusMessage(t('waitingP2Accept'));
      } else if (status === 'p2_answering') {
        setStage('waiting-p2-response');
        setStatusMessage(t('p2AcceptedWaiting'));
      } else if (status === 'waiting_p1_context') {
        setStage('p1-add-context');
      } else if (status === 'waiting_p2_context') {
        setStage('waiting-p2-context');
        setStatusMessage(t('waitingP2Context'));
      }
    } else if (participantNumber === 2) {
      if (status === 'waiting' || status === 'waiting_p2_join') {
        // P1 hasn't submitted yet
        setStage('waiting-p1-submission');
        setStatusMessage(t('waitingP1Submit'));
      } else if (status === 'waiting_p2_acceptance') {
        // P1 has submitted, P2 needs to review and accept/reject
        // Load AI summary from sessionData if available
        if (sessionData.aiSummaryP1) {
          setAiSummary(sessionData.aiSummaryP1);
        }
        if (sessionData.aiBriefingP2) {
          setAiBriefing(sessionData.aiBriefingP2);
        }
        setStage('p2-acceptance');
      } else if (status === 'p2_answering') {
        // Also load AI summary for the answering stage
        if (sessionData.aiSummaryP1) {
          setAiSummary(sessionData.aiSummaryP1);
        }
        setStage('p2-answering');
      } else if (status === 'waiting_p1_context') {
        setStage('waiting-p1-context');
        setStatusMessage(t('waitingP1Context'));
      } else if (status === 'waiting_p2_context') {
        setStage('p2-add-context');
      }
    }
  };

  // Handlers
  const handleP1Submit = (e) => {
    e.preventDefault();
    if (!p1Answers.whatHappened || !p1Answers.whatLedToIt || !p1Answers.howItMadeThemFeel || !p1Answers.desiredOutcome) {
      alert('Please answer all questions');
      return;
    }
    setLoading(true);
    socket.emit('submit-p1-answers', {
      sessionId,
      participantId,
      answers: p1Answers
    });
    // P2 link will be received via socket event after backend processes answers
  };

  const handleP2Decision = async (decision) => {
    setLoading(true);
    try {
      await recordP2Decision(sessionId, participantId, decision);
      socket.emit('p2-decision', {
        sessionId,
        participantId,
        decision
      });
    } catch (error) {
      alert('Failed to record decision');
      setLoading(false);
    }
  };

  const handleP2Submit = (e) => {
    e.preventDefault();
    const responseType = sessionData.visibilityMode === 'open' ? 'dispute_text' : 'answer_set';
    
    if (responseType === 'dispute_text' && !p2Response.disputeText) {
      alert('Please provide your response');
      return;
    }
    if (responseType === 'answer_set' && (!p2Response.whatHappened || !p2Response.whatLedToIt || !p2Response.howItMadeThemFeel || !p2Response.desiredOutcome)) {
      alert('Please answer all questions');
      return;
    }
    
    setLoading(true);
    socket.emit('submit-p2-response', {
      sessionId,
      participantId,
      response: {
        responseType,
        ...p2Response
      }
    });
  };

  const handleP1ContextSubmit = (e) => {
    e.preventDefault();
    if (!p1Context.trim()) {
      alert('Please provide additional context');
      return;
    }
    setLoading(true);
    socket.emit('submit-p1-context', {
      sessionId,
      participantId,
      contextText: p1Context
    });
  };

  const handleP2ContextSubmit = (e) => {
    e.preventDefault();
    if (!p2Context.trim()) {
      alert('Please provide additional context');
      return;
    }
    setLoading(true);
    socket.emit('submit-p2-context', {
      sessionId,
      participantId,
      contextText: p2Context
    });
  };

  const handleViewJudgment = () => {
    navigate(`/judgment/${sessionId}`);
  };

  // File upload handlers (advanced workflow)
  const loadAttachments = async (stage) => {
    try {
      const files = await getAttachments(sessionId, stage);
      setAttachments(files || []);
    } catch (error) {
      console.error('Failed to load attachments:', error);
    }
  };

  const handleFileSelect = async (e, stage) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploadingFile(true);
    try {
      for (const file of files) {
        await uploadFile(sessionId, participantId, stage, file);
      }
      await loadAttachments(stage);
    } catch (error) {
      alert(error.message || t('uploadFailed'));
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAttachment = async (attachmentId, stage) => {
    try {
      await deleteAttachment(sessionId, attachmentId);
      await loadAttachments(stage);
    } catch (error) {
      alert(t('deleteFailed'));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e, stage) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    
    setUploadingFile(true);
    try {
      for (const file of files) {
        await uploadFile(sessionId, participantId, stage, file);
      }
      await loadAttachments(stage);
    } catch (error) {
      alert(error.message || t('uploadFailed'));
    } finally {
      setUploadingFile(false);
    }
  };

  // Fact verification handlers (advanced workflow)
  const handleFactVerificationChange = (factIndex, field, value) => {
    setFactVerifications(prev => ({
      ...prev,
      [factIndex]: {
        ...prev[factIndex],
        [field]: value
      }
    }));
  };

  const handleSubmitFactVerification = () => {
    // Validate all facts have a status
    const allVerified = factList.every((_, index) => 
      factVerifications[index]?.status
    );
    
    if (!allVerified) {
      alert(t('pleaseVerifyAllFacts'));
      return;
    }
    
    setLoading(true);
    socket.emit('submit-fact-verification', {
      sessionId,
      participantId,
      verifications: factVerifications
    });
  };

  // File upload component (available for both simple and advanced workflows)
  const renderFileUpload = (currentStage) => {
    return (
      <div className="file-upload-section">
        <h4>{t('attachments')}</h4>
        <p className="help-text">{t('attachEvidence')}</p>
        
        <div 
          className="dropzone"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, currentStage)}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFileSelect(e, currentStage)}
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt,.csv"
            style={{ display: 'none' }}
          />
          {uploadingFile ? (
            <div className="uploading">
              <div className="spinner-small"></div>
              <span>{t('uploading')}</span>
            </div>
          ) : (
            <div className="dropzone-content">
              <span className="dropzone-icon">📎</span>
              <span>{t('dragDropFiles')}</span>
              <span className="dropzone-or">{t('or')}</span>
              <span className="dropzone-click">{t('uploadFile')}</span>
            </div>
          )}
        </div>
        
        {attachments.length > 0 && (
          <div className="attachments-list">
            {attachments.map((file) => (
              <div key={file.id} className="attachment-item">
                <span className="attachment-icon">
                  {file.file_type === 'image' ? '🖼️' : '📄'}
                </span>
                <span className="attachment-name">{file.original_name}</span>
                <span className="attachment-size">
                  {(file.file_size / 1024).toFixed(1)} KB
                </span>
                <button
                  className="btn-icon btn-delete"
                  onClick={() => handleDeleteAttachment(file.id, currentStage)}
                  title={t('delete')}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Fact verification component (advanced workflow)
  const renderFactVerification = () => (
    <div className="session-content fact-verification">
      <h2>{t('factVerification')}</h2>
      <p className="fact-verification-desc">{t('factVerificationDesc')}</p>
      
      <div className="facts-list">
        {factList.map((fact, index) => (
          <div key={index} className="fact-card">
            <div className="fact-content">
              <span className="fact-number">{index + 1}.</span>
              <span className="fact-text">{fact.statement}</span>
            </div>
            <div className="fact-source">
              <span className="source-label">{t('statedBy')}:</span>
              <span className="source-value">
                {fact.source === 'p1' ? t('participant1') :
                 fact.source === 'p2' ? t('participant2') : 
                 t('bothParticipants')}
              </span>
            </div>
            
            <div className="fact-verification-controls">
              <select
                value={factVerifications[index]?.status || ''}
                onChange={(e) => handleFactVerificationChange(index, 'status', e.target.value)}
                className="verification-select"
              >
                <option value="">{t('selectVerification')}</option>
                <option value="agree">{t('agree')}</option>
                <option value="disagree">{t('disagree')}</option>
                <option value="partially">{t('partiallyAgree')}</option>
              </select>
              
              <input
                type="text"
                className="verification-comment"
                placeholder={t('optionalComment')}
                value={factVerifications[index]?.comment || ''}
                onChange={(e) => handleFactVerificationChange(index, 'comment', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
      
      <button 
        className="btn btn-primary" 
        onClick={handleSubmitFactVerification}
        disabled={loading}
      >
        {loading ? t('submitting') : t('submitVerification')}
      </button>
    </div>
  );

  // Render functions for each stage
  const renderP1InitialQuestions = () => (
    <div className="session-content">
      <h2>{t('initialQuestions')}</h2>
      <p>{t('initialQuestionsDesc')}</p>
      
      <form onSubmit={handleP1Submit}>
        <div className="question-group">
          <label>{t('question1')}</label>
          <textarea
            value={p1Answers.whatHappened}
            onChange={(e) => setP1Answers({...p1Answers, whatHappened: e.target.value})}
            rows="4"
            placeholder={t('question1Placeholder')}
            required
          />
        </div>

        <div className="question-group">
          <label>{t('question2')}</label>
          <textarea
            value={p1Answers.whatLedToIt}
            onChange={(e) => setP1Answers({...p1Answers, whatLedToIt: e.target.value})}
            rows="4"
            placeholder={t('question2Placeholder')}
            required
          />
        </div>

        <div className="question-group">
          <label>{t('question3')}</label>
          <textarea
            value={p1Answers.howItMadeThemFeel}
            onChange={(e) => setP1Answers({...p1Answers, howItMadeThemFeel: e.target.value})}
            rows="4"
            placeholder={t('question3Placeholder')}
            required
          />
        </div>

        <div className="question-group">
          <label>{t('question4')}</label>
          <textarea
            value={p1Answers.desiredOutcome}
            onChange={(e) => setP1Answers({...p1Answers, desiredOutcome: e.target.value})}
            rows="4"
            placeholder={t('question4Placeholder')}
            required
          />
        </div>

        {renderFileUpload('p1_initial')}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? t('submitting') : t('submitAnswers')}
        </button>
      </form>
    </div>
  );

  const renderP2Acceptance = () => (
    <div className="session-content">
      <h2>{t('mediationRequest')}</h2>
      <div className="briefing-section">
        <p className="ai-briefing">{aiBriefing}</p>
      </div>

      <div className="summary-section">
        <h3>{t('p1Perspective')}</h3>
        <div className="ai-summary">
          {aiSummary}
        </div>
      </div>

      <div className="decision-buttons">
        <button 
          className="btn btn-success" 
          onClick={() => handleP2Decision('accepted')}
          disabled={loading}
        >
          {t('acceptMediation')}
        </button>
        <button 
          className="btn btn-danger" 
          onClick={() => handleP2Decision('rejected')}
          disabled={loading}
        >
          {t('rejectMediation')}
        </button>
      </div>
    </div>
  );

  const renderP2Answering = () => {
    if (sessionData.visibilityMode === 'open') {
      return (
        <div className="session-content">
          <h2>{t('yourResponse')}</h2>
          <div className="p1-answers-display">
            <h3>{t('p1Answers')}</h3>
            {p1AnswersForDisplay ? (
              <div className="p1-answers-content">
                <div className="answer-item">
                  <strong>{t('question1')}</strong>
                  <p>{p1AnswersForDisplay.whatHappened}</p>
                </div>
                <div className="answer-item">
                  <strong>{t('question2')}</strong>
                  <p>{p1AnswersForDisplay.whatLedToIt}</p>
                </div>
                <div className="answer-item">
                  <strong>{t('question3')}</strong>
                  <p>{p1AnswersForDisplay.howItMadeThemFeel}</p>
                </div>
                <div className="answer-item">
                  <strong>{t('question4')}</strong>
                  <p>{p1AnswersForDisplay.desiredOutcome}</p>
                </div>
              </div>
            ) : (
              <p className="info-note">{t('loadingP1Answers')}</p>
            )}
          </div>

          <form onSubmit={handleP2Submit}>
            <div className="question-group">
              <label>{t('yourResponseLabel')}</label>
              <textarea
                value={p2Response.disputeText}
                onChange={(e) => setP2Response({...p2Response, disputeText: e.target.value})}
                rows="6"
                placeholder={t('responseDisputePlaceholder')}
                required
              />
            </div>

            {renderFileUpload('p2_response')}

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('submitting') : t('submitResponse')}
            </button>
          </form>
        </div>
      );
    } else {
      return (
        <div className="session-content">
          <h2>{t('yourPerspective')}</h2>
          <div className="summary-section">
            <h3>{t('aiSummaryP1')}</h3>
            <div className="ai-summary">{aiSummary}</div>
          </div>

          <h3>{t('answerSameQuestions')}</h3>
          <form onSubmit={handleP2Submit}>
            <div className="question-group">
              <label>{t('question1')}</label>
              <textarea
                value={p2Response.whatHappened}
                onChange={(e) => setP2Response({...p2Response, whatHappened: e.target.value})}
                rows="4"
                required
              />
            </div>

            <div className="question-group">
              <label>{t('question2')}</label>
              <textarea
                value={p2Response.whatLedToIt}
                onChange={(e) => setP2Response({...p2Response, whatLedToIt: e.target.value})}
                rows="4"
                required
              />
            </div>

            <div className="question-group">
              <label>{t('question3')}</label>
              <textarea
                value={p2Response.howItMadeThemFeel}
                onChange={(e) => setP2Response({...p2Response, howItMadeThemFeel: e.target.value})}
                rows="4"
                required
              />
            </div>

            <div className="question-group">
              <label>{t('question4')}</label>
              <textarea
                value={p2Response.desiredOutcome}
                onChange={(e) => setP2Response({...p2Response, desiredOutcome: e.target.value})}
                rows="4"
                required
              />
            </div>

            {renderFileUpload('p2_response')}

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('submitting') : t('submitResponse')}
            </button>
          </form>
        </div>
      );
    }
  };

  const renderP1AddContext = () => (
    <div className="session-content">
      <h2>{t('disputePoints')}</h2>
      <div className="dispute-points">
        <ul>
          {disputePoints.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      </div>

      {p2SummaryForP1Context && (
        <div className="summary-section">
          <h3>{t('aiSummaryP2')}</h3>
          <div className="ai-summary">{p2SummaryForP1Context}</div>
        </div>
      )}

      {sessionData.visibilityMode === 'open' && p2Response.disputeText && (
        <div className="p2-response-display">
          <h3>{t('p2FullResponse')}</h3>
          <p>{p2Response.disputeText}</p>
        </div>
      )}

      <form onSubmit={handleP1ContextSubmit}>
        <div className="question-group">
          <label>{t('additionalContext')}</label>
          <p className="help-text">{t('additionalContextHelp')}</p>
          <textarea
            value={p1Context}
            onChange={(e) => setP1Context(e.target.value)}
            rows="5"
            placeholder={t('additionalContextPlaceholder')}
            required
          />
        </div>

        {renderFileUpload('p1_context')}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? t('submitting') : t('submitContext')}
        </button>
      </form>
    </div>
  );

  const renderP2AddContext = () => (
    <div className="session-content">
      <h2>{t('p1ContextSummary')}</h2>
      <div className="context-display">
        <p>{p1ContextFromOther}</p>
      </div>

      <form onSubmit={handleP2ContextSubmit}>
        <div className="question-group">
          <label>{t('yourAdditionalContext')}</label>
          <p className="help-text">{t('yourAdditionalContextHelp')}</p>
          <textarea
            value={p2Context}
            onChange={(e) => setP2Context(e.target.value)}
            rows="5"
            placeholder={t('additionalContextPlaceholder')}
            required
          />
        </div>

        {renderFileUpload('p2_context')}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? t('submitting') : t('submitContext')}
        </button>
      </form>
    </div>
  );

  const renderOnHoldScreen = () => (
    <div className="on-hold-screen">
      <div className="spinner"></div>
      <h2>{t('pleaseWait')}</h2>
      <p className="status-message">{statusMessage}</p>
      
      {showP2Link && p2Link && participantNumber === 1 && (
        <div className="p2-link-section">
          <h3>{t('shareP2Link')}</h3>
          <p>{t('shareP2LinkDesc')}</p>
          <div className="link-display">
            <input
              type="text"
              value={p2Link}
              readOnly
              className="link-input"
            />
            <button
              className="btn btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(p2Link);
                alert(t('linkCopied'));
              }}
            >
              {t('copyLink')}
            </button>
          </div>
        </div>
      )}
      
      <div className="email-notification-section">
        <h3>{t('emailNotifications')}</h3>
        <p>{t('emailNotificationsDesc')}</p>
        <div className="email-input-group">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.email@example.com"
            disabled={!sessionData || !sessionId}
          />
          <button 
            className="btn btn-secondary" 
            onClick={() => {
              if (!email.trim()) {
                alert(t('enterEmail'));
                return;
              }
              setLoading(true);
              socket.emit('update-email', {
                sessionId,
                participantId,
                email
              });
            }}
            disabled={loading || !email.trim()}
          >
            {emailSaved ? t('saved') : t('notifyMe')}
          </button>
        </div>
      </div>
    </div>
  );

  const renderRejected = () => (
    <div className="session-content rejected">
      <h2>{t('mediationDeclined')}</h2>
      <p>{t('mediationDeclinedDesc')}</p>
      {participantNumber === 1 && (
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          {t('closeSession')}
        </button>
      )}
    </div>
  );

  const renderJudgmentReady = () => (
    <div className="session-content judgment-ready">
      <h2>{t('judgmentReady')}</h2>
      <p>{t('judgmentReadyDesc')}</p>
      <button className="btn btn-primary" onClick={handleViewJudgment}>
        {t('viewJudgment')}
      </button>
    </div>
  );

  // Debug panel component
  const renderDebugPanel = () => {
    if (!debugMode) return null;
    
    const formatConfidence = (conf) => {
      if (conf === undefined || conf === null) return 'N/A';
      const pct = Math.round(conf * 100);
      const marker = conf < 0.5 ? '?' : '';
      return `${pct}%${marker}`;
    };
    
    return (
      <div className="debug-panel">
        <h4>🔍 Debug Info</h4>
        <div className="debug-section">
          <strong>AI Participant Analysis:</strong>
          {participantContext ? (
            <div className="debug-context">
              <p>
                <span className="debug-label">P1:</span> 
                {participantContext.p1?.identity || 'unknown'} 
                <span className="debug-confidence">({formatConfidence(participantContext.p1?.confidence)})</span>
              </p>
              <p>
                <span className="debug-label">P2:</span> 
                {participantContext.p2?.identity || 'unknown'} 
                <span className="debug-confidence">({formatConfidence(participantContext.p2?.confidence)})</span>
              </p>
              <p>
                <span className="debug-label">Relationship:</span> 
                {participantContext.relationship?.type || 'unknown'}
                {participantContext.relationship?.details && ` - ${participantContext.relationship.details}`}
                <span className="debug-confidence">({formatConfidence(participantContext.relationship?.confidence)})</span>
              </p>
              {participantContext.clues && participantContext.clues.length > 0 && (
                <div className="debug-clues">
                  <span className="debug-label">Clues:</span>
                  <ul>
                    {participantContext.clues.slice(0, 5).map((clue, i) => (
                      <li key={i}>{clue}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="debug-meta">
                Last updated: {participantContext.lastStage || 'N/A'}
              </p>
            </div>
          ) : (
            <p className="debug-empty">No context analyzed yet</p>
          )}
        </div>
      </div>
    );
  };

  // Main render switch
  return (
    <div className="session-room">
      <div className="session-header">
        <h1>{sessionData.title || t('mediationSession')}</h1>
        <span className="badge badge-info">{t('participant')} {participantNumber}</span>
        {sessionData.language && (
          <span className="badge badge-secondary">
            {sessionData.language === 'en' ? t('english') : t('portuguese')}
          </span>
        )}
        <label className="debug-toggle">
          <input
            type="checkbox"
            checked={debugMode}
            onChange={(e) => setDebugMode(e.target.checked)}
          />
          <span>Debug</span>
        </label>
      </div>

      <div className="card">
        {stage === 'loading' && <div className="spinner">{t('loading')}</div>}
        {stage === 'p1-initial-questions' && renderP1InitialQuestions()}
        {stage === 'waiting-p1-submission' && renderOnHoldScreen()}
        {stage === 'waiting-p2-acceptance' && renderOnHoldScreen()}
        {stage === 'p2-acceptance' && renderP2Acceptance()}
        {stage === 'waiting-p2-response' && renderOnHoldScreen()}
        {stage === 'p2-answering' && renderP2Answering()}
        {stage === 'waiting-p1-context' && renderOnHoldScreen()}
        {stage === 'p1-add-context' && renderP1AddContext()}
        {stage === 'waiting-p2-context' && renderOnHoldScreen()}
        {stage === 'p2-add-context' && renderP2AddContext()}
        {stage === 'fact-verification' && renderFactVerification()}
        {stage === 'waiting-other-verification' && renderOnHoldScreen()}
        {stage === 'generating-judgment' && renderOnHoldScreen()}
        {stage === 'rejected' && renderRejected()}
        {stage === 'judgment-ready' && renderJudgmentReady()}
        
        {renderDebugPanel()}
      </div>
    </div>
  );
}

export default SessionRoom;
