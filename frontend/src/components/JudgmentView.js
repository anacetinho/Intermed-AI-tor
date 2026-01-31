import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getJudgment } from '../services/api';
import { getTranslation } from '../i18n/translations';
import './JudgmentView.css';

function JudgmentView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [judgment, setJudgment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState('en');
  const [factsExpanded, setFactsExpanded] = useState(false);

  useEffect(() => {
    loadJudgment();
  }, [sessionId]);

  const loadJudgment = async () => {
    try {
      const data = await getJudgment(sessionId);
      setJudgment(data);
      if (data.session && data.session.language) {
        setLanguage(data.session.language);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const t = (key) => getTranslation(language, key);

  const getVerdictLabel = (verdict) => {
    const labels = {
      'p1_right': t('verdictP1Right'),
      'p1_more_right': t('verdictP1MoreRight'),
      'both_right': t('verdictBothRight'),
      'neither_right': t('verdictNeitherRight'),
      'p2_more_right': t('verdictP2MoreRight'),
      'p2_right': t('verdictP2Right')
    };
    return labels[verdict] || verdict;
  };

  const getVerdictColor = (verdict) => {
    const colors = {
      'p1_right': '#22c55e',
      'p1_more_right': '#84cc16',
      'both_right': '#3b82f6',
      'neither_right': '#6b7280',
      'p2_more_right': '#f59e0b',
      'p2_right': '#ef4444'
    };
    return colors[verdict] || '#6b7280';
  };

  // Get fact status based on verifications
  const getFactStatus = (fact) => {
    const factList = judgment.factList || [];
    const factVerifications = judgment.factVerifications || { p1: {}, p2: {} };
    
    // Filter facts the same way participants saw them
    const p1VerifiableFacts = factList.filter(f => f.source === 'p2' || f.source === 'both');
    const p2VerifiableFacts = factList.filter(f => f.source === 'p1' || f.source === 'both');
    
    let p1v = null, p2v = null;
    
    if (fact.source === 'p2' || fact.source === 'both') {
      const p1FilteredIndex = p1VerifiableFacts.findIndex(f => f.id === fact.id);
      if (p1FilteredIndex !== -1) p1v = factVerifications.p1?.[p1FilteredIndex];
    }
    
    if (fact.source === 'p1' || fact.source === 'both') {
      const p2FilteredIndex = p2VerifiableFacts.findIndex(f => f.id === fact.id);
      if (p2FilteredIndex !== -1) p2v = factVerifications.p2?.[p2FilteredIndex];
    }
    
    // Determine overall status
    const p1Status = p1v?.status;
    const p2Status = p2v?.status;
    const p1Comment = p1v?.comment || '';
    const p2Comment = p2v?.comment || '';
    
    // Check if fact has documented evidence (from sanitizedFacts)
    const documentedEvidence = judgment.sanitizedFacts?.documented_evidence || [];
    const hasProof = documentedEvidence.some(ev => 
      fact.statement && ev.toLowerCase().includes(fact.statement.toLowerCase().slice(0, 30))
    );
    
    if (p1Status === 'disagree' || p2Status === 'disagree' || 
        p1Status === 'partially' || p2Status === 'partially') {
      return { 
        status: 'disputed', 
        p1Comment, 
        p2Comment,
        p1Status,
        p2Status
      };
    }
    if (hasProof) {
      return { status: 'has_proof', p1Comment, p2Comment };
    }
    if (p1Status === 'agree' && p2Status === 'agree') {
      return { status: 'agreed', p1Comment, p2Comment };
    }
    if (p1Status === 'agree' || p2Status === 'agree') {
      return { status: 'agreed', p1Comment, p2Comment };
    }
    return { status: 'unverified', p1Comment, p2Comment };
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card glass-card">
          <div className="loading">
            <div className="spinner"></div>
            <p>{t('loadingJudgment')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !judgment) {
    return (
      <div className="container">
        <div className="card error">
          <h2>⚠️ {error ? 'Error' : 'No Judgment Available'}</h2>
          {error && <p>{error}</p>}
          <button className="btn btn-secondary" onClick={() => navigate('/')}>{t('returnHome')}</button>
        </div>
      </div>
    );
  }

  const color = getVerdictColor(judgment.verdict);
  const factList = judgment.factList || [];

  return (
    <div className="container">
      <div className="judgment-view">
        <h1>⚖️ {t('mediationJudgment')}</h1>

        {/* 1. FACTS TABLE (Collapsible) */}
        {factList.length > 0 && (
          <section className="facts-table-section">
            <header 
              className="facts-header" 
              onClick={() => setFactsExpanded(!factsExpanded)}
              role="button"
              tabIndex={0}
              aria-expanded={factsExpanded}
              onKeyDown={(e) => e.key === 'Enter' && setFactsExpanded(!factsExpanded)}
            >
              <h2>📋 {t('factsReview')} ({factList.length} {t('facts')})</h2>
              <span className={`expand-icon ${factsExpanded ? 'expanded' : ''}`} aria-hidden="true">
                {factsExpanded ? '▼' : '▶'}
              </span>
            </header>
            
            {factsExpanded && (
              <div className="facts-table-wrapper">
                <table className="facts-table" aria-label={t('factsReview')}>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">{t('fact')}</th>
                      <th scope="col">{t('source')}</th>
                      <th scope="col">{t('status')}</th>
                      <th scope="col">{t('comments')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factList.map((fact, index) => {
                      const factStatus = getFactStatus(fact);
                      return (
                        <tr key={fact.id || index} className={`fact-row ${factStatus.status}`}>
                          <td>{index + 1}</td>
                          <td className="fact-text" aria-label={t('fact')}>{fact.statement}</td>
                          <td className="fact-source">
                            {fact.source === 'p1' ? t('participant1') : fact.source === 'p2' ? t('participant2') : t('bothParticipants')}
                          </td>
                          <td className="fact-status">
                            <span className={`status-badge ${factStatus.status}`} aria-label={t(factStatus.status)}>
                              {factStatus.status === 'agreed' && '✓ ' + t('agreed')}
                              {factStatus.status === 'has_proof' && '📄 ' + t('hasProof')}
                              {factStatus.status === 'disputed' && '⚠️ ' + t('disputed')}
                              {factStatus.status === 'unverified' && '○ ' + t('unverified')}
                            </span>
                          </td>
                          <td className="fact-comments">
                            {(factStatus.p1Comment || factStatus.p2Comment) && (
                              <>
                                {factStatus.p1Comment && (
                                  <div className="comment p1" aria-label={t('participant1')}>
                                    <strong>{t('participant1')}:</strong> {factStatus.p1Comment}
                                  </div>
                                )}
                                {factStatus.p2Comment && (
                                  <div className="comment p2" aria-label={t('participant2')}>
                                    <strong>{t('participant2')}:</strong> {factStatus.p2Comment}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* 2. BEHAVIORS */}
        <section className="behaviors-section">
          <div className="card">
            <h2>{t('participant1Behaviors')}</h2>
            <div className="behavior-group correct">
              <h3>✅ {t('correctBehaviors')}</h3>
              <ul aria-label={t('correctBehaviors')}>
                {judgment.p1_correct_behaviors?.length > 0 ? (
                  judgment.p1_correct_behaviors.map((b, i) => <li key={i}>{b}</li>)
                ) : (<li className="empty">{t('noneIdentified')}</li>)}
              </ul>
            </div>
            <div className="behavior-group wrong">
              <h3>❌ {t('wrongBehaviors')}</h3>
              <ul aria-label={t('wrongBehaviors')}>
                {judgment.p1_wrong_behaviors?.length > 0 ? (
                  judgment.p1_wrong_behaviors.map((b, i) => <li key={i}>{b}</li>)
                ) : (<li className="empty">{t('noneIdentified')}</li>)}
              </ul>
            </div>
          </div>

          <div className="card">
            <h2>{t('participant2Behaviors')}</h2>
            <div className="behavior-group correct">
              <h3>✅ {t('correctBehaviors')}</h3>
              <ul aria-label={t('correctBehaviors')}>
                {judgment.p2_correct_behaviors?.length > 0 ? (
                  judgment.p2_correct_behaviors.map((b, i) => <li key={i}>{b}</li>)
                ) : (<li className="empty">{t('noneIdentified')}</li>)}
              </ul>
            </div>
            <div className="behavior-group wrong">
              <h3>❌ {t('wrongBehaviors')}</h3>
              <ul aria-label={t('wrongBehaviors')}>
                {judgment.p2_wrong_behaviors?.length > 0 ? (
                  judgment.p2_wrong_behaviors.map((b, i) => <li key={i}>{b}</li>)
                ) : (<li className="empty">{t('noneIdentified')}</li>)}
              </ul>
            </div>
          </div>
        </section>

        {/* 3. VERDICT */}
        <section className="verdict-scale-container">
          <h2>{t('verdict')}</h2>
          <div className="scale-wrapper" role="region" aria-label={t('verdictScale')}>
            <div className="scale-line"></div>
            <div className="scale-positions" role="group" aria-live="polite">
              {['p1_right', 'p1_more_right', 'both_right', 'neither_right', 'p2_more_right', 'p2_right'].map((v) => (
                <div 
                  key={v} 
                  className={`scale-position ${judgment.verdict === v ? 'active' : ''}`}
                  style={{ backgroundColor: judgment.verdict === v ? getVerdictColor(v) : '#e5e7eb' }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${getVerdictLabel(v)} ${judgment.verdict === v ? t('selected') : ''}`}
                >
                  <div className="scale-label">{getVerdictLabel(v)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="verdict-label" style={{ color }} aria-live="polite">
            <strong>{getVerdictLabel(judgment.verdict)}</strong>
          </div>
        </section>

        {/* 4. JUSTIFICATION */}
        <section className="card justification-section">
          <h2>{t('comprehensiveJustification')}</h2>
          <div className="justification-text" aria-label={t('justification')}>
            {judgment.justification?.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </section>

        <div className="action-buttons">
          <button className="btn btn-secondary" onClick={() => navigate('/')} aria-label={t('createNewSession')}>{t('createNewSession')}</button>
        </div>
      </div>
    </div>
  );
}

export default JudgmentView;
