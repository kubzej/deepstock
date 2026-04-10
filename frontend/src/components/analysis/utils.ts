/**
 * Analysis utilities
 * 
 * Date range helpers, performance calculations, and color mappings.
 */
import {
  parseISO,
  startOfYear,
  startOfMonth,
  subDays,
  subWeeks,
  subMonths,
  subYears,
} from 'date-fns';
import type { Transaction, OptionTransaction } from '@/lib/api';

// ============ Types ============

export type DateRangePreset =
  | '1D'
  | '2D'
  | '1W'
  | '1M'
  | '3M'
  | '6M'
  | 'YTD'
  | 'MTD'
  | '1Y'
  | '5Y'
  | 'ALL'
  | 'CUSTOM';

export interface StockPerformanceData {
  totalBought: number;
  totalSold: number;
  netCashflow: number;
  realizedPL: number;
  avgPerTrade: number;
  biggestWin: number;
  biggestLoss: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  closedTrades: ClosedStockTrade[];
}

export interface ClosedStockTrade {
  id: string;
  ticker: string;
  stockName: string;
  portfolioName?: string;
  shares: number;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  currency: string;
  costBasisCzk: number;
  proceedsCzk: number;
  realizedPLCzk: number;
  realizedPLPct: number;
}

export interface OptionPerformanceData {
  open: {
    premiumReceived: number;
    premiumPaid: number;
    netPremium: number;
  };
  closed: {
    premiumReceived: number;
    premiumPaid: number;
    realizedPL: number;
  };
  totalTrades: number;
  closedTrades: ClosedOptionTrade[];
}

export interface ClosedOptionTrade {
  id: string;
  symbol: string;
  optionSymbol: string;
  action: OptionTransaction['action'];
  optionType: OptionTransaction['option_type'];
  strikePrice: number;
  expirationDate: string;
  contracts: number;
  date: string;
  currency: string;
  portfolioName?: string;
  realizedPLCzk: number;
  realizedPLPct: number;
  isPercentMeaningful: boolean;
}

export interface DistributionItem {
  label: string;
  value: number;
  percent: number;
  color: string;
}

// ============ Constants ============

export const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: '1D', label: '1D' },
  { value: '2D', label: '2D' },
  { value: '1W', label: '1T' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: 'MTD', label: 'MTD' },
  { value: 'YTD', label: 'YTD' },
  { value: '1Y', label: '1R' },
  { value: '5Y', label: '5R' },
  { value: 'ALL', label: 'Vše' },
  { value: 'CUSTOM', label: 'Vlastní' },
];

export const SECTOR_COLORS: Record<string, string> = {
  Technology: '#3b82f6',
  Healthcare: '#22c55e',
  'Financial Services': '#f59e0b',
  'Consumer Cyclical': '#ec4899',
  'Communication Services': '#8b5cf6',
  Industrials: '#64748b',
  'Consumer Defensive': '#14b8a6',
  Energy: '#ef4444',
  Utilities: '#06b6d4',
  'Real Estate': '#a855f7',
  'Basic Materials': '#84cc16',
  Other: '#6b7280',
};

export const COUNTRY_COLORS: Record<string, string> = {
  USA: '#3b82f6',
  US: '#3b82f6',
  CZ: '#dc2626',
  Czechia: '#dc2626',
  DE: '#fbbf24',
  Germany: '#fbbf24',
  UK: '#1d4ed8',
  GB: '#1d4ed8',
  Other: '#6b7280',
};

export const EXCHANGE_COLORS: Record<string, string> = {
  NYSE: '#3b82f6',
  NASDAQ: '#22c55e',
  XETRA: '#fbbf24',
  PSE: '#dc2626',
  LSE: '#8b5cf6',
  Other: '#6b7280',
};

// ============ Helper Functions ============

export function getDateRange(
  preset: DateRangePreset,
  customFrom?: string,
  customTo?: string
): { from: Date; to: Date } {
  const now = new Date();
  const to = now;

  switch (preset) {
    case '1D':
      return { from: subDays(now, 1), to };
    case '2D':
      return { from: subDays(now, 2), to };
    case '1W':
      return { from: subWeeks(now, 1), to };
    case '1M':
      return { from: subMonths(now, 1), to };
    case '3M':
      return { from: subMonths(now, 3), to };
    case '6M':
      return { from: subMonths(now, 6), to };
    case 'MTD':
      return { from: startOfMonth(now), to };
    case 'YTD':
      return { from: startOfYear(now), to };
    case '1Y':
      return { from: subYears(now, 1), to };
    case '5Y':
      return { from: subYears(now, 5), to };
    case 'ALL':
      return { from: new Date(2000, 0, 1), to };
    case 'CUSTOM':
      return {
        from: customFrom ? parseISO(customFrom) : subMonths(now, 1),
        to: customTo ? parseISO(customTo) : now,
      };
    default:
      return { from: startOfYear(now), to };
  }
}

