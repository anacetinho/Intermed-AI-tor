import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession } from '../services/api';
import { getTranslation } from '../i18n/translations';
import './HomePage.css';

function HomePage() {
  const navigate = useNavigate();
  const [language, setLanguage] = useState('en');
  const t = (key) => getTranslation(language, key);
  const [visibilityMode, setVisibilityMode] = useState('blind');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [workflow, setWorkflow] = useState('simple');
  const [lmstudioUrl, setLmstudioUrl] = useState('');
  const [lmstudioModel, setLmstudioModel] = useState('');
  const [title, setTitle] = useState('');
  const [initialDescription, setInitialDescription] = useState('');
  const [sessionCreated, setSessionCreated] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load settings from localStorage on mount
    const savedLanguage = localStorage.getItem('preferredLanguage') || 'en';
    const savedVisibilityMode = localStorage.getItem('preferredVisibilityMode') || 'blind';
    const savedModel = localStorage.getItem('preferredModel') || 'gemini-2.5-flash';
    const savedWorkflow = localStorage.getItem('preferredWorkflow') || 'simple';
    const savedLmstudioUrl = localStorage.getItem('lmstudioUrl') || '';
    const savedLmstudioModel = localStorage.getItem('lmstudioModel') || '';
    
    setLanguage(savedLanguage);
    setVisibilityMode(savedVisibilityMode);
    setModel(savedModel);
    setWorkflow(savedWorkflow);
    setLmstudioUrl(savedLmstudioUrl);
    setLmstudioModel(savedLmstudioModel);
  }, []);

  const handleCreateSession = async (e) => {
    e.preventDefault();
    
    if (!title.trim()) {
      alert(t('provideTitleAlert'));
      return;
    }

    setLoading(true);

    try {
      const data = await createSession({
        visibilityMode,
        initialDescription,
        language,
        model,
        title,
        workflow,
        lmstudioUrl: model === 'lmstudio' ? lmstudioUrl : null,
        lmstudioModel: model === 'lmstudio' ? lmstudioModel : null
      });
      
      setSessionData(data);
      setSessionCreated(true);
    } catch (error) {
      console.error('Error creating session:', error);
      alert(t('failedCreateSession'));
    } finally {
      setLoading(false);
    }
  };

  const getParticipantLink = (token) => {
    return `${window.location.origin}/session/${sessionData.sessionId}/${token}`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert(t('linkCopied'));
  };

  if (sessionCreated && sessionData) {
    const initiator = sessionData.participants.find(p => p.isInitiator);
    if (initiator) {
      const sessionLink = getParticipantLink(initiator.token);
      window.location.href = sessionLink;
    }
    
    return (
      <div className="container">
        <div className="card glass-card">
          <h1>{t('sessionCreated')}</h1>
          <p className="session-title">{title}</p>
          <div className="spinner">{t('redirecting')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="home-page">
        <header className="header-with-settings">
          <div>
            <h1>{t('appTitle')}</h1>
            <p className="tagline">{t('appTagline')}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="btn btn-secondary"
          >
            ⚙️ {t('settings')}
          </button>
        </header>

        <section className="card">
          <h2>{t('createSession')}</h2>
          
          <form onSubmit={handleCreateSession}>
            <div className="form-group">
              <label htmlFor="title">
                {t('sessionTitle')} <span className="required">*</span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('sessionTitlePlaceholder')}
                className="form-control"
                required
                aria-invalid={!!(title.trim() === '' && loading)}
              />
              <small className="form-text">{t('sessionTitleHelper')}</small>
            </div>

            <div className="form-group">
              <label htmlFor="initialDescription">
                {t('briefDescription')}
              </label>
              <textarea
                id="initialDescription"
                value={initialDescription}
                onChange={(e) => setInitialDescription(e.target.value)}
                placeholder={t('briefDescriptionPlaceholder')}
                rows="3"
                className="form-control"
                aria-label={t('briefDescription')}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              aria-label={loading ? t('creatingSession') : t('createSession')}
            >
              {loading && <span className="spinner spinner-small"></span>}
              {loading ? t('creatingSession') : t('createSession')}
            </button>
          </form>
        </section>

        <section className="info-section">
          <h3>{t('howItWorks')}</h3>
          <ol>
            <li>{t('step1')}</li>
            <li>{t('step2')}</li>
            <li>{t('step3')}</li>
            <li>{t('step4')}</li>
            <li>{t('step5')}</li>
          </ol>
        </section>
      </div>
    </div>
  );
}

export default HomePage;
