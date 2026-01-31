import React, { useState, useEffect } from 'react';
import { getJudgment } from '../services/api';
import './JudgmentView.css';

function JudgmentView({ sessionId, participantData }) {
  const [judgment, setJudgment] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJudgment = async () => {
      try {
        const data = await getJudgment(sessionId);
        setJudgment(data);
      } catch (error) {
        console.error('Error fetching judgment:', error);
      } finally {
        setLoading(false);
      }
    };

    // Small delay to ensure judgment is saved
    setTimeout(fetchJudgment, 1000);
  }, [sessionId]);

  if (loading || !judgment) {
    return (
      <div className="card">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading final judgment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="judgment-view">
      <div className="card">
        <h1>⚖️ Final Judgment</h1>
        <p className="subtitle">AI Mediator Analysis and Verdict</p>

        <div className="judgment-section">
          <h2>📋 Overview</h2>
          <p>{judgment.overview}</p>
        </div>

        <div className="judgment-section">
          <h2>📊 Information Gathered</h2>
          {judgment.informationGathered && judgment.informationGathered.map((info, index) => (
            <div key={index} className="info-card">
              <h3>
                <span className="badge badge-info">Participant {info.participant}</span>
              </h3>
              <ul>
                {info.keyPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="judgment-section">
          <h2>🔍 Analysis</h2>
          <p>{judgment.analysis}</p>
        </div>

        <div className="judgment-section highlight">
          <h2>⚖️ Fault Assessment</h2>
          <div className="fault-table">
            {judgment.faultAssessment && judgment.faultAssessment.map((assessment, index) => (
              <div key={index} className="fault-card">
                <div className="fault-header">
                  <span className="badge badge-info">Participant {assessment.participant}</span>
                  <span className={`fault-percentage ${assessment.faultPercentage > 50 ? 'high' : assessment.faultPercentage > 0 ? 'medium' : 'low'}`}>
                    {assessment.faultPercentage}% at fault
                  </span>
                </div>

                {assessment.areasOfFault && assessment.areasOfFault.length > 0 && (
                  <div className="fault-areas">
                    <h4>❌ Areas of Fault:</h4>
                    <ul>
                      {assessment.areasOfFault.map((area, i) => (
                        <li key={i} className="fault-item">{area}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {assessment.areasOfInnocence && assessment.areasOfInnocence.length > 0 && (
                  <div className="innocence-areas">
                    <h4>✅ Areas of Innocence:</h4>
                    <ul>
                      {assessment.areasOfInnocence.map((area, i) => (
                        <li key={i} className="innocence-item">{area}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="judgment-section">
          <h2>💭 Reasoning</h2>
          <p>{judgment.reasoning}</p>
        </div>

        <div className="judgment-section verdict">
          <h2>⚖️ Final Verdict</h2>
          <p className="verdict-text">{judgment.verdict}</p>
        </div>

        {judgment.recommendations && judgment.recommendations.length > 0 && (
          <div className="judgment-section">
            <h2>💡 Recommendations</h2>
            <ul className="recommendations">
              {judgment.recommendations.map((rec, index) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card">
        <h3>📝 Session Complete</h3>
        <p>Thank you for participating in this mediation session. This judgment is based on comprehensive analysis of all information provided during the 4 rounds of questioning.</p>
        <button
          className="btn btn-primary"
          onClick={() => window.location.href = '/'}
        >
          Create New Session
        </button>
      </div>
    </div>
  );
}

export default JudgmentView;
