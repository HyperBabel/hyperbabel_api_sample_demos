/**
 * HyperBabel React Demo — Application Entry Point
 *
 * Mounts the React application and imports the global CSS design system.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
