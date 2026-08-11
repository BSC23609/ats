import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Fade out the branded loading screen once the app has painted.
const boot = document.getElementById('boot');
if (boot) {
  requestAnimationFrame(() => {
    boot.classList.add('hide');
    setTimeout(() => boot.remove(), 450);
  });
}
