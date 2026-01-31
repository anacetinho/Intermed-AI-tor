import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Add font for Inter
const interFont = document.createElement('link');
interFont.rel = 'stylesheet';
interFont.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
document.head.appendChild(interFont);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
