import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { PortfolioProvider } from './contexts/PortfolioContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <PortfolioProvider>
        <App />
      </PortfolioProvider>
    </AuthProvider>
  </StrictMode>,
);
