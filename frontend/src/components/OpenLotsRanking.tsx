import { useState, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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

// Sort icon component
function SortIcon({
  sortKey,
  columnKey,
  sortDirection,
}: {
  sortKey: SortKey;
  columnKey: SortKey;
  sortDirection: SortDirection;
}) {
  if (sortKey !== columnKey) {
    return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-30" />;
  }
  return sortDirection === 'asc' ? (
    <ArrowUp className="ml-1 h-3 w-3 inline" />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3 inline" />
  );
}

// Mobile Lot Card Component
function LotCard({
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
          {/* Left: Ticker + Date */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-sm">{lot.ticker}</span>
              <span className="text-[11px] text-muted-foreground">
                {formatDate(lot.date)}
              </span>
            </div>
          </div>

          {/* Right: P/L */}
          <div className="flex items-baseline gap-1.5 flex-shrink-0">
            <span
              className={`font-mono-price text-sm font-medium ${isPositive ? 'text-positive' : 'text-negative'}`}
            >
              {formatCurrency(lot.plCzk)}
            </span>
            <span
              className={`text-[10px] font-mono-price ${isPositive ? 'text-positive/60' : 'text-negative/60'}`}
            >
              {formatPercent(lot.plPercent, 1, true)}
            </span>
          </div>
        </div>

        {/* Subrow: Shares × Price → Current */}
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[11px] text-muted-foreground font-mono-price">
            {lot.shares} ks × {formatPrice(lot.buyPrice, lot.currency)}
          </span>
          <span className="text-[11px] text-muted-foreground font-mono-price">
            → {formatPrice(lot.currentPriceScaled, lot.currency)}
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
            {showPortfolio && lot.portfolioName && (
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide mb-2">
                {lot.portfolioName}
              </p>
            )}

            {/* Stats - 3 column compact */}
            <div className="grid grid-cols-3 gap-2 text-xs">
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
              <div>
                <span className="text-muted-foreground/70 block">Aktuální</span>
                <span className="font-mono-price">
                  {formatPrice(lot.currentPriceScaled, lot.currency)}
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

  const renderSortableHeader = (
    label: string,
    columnKey: SortKey,
    className = '',
  ) => (
    <TableHead
      className={`text-xs uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none ${className}`}
      onClick={() => handleSort(columnKey)}
    >
      {label}
      <SortIcon
        sortKey={sortKey}
        columnKey={columnKey}
        sortDirection={sortDirection}
      />
    </TableHead>
  );

  if (lots.length === 0) {
    return null;
  }

  return (
    <div className="pb-12">
      {/* Desktop Table */}
      <div className="hidden md:block">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              {renderSortableHeader('Ticker', 'ticker', 'w-[20%]')}
              {renderSortableHeader('Datum', 'date', 'w-[14%]')}
              {renderSortableHeader('Počet', 'shares', 'text-right w-[10%]')}
              {renderSortableHeader('Nákup', 'buyPrice', 'text-right w-[14%]')}
              {renderSortableHeader(
                'Aktuální',
                'currentPrice',
                'text-right w-[14%]',
              )}
              {renderSortableHeader('P/L', 'plCzk', 'text-right w-[14%]')}
              {renderSortableHeader('P/L %', 'plPercent', 'text-right w-[14%]')}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedLots.map((lot) => {
              const isPositive = lot.plCzk >= 0;
              return (
                <TableRow
                  key={lot.id}
                  className="cursor-pointer hover:bg-muted/50 border-border"
                  onClick={() => onLotClick?.(lot.ticker)}
                >
                  <TableCell>
                    <div>
                      <span className="font-bold">{lot.ticker}</span>
                      <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {lot.stockName}
                      </p>
                      {showPortfolioColumn && lot.portfolioName && (
                        <p className="text-xs text-muted-foreground/70 truncate max-w-[120px]">
                          {lot.portfolioName}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(lot.date)}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {lot.shares}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {formatPrice(lot.buyPrice, lot.currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {formatPrice(lot.currentPriceScaled, lot.currency)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono-price ${isPositive ? 'text-positive' : 'text-negative'}`}
                  >
                    {formatCurrency(lot.plCzk)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={
                        isPositive
                          ? 'text-positive border-positive/20'
                          : 'text-negative border-negative/20'
                      }
                    >
                      {formatPercent(lot.plPercent, 1, true)}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden">
        {/* Mobile Sort Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-3 mb-2 -mx-4 px-4 scrollbar-hide">
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

        {/* Cards */}
        <div className="space-y-1">
          {displayedLots.map((lot) => (
            <LotCard
              key={lot.id}
              lot={lot}
              showPortfolio={showPortfolioColumn}
              onClick={() => onLotClick?.(lot.ticker)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
