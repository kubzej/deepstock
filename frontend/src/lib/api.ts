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
  created_at: string;
}

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  avg_cost: number;
  currency: string;
  sector?: string;
  price_scale?: number;
  total_invested_czk?: number;
  current_price?: number;
  current_value?: number;
  unrealized_pnl?: number;
  unrealized_pnl_pct?: number;
  // For "All portfolios" view
  portfolio_id?: string;
  portfolio_name?: string;
}

// Raw transaction from API
interface TransactionRaw {
  id: string;
  portfolio_id: string;
  stock_id: string;
  type: 'BUY' | 'SELL';
  shares: number;
  price_per_share: number;
  total_amount: number;
  total_amount_czk: number;
  currency: string;
  exchange_rate_to_czk?: number;
  fees?: number;
  executed_at: string;
  notes?: string;
  source_transaction_id?: string;
  stocks: {
    ticker: string;
    name: string;
  };
  // Source transaction for SELL (joined from backend)
  source_transaction?: {
    id: string;
    executed_at: string;
    price_per_share: number;
    currency: string;
    shares: number;
  };
}

// Source lot info for SELL transactions
export interface SourceTransaction {
  id: string;
  date: string;
  price: number;
  currency: string;
  shares: number;
}

// Transformed transaction for frontend
export interface Transaction {
  id: string;
  portfolioId: string;
  ticker: string;
  stockName: string;
  type: 'BUY' | 'SELL';
  shares: number;
  price: number;
  total: number;
  totalCzk: number;
  currency: string;
  exchangeRate?: number;
  fees?: number;
  date: string;
  notes?: string;
  // For SELL: source lot transaction ID and full object
  sourceTransactionId?: string;
  sourceTransaction?: SourceTransaction;
  // For "All portfolios" view
  portfolioName?: string;
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

// Option quotes
export interface OptionQuote {
  symbol: string;
  price: number | null;
  bid: number | null;
  ask: number | null;
  previousClose: number | null;
  change: number;
  changePercent: number;
  volume: number;
  openInterest: number | null;
  impliedVolatility: number | null;
  lastUpdated: string;
}

export async function fetchOptionQuotes(occSymbols: string[]): Promise<Record<string, OptionQuote>> {
  if (occSymbols.length === 0) return {};
  
  const response = await fetch(`${API_URL}/api/market/option-quotes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ symbols: occSymbols }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch option quotes');
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

// Price history for charts
export interface PriceHistoryPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartPeriod = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max';

export async function fetchPriceHistory(
  ticker: string,
  period: ChartPeriod = '1mo'
): Promise<PriceHistoryPoint[]> {
  const response = await fetch(
    `${API_URL}/api/market/history/${encodeURIComponent(ticker)}?period=${period}`
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch price history');
  }
  
  return response.json();
}

// Stock info (fundamentals + valuation)
export interface StockInfo {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  exchange: string | null;
  currency: string | null;
  description: string | null;
  
  // Price
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  volume: number | null;
  avgVolume: number | null;
  
  // Valuation
  marketCap: number | null;
  enterpriseValue: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  enterpriseToRevenue: number | null;
  enterpriseToEbitda: number | null;
  
  // Fundamentals
  revenue: number | null;
  revenueGrowth: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  eps: number | null;
  forwardEps: number | null;
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  freeCashflow: number | null;
  
  // Dividends
  dividendYield: number | null;
  dividendRate: number | null;
  payoutRatio: number | null;
  
  // Analyst
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  targetMeanPrice: number | null;
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
  
  // Insights (from backend analysis)
  insights?: Array<{
    type: 'positive' | 'warning' | 'info';
    title: string;
    description: string;
  }>;
  
  lastUpdated: string;
}

export async function fetchStockInfo(ticker: string): Promise<StockInfo | null> {
  const response = await fetch(
    `${API_URL}/api/market/stock-info/${encodeURIComponent(ticker.toUpperCase())}`
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch stock info');
  }
  
  const data = await response.json();
  if (data.error) {
    return null;
  }
  
  return data;
}

// ============ Technical Indicators ============

export type TechnicalPeriod = '1w' | '1mo' | '3mo' | '6mo' | '1y' | '2y';

export type TrendSignalType = 'strong_bullish' | 'bullish' | 'mixed' | 'bearish' | 'strong_bearish' | null;
export type IndicatorSignalType = 'bullish' | 'bearish' | 'neutral' | 'overbought' | 'oversold' | 'high' | 'low' | 'normal' | 'strong' | 'moderate' | 'weak' | 'no-trend' | null;

// History point types for charts
export interface PriceHistoryPointWithSMA {
  date: string;
  price: number | null;
  sma50: number | null;
  sma200: number | null;
}

export interface MACDHistoryPoint {
  date: string;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

export interface BollingerHistoryPoint {
  date: string;
  price: number | null;
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

export interface StochasticHistoryPoint {
  date: string;
  k: number | null;
  d: number | null;
}

export interface RSIHistoryPoint {
  date: string;
  rsi: number | null;
}

export interface VolumeHistoryPoint {
  date: string;
  volume: number;
  avgVolume: number | null;
  isAboveAvg: boolean;
}

export interface ATRHistoryPoint {
  date: string;
  atr: number | null;
  atrPercent: number | null;
}

export interface OBVHistoryPoint {
  date: string;
  obv: number | null;
  obvSma: number | null;
}

export interface ADXHistoryPoint {
  date: string;
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
}

export interface TechnicalData {
  ticker: string;
  
  // Current values
  currentPrice: number | null;
  sma50: number | null;
  sma200: number | null;
  priceVsSma50: number | null;
  priceVsSma200: number | null;
  
  rsi14: number | null;
  
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerPosition: number | null;
  
  stochasticK: number | null;
  stochasticD: number | null;
  
  atr14: number | null;
  atrPercent: number | null;
  
  obv: number | null;
  
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  
  currentVolume: number | null;
  avgVolume20: number | null;
  volumeChange: number | null;
  
  // Signals
  trendSignal: TrendSignalType;
  trendDescription: string | null;
  macdTrend: IndicatorSignalType;
  bollingerSignal: IndicatorSignalType;
  stochasticSignal: IndicatorSignalType;
  volumeSignal: IndicatorSignalType;
  atrSignal: IndicatorSignalType;
  obvTrend: IndicatorSignalType;
  obvDivergence: IndicatorSignalType;
  adxSignal: IndicatorSignalType;
  adxTrend: IndicatorSignalType;
  
  // History arrays for charts
  priceHistory: PriceHistoryPointWithSMA[];
  macdHistory: MACDHistoryPoint[];
  bollingerHistory: BollingerHistoryPoint[];
  stochasticHistory: StochasticHistoryPoint[];
  rsiHistory: RSIHistoryPoint[];
  volumeHistory: VolumeHistoryPoint[];
  atrHistory: ATRHistoryPoint[];
  obvHistory: OBVHistoryPoint[];
  adxHistory: ADXHistoryPoint[];
  
  lastUpdated: string;
}

export async function fetchTechnicalIndicators(
  ticker: string,
  period: TechnicalPeriod = '1y'
): Promise<TechnicalData | null> {
  const response = await fetch(
    `${API_URL}/api/market/technical/${encodeURIComponent(ticker.toUpperCase())}?period=${period}`
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch technical indicators');
  }
  
  const data = await response.json();
  if (data.error) {
    return null;
  }
  
  return data;
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

export async function createPortfolio(name: string): Promise<Portfolio> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ name }),
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
  
  // Transform backend response (nested stocks) to flat Holding interface
  const data = await response.json();
  return data.map((h: { stocks: { ticker: string; name: string; currency: string; sector?: string; price_scale?: string | number }; shares: number; avg_cost_per_share: number; total_invested_czk?: number }) => ({
    ticker: h.stocks.ticker,
    name: h.stocks.name,
    shares: h.shares,
    avg_cost: h.avg_cost_per_share,
    currency: h.stocks.currency || 'USD',
    sector: h.stocks.sector || '',
    price_scale: parseFloat(String(h.stocks.price_scale)) || 1,
    total_invested_czk: h.total_invested_czk,
  }));
}

export interface OpenLot {
  id: string;
  ticker: string;
  stockName: string;
  date: string;
  shares: number;
  buyPrice: number;
  currency: string;
  priceScale?: number;
  portfolioName?: string;
}

export async function fetchOpenLots(portfolioId: string): Promise<OpenLot[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}/open-lots`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch open lots');
  }
  
  return response.json();
}

export async function fetchAllOpenLots(): Promise<OpenLot[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/all/open-lots`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch all open lots');
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
  
  const raw: TransactionRaw[] = await response.json();
  
  // Transform to frontend format
  return raw.map((tx) => ({
    id: tx.id,
    portfolioId: tx.portfolio_id,
    ticker: tx.stocks?.ticker || 'UNKNOWN',
    stockName: tx.stocks?.name || '',
    type: tx.type,
    shares: tx.shares,
    price: tx.price_per_share,
    total: tx.total_amount,
    totalCzk: tx.total_amount_czk || 0,
    currency: tx.currency,
    exchangeRate: tx.exchange_rate_to_czk,
    fees: tx.fees,
    date: tx.executed_at,
    notes: tx.notes,
    sourceTransactionId: tx.source_transaction_id,
    sourceTransaction: tx.source_transaction ? {
      id: tx.source_transaction.id,
      date: tx.source_transaction.executed_at,
      price: tx.source_transaction.price_per_share,
      currency: tx.source_transaction.currency,
      shares: tx.source_transaction.shares,
    } : undefined,
  }));
}

// ============ All Portfolios API ============

interface AllHoldingsRaw {
  stocks: { 
    ticker: string; 
    name: string; 
    currency: string; 
    sector?: string; 
    price_scale?: string | number;
  };
  shares: number;
  avg_cost_per_share: number;
  total_invested_czk?: number;
  portfolio_id: string;
  portfolio_name: string;
}

export async function fetchAllHoldings(): Promise<Holding[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/all/holdings`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch all holdings');
  }
  
