/**
 * Market API - Quotes, price history, stock info, technical indicators
 */
import { API_URL } from './client';

// ============ Quote Types ============

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  preMarketPrice?: number | null;
  preMarketChangePercent?: number | null;
  postMarketPrice?: number | null;
  postMarketChangePercent?: number | null;
  earningsDate?: string | null;
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

// ============ Quote Endpoints ============

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

// ============ Price History ============

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

// ============ Stock Info ============

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
  bookValue: number | null;
  sharesOutstanding: number | null;
  earningsGrowth: number | null;
  
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
  
  // Valuation (fair value estimates from backend)
  valuation?: {
    models: Array<{
      method: string;
      description: string;
      tooltip?: string;
      fairValue: number;
      upside: number;
      inputs: Record<string, number | string | null>;
      confidence: 'high' | 'medium' | 'low';
    }>;
    composite: {
      fairValue: number | null;
      upside: number | null;
      signal: 'undervalued' | 'slightly_undervalued' | 'fair' | 'slightly_overvalued' | 'overvalued' | 'hold';
      modelsUsed: number;
    } | null;
    currentPrice: number;
    currency: string;
  };
  
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

export interface FibonacciLevels {
  '0': number | null;
  '236': number | null;
  '382': number | null;
  '500': number | null;
  '618': number | null;
  '786': number | null;
  '1000': number | null;
}

export interface FibonacciHistoryPoint {
  date: string;
  price: number | null;
  high: number | null;
  low: number | null;
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
  
  // Fibonacci Retracement
  fibonacciLevels: FibonacciLevels | null;
  fibonacciPosition: number | null;
  nearestFibLevel: number | null;
  periodHigh: number | null;
  periodLow: number | null;
  fibonacciHistory: FibonacciHistoryPoint[];
  
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
