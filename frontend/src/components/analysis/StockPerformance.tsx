/**
 * Stock Performance Section
 */
import { useMemo, useState } from 'react';
import { Metric } from './Metric';
import { Badge } from '@/components/ui/badge';
import { PillButton } from '@/components/shared/PillButton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { formatDate, formatPrice, formatShares } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ClosedStockTrade, StockPerformanceData } from './utils';

interface StockPerformanceProps {
  data: StockPerformanceData;
}

type SortKey =
  | 'ticker'
  | 'buyDate'
  | 'sellDate'
  | 'shares'
  | 'buyPrice'
  | 'sellPrice'
  | 'plAmount'
  | 'plPercent';
type SortDirection = 'asc' | 'desc';

interface PortfolioAggregateRow {
  portfolioName: string;
  shares: number;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  realizedPLCzk: number;
  realizedPLPct: number;
  currency: string;
  tradesCount: number;
}

type DisplayRow = {
  kind: 'trade' | 'group';
  id: string;
  ticker: string;
  stockName: string;
  portfolioName?: string;
  shares: number;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  realizedPLCzk: number;
  realizedPLPct: number;
  currency: string;
  portfolioCount: number;
  tradesCount: number;
  portfolioRows: PortfolioAggregateRow[];
};

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

export function StockPerformance({ data }: StockPerformanceProps) {
  const [sortKey, setSortKey] = useState<SortKey>('sellDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const aggregateTrades = (
    trades: ClosedStockTrade[],
  ): Omit<DisplayRow, 'kind' | 'id' | 'portfolioCount' | 'portfolioRows'> => {
    const totalShares = trades.reduce((sum, t) => sum + t.shares, 0);
    const totalCostBasis = trades.reduce((sum, t) => sum + t.costBasisCzk, 0);
    const totalPL = trades.reduce((sum, t) => sum + t.realizedPLCzk, 0);

    const buyPriceWeighted =
      totalShares > 0
        ? trades.reduce((sum, t) => sum + t.buyPrice * t.shares, 0) /
          totalShares
        : 0;
    const sellPriceWeighted =
      totalShares > 0
        ? trades.reduce((sum, t) => sum + t.sellPrice * t.shares, 0) /
          totalShares
        : 0;

    const buyDateTs = Math.min(
      ...trades.map((t) => new Date(t.buyDate).getTime()),
    );
    const sellDateTs = Math.max(
      ...trades.map((t) => new Date(t.sellDate).getTime()),
    );

    return {
      ticker: trades[0]?.ticker ?? '—',
      stockName: trades[0]?.stockName ?? '',
      portfolioName: trades[0]?.portfolioName,
      shares: totalShares,
      buyDate: new Date(buyDateTs).toISOString(),
      sellDate: new Date(sellDateTs).toISOString(),
      buyPrice: buyPriceWeighted,
      sellPrice: sellPriceWeighted,
      realizedPLCzk: totalPL,
      realizedPLPct: totalCostBasis > 0 ? (totalPL / totalCostBasis) * 100 : 0,
      currency: trades[0]?.currency ?? 'USD',
      tradesCount: trades.length,
    };
  };

  const sortedRows = useMemo(() => {
    const byTicker = new Map<string, ClosedStockTrade[]>();

    for (const trade of data.closedTrades) {
      const existing = byTicker.get(trade.ticker) || [];
      existing.push(trade);
      byTicker.set(trade.ticker, existing);
    }

    const rows: DisplayRow[] = [];

    for (const [ticker, tickerTrades] of byTicker) {
      const portfolioMap = new Map<string, ClosedStockTrade[]>();

      for (const trade of tickerTrades) {
        const key = trade.portfolioName || 'Portfolio';
        const existing = portfolioMap.get(key) || [];
        existing.push(trade);
        portfolioMap.set(key, existing);
      }

      const portfolioCount = portfolioMap.size;

      if (portfolioCount > 1) {
        const tickerAgg = aggregateTrades(tickerTrades);
        const portfolioRows: PortfolioAggregateRow[] = Array.from(
          portfolioMap.entries(),
        ).map(([portfolioName, portfolioTrades]) => {
          const agg = aggregateTrades(portfolioTrades);

          return {
            portfolioName,
            shares: agg.shares,
            buyDate: agg.buyDate,
            sellDate: agg.sellDate,
            buyPrice: agg.buyPrice,
            sellPrice: agg.sellPrice,
            realizedPLCzk: agg.realizedPLCzk,
            realizedPLPct: agg.realizedPLPct,
            currency: agg.currency,
            tradesCount: agg.tradesCount,
          };
        });

        rows.push({
          ...tickerAgg,
          kind: 'group',
          id: `group-${ticker}`,
          portfolioCount,
          portfolioRows,
        });
      } else {
        for (const trade of tickerTrades) {
          rows.push({
            kind: 'trade',
            id: trade.id,
            ticker: trade.ticker,
            stockName: trade.stockName,
            portfolioName: trade.portfolioName,
            shares: trade.shares,
            buyDate: trade.buyDate,
            sellDate: trade.sellDate,
            buyPrice: trade.buyPrice,
            sellPrice: trade.sellPrice,
            realizedPLCzk: trade.realizedPLCzk,
            realizedPLPct: trade.realizedPLPct,
            currency: trade.currency,
            portfolioCount: 1,
            tradesCount: 1,
            portfolioRows: [],
          });
        }
      }
    }

    return rows.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortKey) {
        case 'ticker':
          aVal = a.ticker;
          bVal = b.ticker;
          break;
        case 'buyDate':
          aVal = new Date(a.buyDate).getTime();
          bVal = new Date(b.buyDate).getTime();
          break;
        case 'sellDate':
          aVal = new Date(a.sellDate).getTime();
          bVal = new Date(b.sellDate).getTime();
          break;
        case 'shares':
          aVal = a.shares;
          bVal = b.shares;
          break;
        case 'buyPrice':
          aVal = a.buyPrice;
          bVal = b.buyPrice;
          break;
        case 'sellPrice':
          aVal = a.sellPrice;
          bVal = b.sellPrice;
          break;
        case 'plAmount':
          aVal = a.realizedPLCzk;
          bVal = b.realizedPLCzk;
          break;
        case 'plPercent':
          aVal = a.realizedPLPct;
          bVal = b.realizedPLPct;
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
  }, [data.closedTrades, sortDirection, sortKey]);

  const hasGroupedRows = useMemo(
    () => sortedRows.some((row) => row.kind === 'group'),
    [sortedRows],
  );

  const toggleExpand = (rowKey: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortKey(key);
    setSortDirection(key === 'ticker' ? 'asc' : 'desc');
  };

  const renderSortableHeader = (
    label: string,
    columnKey: SortKey,
    className = '',
  ) => (
    <TableHead
      className={cn(
        'text-xs uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none',
        className,
      )}
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
        <Metric label="Nakoupeno" value={data.totalBought} colored={false} />
        <Metric label="Prodáno" value={data.totalSold} colored={false} />
        <Metric label="Čistý cashflow" value={data.netCashflow} />
        <Metric label="Realizovaný P/L" value={data.realizedPL} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
        <Metric label="Průměr na obchod" value={data.avgPerTrade} />
        <Metric label="Největší zisk" value={data.biggestWin} />
        <Metric label="Největší ztráta" value={data.biggestLoss} />
        <Metric label="Win rate" value={data.winRate} format="percent" />
      </div>

      <p className="text-sm text-muted-foreground">
        Celkem {data.totalTrades} uzavřených obchodů ({data.winningTrades}{' '}
        ziskových, {data.losingTrades} ztrátových)
      </p>

      <div className="space-y-3">
        {data.closedTrades.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            V tomto období nejsou žádné uzavřené obchody.
          </p>
        ) : (
          <div className="space-y-3">
            {hasGroupedRows && (
              <p className="text-xs text-muted-foreground">
                Tickery ve více portfoliích jsou seskupené. Rozbalíte kliknutím.
              </p>
            )}

            {/* Mobile sort pills */}
            <div className="md:hidden flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {[
                { key: 'plAmount' as SortKey, label: 'P/L' },
                { key: 'plPercent' as SortKey, label: '%' },
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

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border">
                    {renderSortableHeader('Akcie', 'ticker', 'w-[180px]')}
                    {renderSortableHeader('Nákup', 'buyDate', 'w-[95px]')}
                    {renderSortableHeader('Prodej', 'sellDate', 'w-[95px]')}
                    {renderSortableHeader(
                      'Počet',
                      'shares',
                      'text-right w-[70px]',
                    )}
                    {renderSortableHeader(
                      'Nákupní cena',
                      'buyPrice',
                      'text-right w-[130px]',
                    )}
                    {renderSortableHeader(
                      'Prodejní cena',
                      'sellPrice',
                      'text-right w-[130px]',
                    )}
                    {renderSortableHeader(
                      'P/L',
                      'plAmount',
                      'text-right w-[130px]',
                    )}
                    {renderSortableHeader(
                      '%',
                      'plPercent',
                      'text-right w-[110px]',
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.flatMap((row) => {
                    const isPositive = row.realizedPLCzk >= 0;
                    const isExpandable = row.kind === 'group';
                    const isExpanded = expandedRows.has(row.id);

                    const mainRow = (
                      <TableRow
                        key={row.id}
                        className={cn(
                          'border-border hover:bg-muted/50',
                          isExpandable && 'cursor-pointer',
                        )}
                        onClick={() => {
                          if (isExpandable) {
                            toggleExpand(row.id);
                          }
                        }}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isExpandable && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(row.id);
                                }}
                                className="p-0.5 hover:bg-muted rounded"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                            )}

                            <div className="flex flex-col min-w-0">
                              <span className="font-bold">
                                {row.ticker}
                                {isExpandable && (
                                  <span className="ml-1.5 text-xs text-muted-foreground">
                                    ({row.portfolioCount})
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground truncate max-w-[170px]">
                                {row.kind === 'trade' && row.portfolioName
                                  ? `${row.stockName} • ${row.portfolioName}`
                                  : row.stockName}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono-price text-muted-foreground">
                          {formatDate(row.buyDate)}
                        </TableCell>
                        <TableCell className="font-mono-price text-muted-foreground">
                          {formatDate(row.sellDate)}
                        </TableCell>
                        <TableCell className="text-right font-mono-price">
                          {formatShares(row.shares)}
                        </TableCell>
                        <TableCell className="text-right font-mono-price">
                          {formatPrice(row.buyPrice, row.currency)}
                        </TableCell>
                        <TableCell className="text-right font-mono-price">
                          {formatPrice(row.sellPrice, row.currency)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono-price font-medium',
                            isPositive ? 'text-positive' : 'text-negative',
                          )}
                        >
                          {formatPrice(row.realizedPLCzk, 'CZK')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <Badge
                              variant="outline"
                              className={cn(
                                isPositive
                                  ? 'text-positive border-positive/20'
                                  : 'text-negative border-negative/20',
                              )}
                            >
                              {row.realizedPLPct > 0 ? '+' : ''}
                              {row.realizedPLPct.toFixed(2)}%
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    );

                    if (!isExpandable || !isExpanded) {
                      return [mainRow];
                    }

                    const subRows = row.portfolioRows.map((portfolioRow) => {
                      const subPositive = portfolioRow.realizedPLCzk >= 0;
                      const subKey = `${row.id}-${portfolioRow.portfolioName}`;

                      return (
                        <TableRow
                          key={subKey}
                          className="border-border bg-muted/20 hover:bg-muted/40"
                        >
                          <TableCell>
                            <div className="pl-8 text-sm text-muted-foreground">
                              {portfolioRow.portfolioName}
                              <span className="ml-1 text-xs">
                                ({portfolioRow.tradesCount} obchodů)
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono-price text-muted-foreground">
                            {formatDate(portfolioRow.buyDate)}
                          </TableCell>
                          <TableCell className="font-mono-price text-muted-foreground">
                            {formatDate(portfolioRow.sellDate)}
                          </TableCell>
                          <TableCell className="text-right font-mono-price">
                            {formatShares(portfolioRow.shares)}
                          </TableCell>
                          <TableCell className="text-right font-mono-price">
                            {formatPrice(
                              portfolioRow.buyPrice,
                              portfolioRow.currency,
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono-price">
                            {formatPrice(
                              portfolioRow.sellPrice,
                              portfolioRow.currency,
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-mono-price font-medium',
                              subPositive ? 'text-positive' : 'text-negative',
                            )}
                          >
                            {formatPrice(portfolioRow.realizedPLCzk, 'CZK')}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end">
                              <Badge
                                variant="outline"
                                className={cn(
                                  subPositive
                                    ? 'text-positive border-positive/20'
                                    : 'text-negative border-negative/20',
                                )}
                              >
                                {portfolioRow.realizedPLPct > 0 ? '+' : ''}
                                {portfolioRow.realizedPLPct.toFixed(2)}%
                              </Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    });

                    return [mainRow, ...subRows];
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-1">
              {sortedRows.map((row) => {
                const isPositive = row.realizedPLCzk >= 0;
                const isExpandable = row.kind === 'group';
                const isExpanded = expandedRows.has(row.id);

                return (
                  <div
                    key={row.id}
                    onClick={() => toggleExpand(row.id)}
                    className="bg-muted/30 rounded-xl transition-transform active:scale-[0.99] cursor-pointer"
                  >
                    <div className="px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm leading-tight">
                              {row.ticker}
                            </span>
                            {isExpandable && (
                              <span className="text-[10px] text-muted-foreground">
                                ×{row.portfolioCount}
                              </span>
                            )}
                            <span className="text-[11px] text-muted-foreground truncate">
                              {row.stockName}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-baseline gap-1.5 flex-shrink-0">
                          <span
                            className={cn(
                              'font-mono-price text-sm font-medium',
                              isPositive ? 'text-positive' : 'text-negative',
                            )}
                          >
                            {formatPrice(row.realizedPLCzk, 'CZK')}
                          </span>
                          <span
                            className={cn(
                              'font-mono-price text-[10px]',
                              isPositive
                                ? 'text-positive/60'
                                : 'text-negative/60',
                            )}
                          >
                            {row.realizedPLPct > 0 ? '+' : ''}
                            {row.realizedPLPct.toFixed(2)}%
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground font-mono-price">
                          {formatShares(row.shares)} ks ×{' '}
                          {formatPrice(row.buyPrice, row.currency)}
                        </span>
                        <span className="text-muted-foreground font-mono-price">
                          → {formatPrice(row.sellPrice, row.currency)}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-3 pb-2.5 pt-1 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{formatDate(row.buyDate)}</span>
                          <span>{formatDate(row.sellDate)}</span>
                        </div>

                        {row.kind === 'trade' && row.portfolioName && (
                          <p className="text-[11px] text-muted-foreground/70 truncate">
                            Portfolio: {row.portfolioName}
                          </p>
                        )}

                        {row.portfolioRows.map((portfolioRow) => {
                          const subPositive = portfolioRow.realizedPLCzk >= 0;

                          return (
                            <div
                              key={`${row.id}-${portfolioRow.portfolioName}`}
                              className="rounded-lg bg-background/50 p-2"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">
                                  {portfolioRow.portfolioName}
                                </span>
                                <span className="text-muted-foreground">
                                  {portfolioRow.tradesCount} obchodů
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-1 text-xs">
                                <span className="font-mono-price text-muted-foreground/80">
                                  {formatShares(portfolioRow.shares)} ks •{' '}
                                  {formatPrice(
                                    portfolioRow.buyPrice,
                                    portfolioRow.currency,
                                  )}{' '}
                                  →{' '}
                                  {formatPrice(
                                    portfolioRow.sellPrice,
                                    portfolioRow.currency,
                                  )}
                                </span>
                                <span
                                  className={cn(
                                    'font-mono-price',
                                    subPositive
                                      ? 'text-positive'
                                      : 'text-negative',
                                  )}
                                >
                                  {formatPrice(
                                    portfolioRow.realizedPLCzk,
                                    'CZK',
                                  )}{' '}
                                  ({portfolioRow.realizedPLPct > 0 ? '+' : ''}
                                  {portfolioRow.realizedPLPct.toFixed(2)}%)
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