  const data: AllHoldingsRaw[] = await response.json();
  return data.map((h) => ({
    ticker: h.stocks.ticker,
    name: h.stocks.name,
    shares: h.shares,
    avg_cost: h.avg_cost_per_share,
    currency: h.stocks.currency || 'USD',
    sector: h.stocks.sector || '',
    price_scale: parseFloat(String(h.stocks.price_scale)) || 1,
    total_invested_czk: h.total_invested_czk,
    portfolio_id: h.portfolio_id,
    portfolio_name: h.portfolio_name,
  }));
}

interface AllTransactionsRaw extends TransactionRaw {
  portfolio_name: string;
}

export async function fetchAllTransactions(limit: number = 100): Promise<Transaction[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/all/transactions?limit=${limit}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch all transactions');
  }
  
  const raw: AllTransactionsRaw[] = await response.json();
  
  return raw.map((tx) => ({
    id: tx.id,
    portfolioId: tx.portfolio_id,
    ticker: tx.stocks?.ticker || 'UNKNOWN',
    stockName: tx.stocks?.name || '',
    type: tx.type,
    shares: tx.shares,
    price: tx.price_per_share,
    total: tx.total_amount,
    totalCzk: tx.total_amount_czk || 0,
    currency: tx.currency,
    exchangeRate: tx.exchange_rate_to_czk,
    fees: tx.fees,
    date: tx.executed_at,
    notes: tx.notes,
    sourceTransactionId: tx.source_transaction_id,
    sourceTransaction: tx.source_transaction ? {
      id: tx.source_transaction.id,
      date: tx.source_transaction.executed_at,
      price: tx.source_transaction.price_per_share,
      currency: tx.source_transaction.currency,
      shares: tx.source_transaction.shares,
    } : undefined,
    portfolioName: tx.portfolio_name,
  }));
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

