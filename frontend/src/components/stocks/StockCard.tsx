import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Quote } from '@/lib/api';
import { Sparkline } from '@/components/shared/Sparkline';
import {
  formatCurrency,
  formatPercent,
  formatPrice,
  formatShares,
  formatVolumeRatio,
} from '@/lib/format';

interface PortfolioHolding {
  ticker: string;
  portfolioName?: string;
  shares: number;
  currentValueCzk: number;
  plCzk: number;
  plPercent: number;
}

interface StockCardProps {
  ticker: string;
  name?: string;
  currency?: string;
  quote: Quote | null;
  shares?: number;
  avgCost?: number;
  valueCzk?: number;
  investedCzk?: number;
  weight?: number;
  targetPrice?: number;
  portfolioCount?: number;
  portfolioHoldings?: PortfolioHolding[];
  sparklineData?: number[] | null;
  onClick?: () => void;
}

export function StockCard({
  ticker,
  name,
  currency = 'USD',
  quote,
  shares,
  avgCost,
  valueCzk,
  investedCzk,
  weight,
  targetPrice,
  portfolioCount,
  portfolioHoldings,
  sparklineData,
  onClick,
}: StockCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isDayPositive = quote && quote.changePercent >= 0;
  const plCzk = valueCzk && investedCzk ? valueCzk - investedCzk : 0;
  const plPercent = investedCzk ? (plCzk / investedCzk) * 100 : 0;
  const isPositive = plCzk >= 0;
  const isExpandable = portfolioCount && portfolioCount > 1;
  const hasPortfolioBreakdown =
    portfolioHoldings && portfolioHoldings.length > 1;

  const handleClick = () => {
    setExpanded(!expanded);
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  // Calculate target distance
  const targetDistancePercent =
    targetPrice && quote?.price
      ? ((targetPrice - quote.price) / quote.price) * 100
      : null;
  const extendedPrice =
    quote?.preMarketPrice != null
      ? quote.preMarketPrice
      : quote?.postMarketPrice != null
        ? quote.postMarketPrice
        : null;
  const extendedPriceTone =
    quote?.preMarketPrice != null ? 'text-warning' : 'text-info';
  const extendedChangePercent =
    quote?.preMarketChangePercent != null
      ? quote.preMarketChangePercent
      : quote?.postMarketChangePercent != null
        ? quote.postMarketChangePercent
        : null;
  const extendedChangeTone =
    quote?.preMarketChangePercent != null ? 'text-warning' : 'text-info';

  return (
    <div
      className="bg-muted/30 rounded-xl cursor-pointer active:scale-[0.99] transition-transform"
      onClick={handleClick}
    >
      {/* Main content */}
      <div className="px-3 py-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-start">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-sm">{ticker}</span>
              {isExpandable && (
                <span className="text-[10px] text-muted-foreground">
                  ×{portfolioCount}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground truncate">
                {name}
              </span>
            </div>
          </div>

          <div className="min-w-[140px] flex items-baseline justify-end gap-1.5 text-right">
            <span
              className={`font-mono-price text-sm font-medium ${isPositive ? 'text-positive' : 'text-negative'}`}
            >
              {formatCurrency(plCzk)}
            </span>
            <span
              className={`text-[10px] font-mono-price ${isPositive ? 'text-positive/60' : 'text-negative/60'}`}
            >
              {formatPercent(plPercent, 1, true)}
            </span>
          </div>

          <div className="min-w-0 min-h-[28px] flex flex-col justify-center leading-tight">
            <span className="text-[11px] text-muted-foreground font-mono-price">
              {formatPrice(quote?.price, currency)}
            </span>
            {extendedPrice != null && (
              <span
                className={`text-[10px] font-mono-price ${extendedPriceTone}`}
              >
                {formatPrice(extendedPrice, currency)}
              </span>
            )}
          </div>

          <div className="min-w-[140px] grid grid-cols-[72px_auto] items-center justify-end gap-x-3 min-h-[28px]">
            <div className="w-[72px] flex justify-center pr-1">
              {sparklineData && sparklineData.length >= 2 ? (
                <div className="h-7 w-[72px] overflow-hidden rounded-sm opacity-90">
                  <Sparkline data={sparklineData} className="h-full w-full" />
                </div>
              ) : null}
            </div>
            <div className="min-w-[48px] flex flex-col items-end justify-center leading-tight text-right">
              <span
                className={`text-[10px] font-mono-price ${isDayPositive ? 'text-positive/70' : 'text-negative/70'}`}
              >
                {formatPercent(quote?.changePercent, 1, true)}
              </span>
              {extendedChangePercent != null && (
                <span
                  className={`text-[10px] font-mono-price ${extendedChangeTone}`}
                >
                  {formatPercent(extendedChangePercent, 1, true)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Expanded Details */}
        <div
          className={`grid transition-all duration-200 ease-out ${
            expanded
              ? 'grid-rows-[1fr] opacity-100 mt-3'
              : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            {/* Stats - 3 column compact */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground/70 block">Počet</span>
                <span className="font-mono-price">
                  {formatShares(shares)} ks
                </span>
              </div>
              <div>
                <span className="text-muted-foreground/70 block">Hodnota</span>
                <span className="font-mono-price">
                  {formatCurrency(valueCzk)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground/70 block">Váha</span>
                <span className="font-mono-price">
                  {formatPercent(weight, 1)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground/70 block">Průměrná</span>
                <span className="font-mono-price">
                  {formatPrice(avgCost, currency)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground/70 block">
                  Investováno
                </span>
                <span className="font-mono-price">
                  {formatCurrency(investedCzk)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground/70 block">Objem</span>
                <span className="font-mono-price">
                  {formatVolumeRatio(quote?.volume, quote?.avgVolume)}
                </span>
              </div>
              {targetPrice && (
                <>
                  <div>
                    <span className="text-muted-foreground/70 block">
                      Cílová
                    </span>
                    <span className="font-mono-price">
                      {formatPrice(targetPrice, currency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/70 block">
                      K cíli
                    </span>
                    <span
                      className={`font-mono-price ${targetDistancePercent && targetDistancePercent >= 0 ? 'text-positive' : 'text-negative'}`}
                    >
                      {formatPercent(targetDistancePercent, 1, true)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Portfolio Breakdown (for "All portfolios" view) */}
            {hasPortfolioBreakdown && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wide block mb-2">
                  Portfolia
                </span>
                <div className="space-y-1.5">
                  {portfolioHoldings.map((sub) => (
                    <div
                      key={`${sub.ticker}-${sub.portfolioName}`}
                      className="flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {sub.portfolioName}
                        </span>
                        <span className="font-mono-price text-muted-foreground/60">
                          {formatShares(sub.shares)} ks
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={`font-mono-price ${sub.plCzk >= 0 ? 'text-positive' : 'text-negative'}`}
                        >
                          {formatCurrency(sub.plCzk)}
                        </span>
                        <span
                          className={`font-mono-price text-[10px] ${sub.plCzk >= 0 ? 'text-positive/60' : 'text-negative/60'}`}
                        >
                          {formatPercent(sub.plPercent, 1, true)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detail link */}
            <div
              onClick={handleNavigate}
              className="mt-3 flex items-center justify-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <span>Zobrazit detail</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
