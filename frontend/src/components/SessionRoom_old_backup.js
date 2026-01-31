import React, { useState, useEffect } from 'react';
import './SessionRoom.css';

function SessionRoom({ sessionId, participantData, socket }) {
  const [currentRound, setCurrentRound] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [responses, setResponses] = useState({});
  const [otherResponses, setOtherResponses] = useState([]);
  const [isGeneratingJudgment, setIsGeneratingJudgment] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on('round-started', (data) => {
      setCurrentRound(data.roundNumber);
      setQuestions([]);
      setResponses({});
    });

    socket.on('questions-received', (data) => {
      setQuestions(data.questions);
    });

    socket.on('response-submitted', (data) => {
      if (participantData.visibilityMode === 'open' && data.participantNumber !== participantData.participantNumber) {
        setOtherResponses(prev => [...prev, data]);
      }
    });

    socket.on('dispute-marked', (data) => {
      console.log('Dispute marked:', data);
      // Update UI to show dispute
    });

    socket.on('round-complete', (data) => {
      console.log(`Round ${data.roundNumber} completed`);
    });

    socket.on('generating-judgment', () => {
      setIsGeneratingJudgment(true);
    });
  }, [socket, participantData]);

  const handleResponseChange = (questionId, value) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleSubmitResponse = (questionId) => {
    const responseText = responses[questionId];
    if (!responseText || !responseText.trim()) {
      alert('Please provide a response before submitting.');
      return;
    }

    socket.emit('submit-response', {
      sessionId,
      questionId,
      responseText,
      roundNumber: currentRound
    });

    // Mark as submitted
    setResponses(prev => ({
      ...prev,
      [`${questionId}_submitted`]: true
    }));
  };

  const handleDispute = (responseId) => {
    const comment = prompt('Why do you dispute this response? (This will be addressed by the AI)');
    if (comment && comment.trim()) {
      socket.emit('mark-dispute', {
        sessionId,
        responseId,
        comment
      });
    }
  };

  const allQuestionsAnswered = questions.every(q => responses[`${q.questionId}_submitted`]);

  if (isGeneratingJudgment) {
    return (
      <div className="card">
        <div className="loading">
          <div className="spinner"></div>
          <h2>🤖 AI Analyzing All Information...</h2>
          <p>Generating comprehensive judgment based on all rounds and disputes</p>
        </div>
      </div>
    );
  }

  return (
    <div className="session-room">
      <div className="card">
        <div className="round-header">
          <h1>Round {currentRound} of 4</h1>
          <span className="badge badge-info">Participant {participantData.participantNumber}</span>
        </div>

        {questions.length === 0 ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>AI is preparing questions for you...</p>
          </div>
        ) : (
          <div className="questions-section">
            <h2>🤖 AI Mediator Questions</h2>
            {questions.map((question, index) => (
              <div key={question.questionId} className="question-card">
                <div className="question-number">Question {index + 1}</div>
                <p className="question-text">{question.questionText}</p>
                
                <textarea
                  rows="4"
                  value={responses[question.questionId] || ''}
                  onChange={(e) => handleResponseChange(question.questionId, e.target.value)}
                  placeholder="Type your response here..."
                  disabled={responses[`${question.questionId}_submitted`]}
                  className={responses[`${question.questionId}_submitted`] ? 'submitted' : ''}
                />

                {responses[`${question.questionId}_submitted`] ? (
                  <div className="submitted-indicator">
                    ✅ Response submitted
                  </div>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => handleSubmitResponse(question.questionId)}
                  >
                    Submit Response
                  </button>
                )}
              </div>
            ))}

            {allQuestionsAnswered && (
              <div className="waiting-message">
                <p>✅ All your responses submitted! Waiting for other participants...</p>
              </div>
            )}
          </div>
        )}
      </div>

      {participantData.visibilityMode === 'open' && otherResponses.length > 0 && (
        <div className="card">
          <h2>👥 Other Participants' Responses</h2>
          <div className="other-responses">
            {otherResponses.map((response, index) => (
              <div key={index} className="response-card">
                <div className="response-header">
                  <span className="badge badge-info">Participant {response.participantNumber}</span>
                  <span className="badge badge-success">Round {response.roundNumber}</span>
                </div>
                <p className="response-text">{response.responseText}</p>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => handleDispute(response.responseId)}
                >
                  🚩 Dispute This Response
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionRoom;