export async function updatePortfolio(
  portfolioId: string,
  data: { name?: string; description?: string }
): Promise<Portfolio> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}`, {
    method: 'PUT',
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
    if (response.status === 404) {
      throw new Error('Portfolio not found');
    }
    throw new Error('Failed to update portfolio');
  }
  
  return response.json();
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    if (response.status === 404) {
      throw new Error('Portfolio not found');
    }
    throw new Error('Failed to delete portfolio');
  }
}

// ============ Stocks Types ============

export interface Stock {
  id: string;
  ticker: string;
  name: string;
  currency: string;
  sector?: string;
  exchange?: string;
  country?: string;
  price_scale?: number;
  notes?: string;
  created_at: string;
}

// ============ Stocks Endpoints ============

export async function fetchStocks(limit: number = 100, offset: number = 0): Promise<Stock[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/stocks/?limit=${limit}&offset=${offset}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to fetch stocks');
  }
  
  return response.json();
}

export async function searchStocks(query: string, limit: number = 20): Promise<Stock[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/stocks/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Failed to search stocks');
  }
  
  return response.json();
}

export async function fetchStock(ticker: string): Promise<Stock> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/stocks/${encodeURIComponent(ticker)}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    if (response.status === 404) {
      throw new Error('Stock not found');
    }
    throw new Error('Failed to fetch stock');
  }
  
  return response.json();
}

export async function createStock(data: {
  ticker: string;
  name: string;
  currency?: string;
  sector?: string;
  exchange?: string;
  country?: string;
  price_scale?: number;
  notes?: string;
}): Promise<Stock> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/stocks/`, {
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
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create stock');
    }
    throw new Error('Failed to create stock');
  }
  
  return response.json();
}

