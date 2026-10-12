import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './extra.css';
import { BASE } from './api';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={BASE || '/'}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
