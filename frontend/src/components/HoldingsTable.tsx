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
import { StockCard } from '@/components/StockCard';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { Quote, ExchangeRates } from '@/lib/api';
import {
  formatCurrency,
  formatPercent,
  formatPrice,
  formatNumber,
  formatVolumeRatio,
  toCZK,
} from '@/lib/format';

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  currency: string;
  sector?: string;
}

type SortKey =
  | 'ticker'
  | 'shares'
  | 'price'
  | 'dailyChange'
  | 'volume'
  | 'avgCost'
  | 'invested'
  | 'value'
  | 'pl'
  | 'plPercent'
  | 'weight';
type SortDirection = 'asc' | 'desc';

// Sort icon component - defined outside render
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

interface HoldingsTableProps {
  holdings: Holding[];
  quotes: Record<string, Quote>;
  rates: ExchangeRates;
  onRowClick?: (ticker: string) => void;
}

export function HoldingsTable({
  holdings,
  quotes,
  rates,
  onRowClick,
}: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('ticker');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Calculate enriched data for each holding
  const enrichedHoldings = useMemo(() => {
    const totalValue = holdings.reduce((sum, h) => {
      const quote = quotes[h.ticker];
      const currentValue = quote ? quote.price * h.shares : 0;
      return sum + toCZK(currentValue, h.currency, rates);
    }, 0);

    return holdings.map((h) => {
      const quote = quotes[h.ticker];
      const currentPrice = quote?.price ?? 0;
      const currentValue = currentPrice * h.shares;
      const invested = h.avgCost * h.shares;
      const currentValueCzk = toCZK(currentValue, h.currency, rates);
      const investedCzk = toCZK(invested, h.currency, rates);
      const plCzk = currentValueCzk - investedCzk;
      const plPercent = investedCzk > 0 ? (plCzk / investedCzk) * 100 : 0;
      const weight = totalValue > 0 ? (currentValueCzk / totalValue) * 100 : 0;
      const volumeRatio =
        quote?.volume && quote?.avgVolume ? quote.volume / quote.avgVolume : 0;

      return {
        ...h,
        quote,
        currentPrice,
        currentValueCzk,
        investedCzk,
        plCzk,
        plPercent,
        weight,
        volumeRatio,
      };
    });
  }, [holdings, quotes, rates]);

  // Sort the holdings
  const sortedHoldings = useMemo(() => {
    return [...enrichedHoldings].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortKey) {
        case 'ticker':
          aVal = a.ticker;
          bVal = b.ticker;
          break;
        case 'shares':
          aVal = a.shares;
          bVal = b.shares;
          break;
        case 'price':
          aVal = a.currentPrice;
          bVal = b.currentPrice;
          break;
        case 'dailyChange':
          aVal = a.quote?.changePercent ?? -Infinity;
          bVal = b.quote?.changePercent ?? -Infinity;
          break;
        case 'volume':
          aVal = a.volumeRatio;
          bVal = b.volumeRatio;
          break;
        case 'avgCost':
          aVal = a.avgCost;
          bVal = b.avgCost;
          break;
        case 'invested':
          aVal = a.investedCzk;
          bVal = b.investedCzk;
          break;
        case 'value':
          aVal = a.currentValueCzk;
          bVal = b.currentValueCzk;
          break;
        case 'pl':
          aVal = a.plCzk;
          bVal = b.plCzk;
          break;
        case 'plPercent':
          aVal = a.plPercent;
          bVal = b.plPercent;
          break;
        case 'weight':
          aVal = a.weight;
          bVal = b.weight;
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
  }, [enrichedHoldings, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'ticker' ? 'asc' : 'desc');
    }
  };

  // Render sortable header cell
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

  return (
    <div>
      {/* Desktop Table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              {renderSortableHeader('Ticker', 'ticker')}
              {renderSortableHeader('Počet', 'shares', 'text-right')}
              {renderSortableHeader('Cena', 'price', 'text-right')}
              {renderSortableHeader('Denní %', 'dailyChange', 'text-right')}
              {renderSortableHeader('Objem', 'volume', 'text-right')}
              {renderSortableHeader('Prům. cena', 'avgCost', 'text-right')}
              {renderSortableHeader('Investováno', 'invested', 'text-right')}
              {renderSortableHeader('Hodnota', 'value', 'text-right')}
              {renderSortableHeader('P/L', 'pl', 'text-right')}
              {renderSortableHeader('P/L %', 'plPercent', 'text-right')}
              {renderSortableHeader('Váha', 'weight', 'text-right')}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedHoldings.map((holding) => {
              const isPositive = holding.plCzk >= 0;
              const isDayPositive = (holding.quote?.changePercent ?? 0) >= 0;

              return (
                <TableRow
                  key={holding.ticker}
                  className="cursor-pointer hover:bg-muted/50 border-border"
                  onClick={() => onRowClick?.(holding.ticker)}
                >
                  <TableCell>
                    <div>
                      <span className="font-bold">{holding.ticker}</span>
                      <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                        {holding.name}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {formatNumber(holding.shares, 2)}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    ${formatPrice(holding.currentPrice)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={
                        isDayPositive
                          ? 'text-positive border-positive/20'
                          : 'text-negative border-negative/20'
                      }
                    >
                      {formatPercent(holding.quote?.changePercent, 2, true)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono-price text-muted-foreground">
                    {formatVolumeRatio(
                      holding.quote?.volume,
                      holding.quote?.avgVolume,
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    ${formatPrice(holding.avgCost)}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {formatCurrency(holding.investedCzk)}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {formatCurrency(holding.currentValueCzk)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono-price ${isPositive ? 'text-positive' : 'text-negative'}`}
                  >
                    {formatCurrency(holding.plCzk)}
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
                      {formatPercent(holding.plPercent, 1, true)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono-price text-muted-foreground">
                    {formatPercent(holding.weight, 1)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {sortedHoldings.map((holding) => (
          <StockCard
            key={holding.ticker}
            ticker={holding.ticker}
            name={holding.name}
            quote={holding.quote ?? null}
            shares={holding.shares}
            avgCost={holding.avgCost}
            valueCzk={holding.currentValueCzk}
            investedCzk={holding.investedCzk}
            onClick={() => onRowClick?.(holding.ticker)}
          />
        ))}
      </div>
    </div>
  );
}