export async function updateStock(
  stockId: string,
  data: { name?: string; currency?: string; sector?: string; exchange?: string; country?: string; price_scale?: number; notes?: string }
): Promise<Stock> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/stocks/${stockId}`, {
    method: 'PUT',
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
    if (response.status === 404) {
      throw new Error('Stock not found');
    }
    throw new Error('Failed to update stock');
  }
  
  return response.json();
}

export async function deleteStock(stockId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/stocks/${stockId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Cannot delete stock with transactions');
    }
    throw new Error('Failed to delete stock');
  }
}

// ============ Transaction Update/Delete ============

export interface TransactionUpdateData {
  shares?: number;
  price_per_share?: number;
  currency?: string;
  exchange_rate_to_czk?: number;
  fees?: number;
  notes?: string;
  executed_at?: string;
}

export async function updateTransaction(
  portfolioId: string,
  transactionId: string,
  data: TransactionUpdateData
): Promise<Transaction> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}/transactions/${transactionId}`, {
    method: 'PUT',
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
    if (response.status === 404) {
      throw new Error('Transakce nenalezena');
    }
    throw new Error('Nepodařilo se upravit transakci');
  }
  
  const raw = await response.json();
  return {
    id: raw.id,
    portfolioId: raw.portfolio_id,
    ticker: raw.stocks?.ticker || '',
    stockName: raw.stocks?.name || '',
    type: raw.type,
    shares: raw.shares,
    price: raw.price_per_share,
    total: raw.total_amount,
    totalCzk: raw.total_amount * (raw.exchange_rate_to_czk || 1),
    currency: raw.currency,
    exchangeRate: raw.exchange_rate_to_czk,
    fees: raw.fees,
    date: raw.executed_at,
    notes: raw.notes,
  };
}

export async function deleteTransaction(
  portfolioId: string,
  transactionId: string
): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/portfolio/${portfolioId}/transactions/${transactionId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    if (response.status === 404) {
      throw new Error('Transakce nenalezena');
    }
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Nelze smazat transakci');
    }
    throw new Error('Nepodařilo se smazat transakci');
  }
}

// ============ Watchlist Types ============

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string | null;
  item_count?: number;
}

export interface WatchlistItem {
  id: string;
  watchlist_id: string;
  stock_id: string;
  target_buy_price: number | null;
  target_sell_price: number | null;
  notes: string | null;
  sector: string | null;
  added_at: string;
  updated_at: string | null;
  stocks: {
    id: string;
    ticker: string;
    name: string;
    currency: string;
    sector: string | null;
    price_scale: number;
  };
  tags?: WatchlistTag[];
}

export interface WatchlistTag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

// ============ Watchlist Endpoints ============

export async function fetchWatchlists(): Promise<Watchlist[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst watchlisty');
  }
  
  return response.json();
}

export async function fetchWatchlist(watchlistId: string): Promise<Watchlist> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Watchlist nenalezen');
    throw new Error('Nepodařilo se načíst watchlist');
  }
  
  return response.json();
}

export async function createWatchlist(data: {
  name: string;
  description?: string;
}): Promise<Watchlist> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se vytvořit watchlist');
  }
  
  return response.json();
}

export async function updateWatchlist(
  watchlistId: string,
  data: { name?: string; description?: string | null }
): Promise<Watchlist> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Watchlist nenalezen');
    throw new Error('Nepodařilo se upravit watchlist');
  }
  
  return response.json();
}

export async function deleteWatchlist(watchlistId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Watchlist nenalezen');
    throw new Error('Nepodařilo se smazat watchlist');
  }
}

export async function reorderWatchlists(watchlistIds: string[]): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/reorder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ watchlist_ids: watchlistIds }),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se změnit pořadí');
  }
}

// ============ Watchlist Items Endpoints ============

