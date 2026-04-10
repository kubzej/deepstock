import type { ExchangeRates, Quote } from '@/lib/api';
import { toCZK } from '@/lib/format';

export interface PortfolioSnapshotHolding {
  ticker: string;
  shares: number;
  currency: string;
  priceScale?: number;
  totalInvestedCzk: number;
}

export interface PortfolioSnapshot {
  totalValueCzk: number;
  totalCostCzk: number;
  totalPnLCzk: number;
  totalPnLPercent: number;
  dailyChangeCzk: number;
  dailyChangePercent: number;
}

export function calculatePortfolioSnapshot(
  holdings: PortfolioSnapshotHolding[],
  quotes: Record<string, Quote>,
  rates: ExchangeRates,
): PortfolioSnapshot {
  const totalValueCzk = holdings.reduce((sum, holding) => {
    const price = quotes[holding.ticker]?.price ?? 0;
    const scale = holding.priceScale ?? 1;
    return sum + toCZK(price * scale * holding.shares, holding.currency, rates);
  }, 0);

  const totalCostCzk = holdings.reduce(
    (sum, holding) => sum + holding.totalInvestedCzk,
    0,
  );

  const totalPnLCzk = totalValueCzk - totalCostCzk;
  const totalPnLPercent =
    totalCostCzk > 0 ? (totalPnLCzk / totalCostCzk) * 100 : 0;

  const dailyChangeCzk = holdings.reduce((sum, holding) => {
    const change = quotes[holding.ticker]?.change ?? 0;
    const scale = holding.priceScale ?? 1;
    return sum + toCZK(change * scale * holding.shares, holding.currency, rates);
  }, 0);

  const dailyChangePercent =
    totalValueCzk > 0
      ? (dailyChangeCzk / (totalValueCzk - dailyChangeCzk)) * 100
      : 0;

  return {
    totalValueCzk,
    totalCostCzk,
    totalPnLCzk,
    totalPnLPercent,
    dailyChangeCzk,
    dailyChangePercent,
  };
}