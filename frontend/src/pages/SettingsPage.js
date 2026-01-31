import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTranslation } from '../i18n/translations';
import './SettingsPage.css';

function SettingsPage() {
  const navigate = useNavigate();
  const [language, setLanguage] = useState('en');
  const t = (key) => getTranslation(language, key);
  
  const [visibilityMode, setVisibilityMode] = useState('blind');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [workflow, setWorkflow] = useState('simple');
  const [lmstudioUrl, setLmstudioUrl] = useState('');
  const [lmstudioModel, setLmstudioModel] = useState('');

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

  const handleSave = () => {
    localStorage.setItem('preferredLanguage', language);
    localStorage.setItem('preferredVisibilityMode', visibilityMode);
    localStorage.setItem('preferredModel', model);
    localStorage.setItem('preferredWorkflow', workflow);
    localStorage.setItem('lmstudioUrl', lmstudioUrl);
    localStorage.setItem('lmstudioModel', lmstudioModel);
    
    alert(t('settingsSaved'));
    navigate('/');
  };

  return (
    <div className="container">
      <div className="settings-page">
        <header className="header-with-settings">
          <h1>{t('settings')}</h1>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn btn-secondary"
          >
            {t('cancel')}
          </button>
        </header>

        <p className="tagline">{t('settingsDescription')}</p>

        <section className="card glass-card">
          <div className="form-group">
            <label htmlFor="language">
              {t('language')} <span className="required">*</span>
            </label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="form-control"
              aria-label={t('language')}
            >
              <option value="en">{t('english')}</option>
              <option value="pt">{t('portuguese')}</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="visibilityMode">
              {t('visibilityMode')} <span className="required">*</span>
            </label>
            <select
              id="visibilityMode"
              value={visibilityMode}
              onChange={(e) => setVisibilityMode(e.target.value)}
              className="form-control"
              aria-label={t('visibilityMode')}
            >
              <option value="blind">{t('visibilityBlind')}</option>
              <option value="open">{t('visibilityOpen')}</option>
            </select>
            <small className="form-text">
              {visibilityMode === 'blind' 
                ? t('visibilityBlindDesc') 
                : t('visibilityOpenDesc')}
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="model">
              {t('aiModel')} <span className="required">*</span>
            </label>
            <select
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="form-control"
              aria-label={t('aiModel')}
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
              <option value="lmstudio">{t('lmStudioLocal')}</option>
            </select>
            <small className="form-text">
              {model === 'lmstudio' 
                ? t('usingLocalModel') 
                : t('usingGeminiAPI')}
            </small>
          </div>

          {model === 'lmstudio' && (
            <>
              <div className="form-group">
                <label htmlFor="lmstudioUrl">
                  {t('lmStudioUrl')} <span className="required">*</span>
                </label>
                <input
                  id="lmstudioUrl"
                  type="text"
                  value={lmstudioUrl}
                  onChange={(e) => setLmstudioUrl(e.target.value)}
                  placeholder="http://localhost:1234/v1"
                  className="form-control"
                  aria-label={t('lmStudioUrl')}
                />
                <small className="form-text">
                  {t('lmStudioUrlHelper')}
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="lmstudioModel">
                  {t('lmStudioModel')} <span className="required">*</span>
                </label>
                <input
                  id="lmstudioModel"
                  type="text"
                  value={lmstudioModel}
                  onChange={(e) => setLmstudioModel(e.target.value)}
                  placeholder="qwen/qwen3-vl-8b"
                  className="form-control"
                  aria-label={t('lmStudioModel')}
                />
                <small className="form-text">
                  {t('lmStudioModelHelper')}
                </small>
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="workflow">
              {t('workflow')} <span className="required">*</span>
            </label>
            <select
              id="workflow"
              value={workflow}
              onChange={(e) => setWorkflow(e.target.value)}
              className="form-control"
              aria-label={t('workflow')}
            >
              <option value="simple">{t('workflowSimple')}</option>
              <option value="advanced">{t('workflowAdvanced')}</option>
              <option value="dynamic">{t('workflowDynamic')}</option>
            </select>
            <small className="form-text">
              {t('workflowDescription')}
            </small>
          </div>

          <div className="button-group">
            <button
              type="button"
              onClick={handleSave}
              className="btn btn-primary"
              aria-label={t('saveSettings')}
            >
              {t('saveSettings')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default SettingsPage;