export async function fetchWatchlistItems(watchlistId: string): Promise<WatchlistItem[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}/items`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst položky');
  }
  
  return response.json();
}

export async function addWatchlistItem(
  watchlistId: string,
  data: {
    ticker: string;
    stock_name?: string;
    target_buy_price?: number;
    target_sell_price?: number;
    notes?: string;
    sector?: string;
  }
): Promise<WatchlistItem> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/${watchlistId}/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Nepodařilo se přidat položku');
    }
    throw new Error('Nepodařilo se přidat položku');
  }
  
  return response.json();
}

export async function updateWatchlistItem(
  itemId: string,
  data: {
    target_buy_price?: number | null;
    target_sell_price?: number | null;
    notes?: string | null;
    sector?: string | null;
  }
): Promise<WatchlistItem> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/items/${itemId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Položka nenalezena');
    throw new Error('Nepodařilo se upravit položku');
  }
  
  return response.json();
}

export async function deleteWatchlistItem(itemId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/items/${itemId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Položka nenalezena');
    throw new Error('Nepodařilo se smazat položku');
  }
}

export async function moveWatchlistItem(
  itemId: string,
  targetWatchlistId: string
): Promise<WatchlistItem> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/items/${itemId}/move`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ target_watchlist_id: targetWatchlistId }),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Nepodařilo se přesunout položku');
    }
    throw new Error('Nepodařilo se přesunout položku');
  }
  
  return response.json();
}

// ============ Watchlist Tags Endpoints ============

export async function fetchWatchlistTags(): Promise<WatchlistTag[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/tags/all`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst tagy');
  }
  
  return response.json();
}

export async function createWatchlistTag(data: {
  name: string;
  color?: string;
}): Promise<WatchlistTag> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/tags`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Nepodařilo se vytvořit tag');
    }
    throw new Error('Nepodařilo se vytvořit tag');
  }
  
  return response.json();
}

export async function updateWatchlistTag(
  tagId: string,
  data: { name?: string; color?: string }
): Promise<WatchlistTag> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/tags/${tagId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Tag nenalezen');
    throw new Error('Nepodařilo se upravit tag');
  }
  
  return response.json();
}

export async function deleteWatchlistTag(tagId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/tags/${tagId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Tag nenalezen');
    throw new Error('Nepodařilo se smazat tag');
  }
}

export async function fetchItemTags(itemId: string): Promise<WatchlistTag[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/items/${itemId}/tags`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst tagy položky');
  }
  
  return response.json();
}

export async function setItemTags(itemId: string, tagIds: string[]): Promise<WatchlistTag[]> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/watchlists/items/${itemId}/tags`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ tag_ids: tagIds }),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se nastavit tagy');
  }
  
  return response.json();
}

// ============ Options Types ============

export type OptionType = 'call' | 'put';
export type OptionAction = 'BTO' | 'STC' | 'STO' | 'BTC' | 'EXPIRATION' | 'ASSIGNMENT' | 'EXERCISE';
export type OptionPosition = 'long' | 'short';
export type Moneyness = 'ITM' | 'ATM' | 'OTM';

export interface OptionTransaction {
  id: string;
  portfolio_id: string;
  portfolio_name?: string;
  symbol: string;
  option_symbol: string;
  option_type: OptionType;
  strike_price: number;
  expiration_date: string;
  action: OptionAction;
  contracts: number;
  premium: number | null;
  total_premium: number | null;
  currency: string;
  exchange_rate_to_czk: number | null;
  fees: number;
  date: string;
  notes: string | null;
  linked_stock_tx_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OptionHolding {
  portfolio_id: string;
  symbol: string;
  option_symbol: string;
  option_type: OptionType;
  strike_price: number;
  expiration_date: string;
  position: OptionPosition;
  contracts: number;
  avg_premium: number | null;
  total_cost: number;
  total_fees: number;
  first_transaction: string | null;
  last_transaction: string | null;
  dte: number;
  // From option_prices cache
  current_price: number | null;
  bid: number | null;
  ask: number | null;
  implied_volatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  price_updated_at: string | null;
  // Underlying price
  underlying_price: number | null;
  underlying_price_updated_at: string | null;
  underlying_price_source: 'portfolio' | 'watchlist' | null;
  moneyness: Moneyness | null;
  buffer_percent: number | null;
}

export interface OptionStats {
  total_positions: number;
  long_positions: number;
  short_positions: number;
  expiring_this_week: number;
  calls: number;
  puts: number;
  total_cost: number;
  itm_count: number;
  otm_count: number;
}

export interface CreateOptionTransactionInput {
  symbol: string;
  option_type: OptionType;
  strike_price: number;
  expiration_date: string;
  action: OptionAction;
  contracts: number;
  premium?: number;
  currency?: string;
  exchange_rate_to_czk?: number;
  fees?: number;
  date: string;
  notes?: string;
}

export interface UpdateOptionTransactionInput {
  action?: OptionAction;
  contracts?: number;
  premium?: number;
  currency?: string;
  exchange_rate_to_czk?: number;
  fees?: number;
  date?: string;
  notes?: string;
}

// ============ Options Endpoints ============

export async function fetchOptionHoldings(portfolioId?: string): Promise<OptionHolding[]> {
  const authHeader = await getAuthHeader();
  const url = portfolioId 
    ? `${API_URL}/api/options/holdings/${portfolioId}`
    : `${API_URL}/api/options/holdings`;
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst opční pozice');
  }
  