// ============ Performance Calculations ============

export function calculateStockPerformance(
  transactions: Transaction[]
): StockPerformanceData {
  let totalBought = 0;
  let totalSold = 0;
  const trades: number[] = [];
  const closedTrades: ClosedStockTrade[] = [];

  transactions.forEach((tx) => {
    const amount = tx.totalCzk || 0;
    if (tx.type === 'BUY') {
      totalBought += amount;
    } else {
      totalSold += amount;
      if (tx.sourceTransaction) {
        const costBasis =
          tx.sourceTransaction.price * tx.shares * (tx.exchangeRate || 1);
        const saleAmount = amount;
        const pl = saleAmount - costBasis;
        trades.push(pl);

        const realizedPLPct = costBasis > 0 ? (pl / costBasis) * 100 : 0;

        closedTrades.push({
          id: tx.id,
          ticker: tx.ticker,
          stockName: tx.stockName,
          portfolioName: tx.portfolioName,
          shares: tx.shares,
          buyDate: tx.sourceTransaction.date,
          sellDate: tx.date,
          buyPrice: tx.sourceTransaction.price,
          sellPrice: tx.price,
          currency: tx.currency,
          costBasisCzk: costBasis,
          proceedsCzk: saleAmount,
          realizedPLCzk: pl,
          realizedPLPct,
        });
      }
    }
  });

  closedTrades.sort(
    (a, b) => new Date(b.sellDate).getTime() - new Date(a.sellDate).getTime()
  );

  const netCashflow = totalSold - totalBought;
  const realizedPL = trades.reduce((sum, pl) => sum + pl, 0);
  const winningTrades = trades.filter((pl) => pl > 0);
  const losingTrades = trades.filter((pl) => pl < 0);

  return {
    totalBought,
    totalSold,
    netCashflow,
    realizedPL,
    avgPerTrade: trades.length > 0 ? realizedPL / trades.length : 0,
    biggestWin: winningTrades.length > 0 ? Math.max(...winningTrades) : 0,
    biggestLoss: losingTrades.length > 0 ? Math.min(...losingTrades) : 0,
    winRate:
      trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    closedTrades,
  };
}

export function calculateOptionPerformance(
  transactions: OptionTransaction[]
): OptionPerformanceData {
  const result: OptionPerformanceData = {
    open: { premiumReceived: 0, premiumPaid: 0, netPremium: 0 },
    closed: { premiumReceived: 0, premiumPaid: 0, realizedPL: 0 },
    totalTrades: transactions.length,
    closedTrades: [],
  };

  transactions.forEach((tx) => {
    const economicAmountCzk = tx.economic_amount_czk;
    const netCashflowCzk = tx.net_cashflow_czk;

    if (tx.action === 'BTO') {
      result.open.premiumPaid += economicAmountCzk;
      return;
    }

    if (tx.action === 'STO') {
      result.open.premiumReceived += economicAmountCzk;
      return;
    }

    if (tx.action === 'BTC') {
      result.closed.premiumPaid += economicAmountCzk;
    } else if (tx.action === 'STC') {
      result.closed.premiumReceived += economicAmountCzk;
    }

    if (tx.realized_pl_czk === null || tx.realized_pl_czk === undefined) {
      return;
    }

    const realizedPL = tx.realized_pl_czk;
    result.closed.realizedPL += realizedPL;

    const base = Math.abs(netCashflowCzk - realizedPL);
    const isPercentMeaningful =
      base > 0 && tx.action !== 'ASSIGNMENT' && tx.action !== 'EXERCISE';
    const realizedPLPct = isPercentMeaningful ? (realizedPL / base) * 100 : 0;

    result.closedTrades.push({
      id: tx.id,
      symbol: tx.symbol,
      optionSymbol: tx.option_symbol,
      action: tx.action,
      optionType: tx.option_type,
      strikePrice: tx.strike_price,
      expirationDate: tx.expiration_date,
      contracts: tx.contracts,
      date: tx.date,
      currency: tx.currency,
      portfolioName: tx.portfolio_name,
      realizedPLCzk: realizedPL,
      realizedPLPct,
      isPercentMeaningful,
    });
  });

  result.closedTrades.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  result.open.netPremium = result.open.premiumReceived - result.open.premiumPaid;

  return result;
}
