import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Quote } from '@/lib/api';
import {
  formatCurrency,
  formatPercent,
  formatPrice,
  formatShares,
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
  sector?: string;
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
  onClick?: () => void;
}

export function StockCard({
  ticker,
  name,
  sector,
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

  return (
    <div
      className="bg-muted/30 rounded-xl cursor-pointer active:scale-[0.99] transition-transform"
      onClick={handleClick}
    >
      {/* Main content */}
      <div className="px-3 py-2.5">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          {/* Left: Ticker + Name */}
          <div className="min-w-0 flex-1">
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

          {/* Right: P/L */}
          <div className="flex items-baseline gap-1.5 flex-shrink-0">
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
        </div>

        {/* Subrow: Price + Daily */}
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[11px] text-muted-foreground font-mono-price">
            {formatPrice(quote?.price, currency)}
          </span>
          <span
            className={`text-[10px] font-mono-price ${isDayPositive ? 'text-positive/70' : 'text-negative/70'}`}
          >
            dnes {formatPercent(quote?.changePercent, 1, true)}
          </span>
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
            {sector && (
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide mb-2">
                {sector}
              </p>
            )}

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
