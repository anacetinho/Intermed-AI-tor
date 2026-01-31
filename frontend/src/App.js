import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SessionPage from './pages/SessionPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/session/:sessionId/:token" element={<SessionPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;