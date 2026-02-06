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
      }
    }
  });

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
  };
}

export function calculateOptionPerformance(
  transactions: OptionTransaction[]
): OptionPerformanceData {
  const result: OptionPerformanceData = {
    open: { premiumReceived: 0, premiumPaid: 0, netPremium: 0 },
    closed: { premiumReceived: 0, premiumPaid: 0, realizedPL: 0 },
    totalTrades: transactions.length,
  };

  // Simpler logic: categorize by action type
  // Opening transactions (STO, BTO) go to "open"
  // Closing transactions (STC, BTC, EXPIRATION, ASSIGNMENT, EXERCISE) go to "closed"
  transactions.forEach((tx) => {
    const premium = Math.abs(tx.total_premium || 0) * (tx.exchange_rate_to_czk || 1);
    const fees = (tx.fees || 0) * (tx.exchange_rate_to_czk || 1);

    switch (tx.action) {
      case 'STO': // Sell to Open - received premium
        result.open.premiumReceived += premium;
        result.open.netPremium += premium - fees;
        break;
      case 'BTO': // Buy to Open - paid premium
        result.open.premiumPaid += premium;
        result.open.netPremium -= premium + fees;
        break;
      case 'STC': // Sell to Close - received premium (closing long position)
        result.closed.premiumReceived += premium;
        result.closed.realizedPL += premium - fees;
        break;
      case 'BTC': // Buy to Close - paid premium (closing short position)
        result.closed.premiumPaid += premium;
        result.closed.realizedPL -= premium + fees;
        break;
      case 'EXPIRATION':
        // No premium movement, but position is closed
        // If we know the original position, we could count full profit/loss
        break;
      case 'ASSIGNMENT':
      case 'EXERCISE':
        // Premium movement depends on the stock transaction
        // For now, just track the fees
        result.closed.realizedPL -= fees;
        break;
    }
  });

  return result;
}
