import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { PortfolioProvider } from './contexts/PortfolioContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PortfolioProvider>
          <App />
        </PortfolioProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
