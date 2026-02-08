import { useState, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PillButton } from '@/components/shared/PillButton';
import {
  formatCurrency,
  formatPercent,
  formatPrice,
  formatDate,
} from '@/lib/format';
import type { ExchangeRates } from '@/lib/api';
import { toCZK } from '@/lib/format';

export interface OpenLot {
  id: string;
  ticker: string;
  stockName: string;
  date: string;
  shares: number;
  buyPrice: number;
  currentPrice: number;
  currency: string;
  priceScale?: number;
  portfolioName?: string;
}

type SortKey =
  | 'ticker'
  | 'date'
  | 'shares'
  | 'buyPrice'
  | 'currentPrice'
  | 'plCzk'
  | 'plPercent';
type SortDirection = 'asc' | 'desc';

// Individual Lot Row — unified for mobile & desktop
function LotRow({
  lot,
  showPortfolio,
  onClick,
}: {
  lot: {
    id: string;
    ticker: string;
    stockName: string;
    date: string;
    shares: number;
    buyPrice: number;
    currentPriceScaled: number;
    currency: string;
    plCzk: number;
    plPercent: number;
    costBasisCzk: number;
    currentValueCzk: number;
    portfolioName?: string;
  };
  showPortfolio: boolean;
  onClick?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPositive = lot.plCzk >= 0;

  const handleClick = () => {
    setExpanded(!expanded);
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  return (
    <div
      className="bg-muted/30 rounded-xl cursor-pointer active:scale-[0.99] transition-transform"
      onClick={handleClick}
    >
      <div className="px-3 py-2.5">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          {/* Left: Ticker + name (desktop) + date */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm">{lot.ticker}</span>
              <span className="hidden md:inline text-[11px] text-muted-foreground truncate max-w-[160px]">
                {lot.stockName}
              </span>
              <span className="text-[11px] text-muted-foreground">
                · {formatDate(lot.date)}
              </span>
              {showPortfolio && lot.portfolioName && (
                <span className="hidden md:inline text-[11px] text-muted-foreground">
                  · {lot.portfolioName}
                </span>
              )}
            </div>
          </div>

          {/* Right: P/L */}
          <div className="flex items-baseline gap-1.5 flex-shrink-0">
            <span
              className={`font-mono-price text-sm font-medium ${isPositive ? 'text-positive' : 'text-negative'}`}
            >
              {formatCurrency(lot.plCzk)}
            </span>
            <Badge
              variant="outline"
              className={`hidden md:inline-flex text-[10px] px-1.5 py-0 h-[18px] font-medium font-mono-price ${
                isPositive
                  ? 'text-positive border-positive/20'
                  : 'text-negative border-negative/20'
              }`}
            >
              {formatPercent(lot.plPercent, 1, true)}
            </Badge>
            <span
              className={`md:hidden text-[10px] font-mono-price ${isPositive ? 'text-positive/60' : 'text-negative/60'}`}
            >
              {formatPercent(lot.plPercent, 1, true)}
            </span>
          </div>
        </div>

        {/* Subrow: Shares × Buy Price → Current Price | Cost → Value (desktop) */}
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[11px] text-muted-foreground font-mono-price">
            {lot.shares} ks × {formatPrice(lot.buyPrice, lot.currency)}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground font-mono-price">
              → {formatPrice(lot.currentPriceScaled, lot.currency)}
            </span>
            <span className="hidden md:inline text-[11px] text-muted-foreground font-mono-price">
              {formatCurrency(lot.costBasisCzk)} →{' '}
              {formatCurrency(lot.currentValueCzk)}
            </span>
          </div>
        </div>

        {/* Expanded Details (mobile only — desktop shows inline) */}
        <div
          className={`md:hidden grid transition-all duration-200 ease-out ${
            expanded
              ? 'grid-rows-[1fr] opacity-100 mt-3'
              : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            {showPortfolio && lot.portfolioName && (
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide mb-2">
                {lot.portfolioName}
              </p>
            )}

            {/* Stats inline */}
            <div className="flex items-start gap-6 text-xs">
              <div>
                <span className="text-muted-foreground/70 block">
                  Investováno
                </span>
                <span className="font-mono-price">
                  {formatCurrency(lot.costBasisCzk)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground/70 block">Hodnota</span>
                <span className="font-mono-price">
                  {formatCurrency(lot.currentValueCzk)}
                </span>
              </div>
            </div>

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

interface OpenLotsRankingProps {
  lots: OpenLot[];
  rates: ExchangeRates;
  maxItems?: number;
  onLotClick?: (ticker: string) => void;
  showPortfolioColumn?: boolean;
}

export function OpenLotsRanking({
  lots,
  rates,
  maxItems,
  onLotClick,
  showPortfolioColumn = false,
}: OpenLotsRankingProps) {
  const [sortKey, setSortKey] = useState<SortKey>('plPercent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Calculate P/L for each lot
  const lotsWithPL = useMemo(
    () =>
      lots.map((lot) => {
        const scale = lot.priceScale ?? 1;
        // buyPrice is stored in actual currency (e.g., GBP for LSE stocks)
        // currentPrice from quotes is in quoted units (e.g., pence) - needs scale
        const costBasis = lot.buyPrice * lot.shares;
        const currentPriceScaled = lot.currentPrice * scale;
        const currentValue = currentPriceScaled * lot.shares;
        const plAmount = currentValue - costBasis;
        const plPercent = costBasis > 0 ? (plAmount / costBasis) * 100 : 0;

        const costBasisCzk = toCZK(costBasis, lot.currency, rates);
        const currentValueCzk = toCZK(currentValue, lot.currency, rates);
        const plCzk = currentValueCzk - costBasisCzk;

        return {
          ...lot,
          plPercent,
          plCzk,
          costBasisCzk,
          currentValueCzk,
          currentPriceScaled,
        };
      }),
    [lots, rates],
  );

  // Sort lots
  const sortedLots = useMemo(() => {
    return [...lotsWithPL].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortKey) {
        case 'ticker':
          aVal = a.ticker;
          bVal = b.ticker;
          break;
        case 'date':
          aVal = new Date(a.date).getTime();
          bVal = new Date(b.date).getTime();
          break;
        case 'shares':
          aVal = a.shares;
          bVal = b.shares;
          break;
        case 'buyPrice':
          aVal = a.buyPrice;
          bVal = b.buyPrice;
          break;
        case 'currentPrice':
          aVal = a.currentPriceScaled;
          bVal = b.currentPriceScaled;
          break;
        case 'plCzk':
          aVal = a.plCzk;
          bVal = b.plCzk;
          break;
        case 'plPercent':
          aVal = a.plPercent;
          bVal = b.plPercent;
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [lotsWithPL, sortKey, sortDirection]);

  const displayedLots = maxItems ? sortedLots.slice(0, maxItems) : sortedLots;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'ticker' ? 'asc' : 'desc');
    }
  };

  if (lots.length === 0) {
    return null;
  }

  return (
    <div className="pb-12">
      {/* Sort Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        {[
          { key: 'plCzk' as SortKey, label: 'P/L' },
          { key: 'plPercent' as SortKey, label: '%' },
          { key: 'date' as SortKey, label: 'Datum' },
          { key: 'shares' as SortKey, label: 'Počet' },
          { key: 'ticker' as SortKey, label: 'A-Z' },
        ].map((option) => {
          const isActive = sortKey === option.key;
          return (
            <PillButton
              key={option.key}
              active={isActive}
              onClick={() => handleSort(option.key)}
              size="sm"
            >
              {option.label}
              {isActive && (
                <span className="ml-0.5">
                  {sortDirection === 'desc' ? '↓' : '↑'}
                </span>
              )}
            </PillButton>
          );
        })}
      </div>

      {/* Lot Rows */}
      <div className="space-y-1">
        {displayedLots.map((lot) => (
          <LotRow
            key={lot.id}
            lot={lot}
            showPortfolio={showPortfolioColumn}
            onClick={() => onLotClick?.(lot.ticker)}
          />
        ))}
      </div>
    </div>
  );
}