  return response.json();
}

export async function fetchOptionTransactions(
  portfolioId?: string,
  symbol?: string,
  optionSymbol?: string,
  limit: number = 100
): Promise<OptionTransaction[]> {
  const authHeader = await getAuthHeader();
  const params = new URLSearchParams();
  if (portfolioId) params.append('portfolio_id', portfolioId);
  if (symbol) params.append('symbol', symbol);
  if (optionSymbol) params.append('option_symbol', optionSymbol);
  params.append('limit', limit.toString());
  
  const response = await fetch(`${API_URL}/api/options/transactions?${params}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw new Error('Nepodařilo se načíst opční transakce');
  }
  
  return response.json();
}

export async function fetchOptionStats(portfolioId?: string): Promise<OptionStats> {
  const authHeader = await getAuthHeader();
  const params = portfolioId ? `?portfolio_id=${portfolioId}` : '';
  
  const response = await fetch(`${API_URL}/api/options/stats${params}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se načíst statistiky');
  }
  
  return response.json();
}

export async function createOptionTransaction(
  portfolioId: string,
  data: CreateOptionTransactionInput
): Promise<OptionTransaction> {
  const authHeader = await getAuthHeader();
  
  const response = await fetch(`${API_URL}/api/options/transactions/${portfolioId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Nepodařilo se vytvořit transakci');
  }
  
  return response.json();
}

export async function updateOptionTransaction(
  transactionId: string,
  data: UpdateOptionTransactionInput
): Promise<OptionTransaction> {
  const authHeader = await getAuthHeader();
  
  const response = await fetch(`${API_URL}/api/options/transactions/${transactionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Transakce nenalezena');
    throw new Error('Nepodařilo se upravit transakci');
  }
  
  return response.json();
}

export async function deleteOptionTransaction(transactionId: string): Promise<void> {
  const authHeader = await getAuthHeader();
  
  const response = await fetch(`${API_URL}/api/options/transactions/${transactionId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Transakce nenalezena');
    throw new Error('Nepodařilo se smazat transakci');
  }
}

export async function deleteOptionTransactionsBySymbol(
  portfolioId: string,
  optionSymbol: string
): Promise<void> {
  const authHeader = await getAuthHeader();
  
  const response = await fetch(
    `${API_URL}/api/options/transactions/by-symbol/${encodeURIComponent(optionSymbol)}?portfolio_id=${portfolioId}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
    }
  );
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 404) throw new Error('Pozice nenalezena');
    throw new Error('Nepodařilo se smazat pozici');
  }
}

export async function closeOptionPosition(
  portfolioId: string,
  optionSymbol: string,
  closingAction: OptionAction,
  contracts: number,
  closeDate: string,
  premium?: number,
  fees?: number,
  exchangeRateToCzk?: number,
  notes?: string
): Promise<OptionTransaction> {
  const authHeader = await getAuthHeader();
  
  const params = new URLSearchParams({
    option_symbol: optionSymbol,
    closing_action: closingAction,
    contracts: contracts.toString(),
    close_date: closeDate,
  });
  
  if (premium !== undefined) params.append('premium', premium.toString());
  if (fees !== undefined) params.append('fees', fees.toString());
  if (exchangeRateToCzk !== undefined) params.append('exchange_rate_to_czk', exchangeRateToCzk.toString());
  if (notes) params.append('notes', notes);
  
  const response = await fetch(`${API_URL}/api/options/${portfolioId}/close?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized');
    if (response.status === 400) {
      const error = await response.json();
      throw new Error(error.detail || 'Neplatný požadavek');
    }
    throw new Error('Nepodařilo se uzavřít pozici');
  }
  
  return response.json();
}

