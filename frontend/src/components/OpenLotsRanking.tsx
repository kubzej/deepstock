import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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

interface OpenLotsRankingProps {
  lots: OpenLot[];
  rates: ExchangeRates;
  maxItems?: number;
  onLotClick?: (ticker: string) => void;
}

export function OpenLotsRanking({
  lots,
  rates,
  maxItems = 10,
  onLotClick,
}: OpenLotsRankingProps) {
  const [sortKey, setSortKey] = useState<SortKey>('plPercent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Calculate P/L for each lot
  const lotsWithPL = useMemo(
    () =>
      lots.map((lot) => {
        const costBasis = lot.buyPrice * lot.shares;
        const currentValue = lot.currentPrice * lot.shares;
        const plAmount = currentValue - costBasis;
        const plPercent = costBasis > 0 ? (plAmount / costBasis) * 100 : 0;

        const costBasisCzk = toCZK(costBasis, lot.currency, rates);
        const currentValueCzk = toCZK(currentValue, lot.currency, rates);
        const plCzk = currentValueCzk - costBasisCzk;

        return { ...lot, plPercent, plCzk, costBasisCzk, currentValueCzk };
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
          aVal = a.currentPrice;
          bVal = b.currentPrice;
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

  const displayedLots = sortedLots.slice(0, maxItems);

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
      className={`text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none ${className}`}
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
    <div>
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
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(lot.date)}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {lot.shares}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    ${formatPrice(lot.buyPrice)}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    ${formatPrice(lot.currentPrice)}
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
      <div className="md:hidden space-y-2">
        {displayedLots.map((lot) => {
          const isPositive = lot.plCzk >= 0;
          return (
            <div
              key={lot.id}
              className="p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50"
              onClick={() => onLotClick?.(lot.ticker)}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-bold">{lot.ticker}</span>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(lot.date)}
                  </p>
                </div>
                <div className="text-right">
                  <div
                    className={`font-mono-price ${isPositive ? 'text-positive' : 'text-negative'}`}
                  >
                    {formatCurrency(lot.plCzk)}
                  </div>
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
                </div>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  {lot.shares} ks × ${formatPrice(lot.buyPrice)}
                </span>
                <span>→ ${formatPrice(lot.currentPrice)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
