import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Get authorization header with current session token
 */
async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  lastUpdated: string;
}

export interface ExchangeRates {
  [key: string]: number;  // e.g., USD: 24.5 (means 1 USD = 24.5 CZK)
}

// Fallback rates if API fails (approximate values)
export const DEFAULT_RATES: ExchangeRates = {
  USD: 23.5,
  EUR: 25.5,
  GBP: 30.0,
  CHF: 27.0,
};

// ============ Portfolio Types ============

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  currency: string;
  created_at: string;
}

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  avg_cost: number;
  currency: string;
  current_price?: number;
  current_value?: number;
  unrealized_pnl?: number;
  unrealized_pnl_pct?: number;
}

export interface Transaction {
  id: string;
  portfolio_id: string;
  ticker: string;
  type: 'BUY' | 'SELL';
  shares: number;
  price: number;
  total: number;
  currency: string;
  date: string;
  notes?: string;
}

// ============ Market Endpoints ============

export async function fetchQuotes(tickers: string[]): Promise<Record<string, Quote>> {
  const response = await fetch(`${API_URL}/api/market/batch-quotes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tickers }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch quotes');
  }
  
  return response.json();
}

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  const response = await fetch(`${API_URL}/api/market/exchange-rates`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch exchange rates');
  }
  
  return response.json();
}

// ============ Portfolio Endpoints ============

export async function fetchPortfolios(): Promise<Portfolio[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch portfolios');
  }
  
  return response.json();
}

export async function createPortfolio(name: string, currency: string = 'CZK'): Promise<Portfolio> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ name, currency }),
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to create portfolio');
  }
  
  return response.json();
}

export async function fetchHoldings(portfolioId: string): Promise<Holding[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}/holdings`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch holdings');
  }
  
  return response.json();
}

export async function fetchTransactions(portfolioId: string, limit: number = 50): Promise<Transaction[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}/transactions?limit=${limit}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch transactions');
  }
  
  return response.json();
}

export async function addTransaction(
  portfolioId: string, 
  data: Omit<Transaction, 'id' | 'portfolio_id'>
): Promise<Transaction> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to add transaction');
  }
  
  return response.json();
}
