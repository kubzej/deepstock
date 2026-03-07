/**
 * Option Performance Section
 */
import { useMemo, useState } from 'react';
import { Metric } from './Metric';
import { PillButton } from '@/components/shared/PillButton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { formatDate, formatPrice, formatShares } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { OptionPerformanceData } from './utils';

interface OptionPerformanceProps {
  data: OptionPerformanceData;
}

type SortKey = 'symbol' | 'date' | 'contracts' | 'plAmount' | 'plPercent';
type SortDirection = 'asc' | 'desc';

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

function formatAction(action: string): string {
  switch (action) {
    case 'STC':
      return 'STC';
    case 'BTC':
      return 'BTC';
    case 'EXPIRATION':
      return 'Expirace';
    case 'ASSIGNMENT':
      return 'Přiřazení';
    case 'EXERCISE':
      return 'Uplatnění';
    default:
      return action;
  }
}

export function OptionPerformance({ data }: OptionPerformanceProps) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const sortedClosedTrades = useMemo(() => {
    return [...data.closedTrades].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortKey) {
        case 'symbol':
          aVal = a.optionSymbol;
          bVal = b.optionSymbol;
          break;
        case 'date':
          aVal = new Date(a.date).getTime();
          bVal = new Date(b.date).getTime();
          break;
        case 'contracts':
          aVal = a.contracts;
          bVal = b.contracts;
          break;
        case 'plAmount':
          aVal = a.realizedPLCzk;
          bVal = b.realizedPLCzk;
          break;
        case 'plPercent':
          if (!a.isPercentMeaningful && !b.isPercentMeaningful) {
            aVal = 0;
            bVal = 0;
          } else if (!a.isPercentMeaningful) {
            return 1;
          } else if (!b.isPercentMeaningful) {
            return -1;
          } else {
            aVal = a.realizedPLPct;
            bVal = b.realizedPLPct;
          }
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortKey(key);
    setSortDirection(key === 'symbol' ? 'asc' : 'desc');
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
      {/* Main Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
        <Metric
          label="Vybrané prémie (Short)"
          value={data.open.premiumReceived}
          colored={false}
        />
        <Metric
          label="Náklady na opce (Long)"
          value={data.open.premiumPaid}
          colored={false}
        />
        <Metric label="Realizovaný P/L" value={data.closed.realizedPL} />
      </div>

      {/* Secondary Metrics (Closing transactions) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 pt-4">
        <Metric
          label="Zpětný odkup (BTC)"
          value={data.closed.premiumPaid}
          colored={false}
        />
        <Metric
          label="Prodej opcí (STC)"
          value={data.closed.premiumReceived}
          colored={false}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Celkem {data.totalTrades} opčních transakcí v období
      </p>

      {data.closedTrades.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          V tomto období nejsou žádné uzavřené opční obchody.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="md:hidden flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {[
              { key: 'plAmount' as SortKey, label: 'P/L' },
              { key: 'plPercent' as SortKey, label: '%' },
              { key: 'symbol' as SortKey, label: 'A-Z' },
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

          <div className="hidden md:block overflow-x-auto">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border">
                  {renderSortableHeader('Opce', 'symbol', 'w-[260px]')}
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground w-[90px]">
                    Akce
                  </TableHead>
                  {renderSortableHeader('Datum', 'date', 'w-[95px]')}
                  {renderSortableHeader(
                    'Kontrakty',
                    'contracts',
                    'text-right w-[90px]',
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
                {sortedClosedTrades.map((trade) => {
                  const isPositive = trade.realizedPLCzk >= 0;

                  return (
                    <TableRow
                      key={trade.id}
                      className="border-border hover:bg-muted/50"
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold truncate max-w-[240px]">
                            {trade.optionSymbol}
                          </span>
                          <span className="text-xs text-muted-foreground truncate max-w-[240px]">
                            {trade.symbol} {trade.optionType.toUpperCase()}{' '}
                            {formatPrice(trade.strikePrice, trade.currency)} •
                            exp {formatDate(trade.expirationDate)}
                          </span>
                          {trade.portfolioName && (
                            <span className="text-[11px] text-muted-foreground/70 truncate max-w-[240px]">
                              {trade.portfolioName}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {formatAction(trade.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono-price text-muted-foreground">
                        {formatDate(trade.date)}
                      </TableCell>
                      <TableCell className="text-right font-mono-price">
                        {formatShares(trade.contracts)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono-price font-medium',
                          isPositive ? 'text-positive' : 'text-negative',
                        )}
                      >
                        {formatPrice(trade.realizedPLCzk, 'CZK')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          {trade.isPercentMeaningful ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                isPositive
                                  ? 'text-positive border-positive/20'
                                  : 'text-negative border-negative/20',
                              )}
                            >
                              {trade.realizedPLPct > 0 ? '+' : ''}
                              {trade.realizedPLPct.toFixed(2)}%
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-muted-foreground border-border"
                            >
                              N/A
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-1">
            {sortedClosedTrades.map((trade) => {
              const isPositive = trade.realizedPLCzk >= 0;

              return (
                <div
                  key={trade.id}
                  className="bg-muted/30 rounded-xl px-3 py-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm leading-tight truncate">
                        {trade.optionSymbol}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {trade.symbol} • {formatAction(trade.action)} •{' '}
                        {formatDate(trade.date)}
                      </p>
                    </div>

                    <div className="flex items-baseline gap-1.5 flex-shrink-0">
                      <span
                        className={cn(
                          'font-mono-price text-sm font-medium',
                          isPositive ? 'text-positive' : 'text-negative',
                        )}
                      >
                        {formatPrice(trade.realizedPLCzk, 'CZK')}
                      </span>
                      <span
                        className={cn(
                          'font-mono-price text-[10px]',
                          trade.isPercentMeaningful
                            ? isPositive
                              ? 'text-positive/60'
                              : 'text-negative/60'
                            : 'text-muted-foreground',
                        )}
                      >
                        {trade.isPercentMeaningful
                          ? `${trade.realizedPLPct > 0 ? '+' : ''}${trade.realizedPLPct.toFixed(2)}%`
                          : 'N/A'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-mono-price">
                      {formatPrice(trade.strikePrice, trade.currency)} • exp{' '}
                      {formatDate(trade.expirationDate)}
                    </span>
                    <span className="text-muted-foreground font-mono-price">
                      {formatShares(trade.contracts)} kontr.
                    </span>
                  </div>

                  {trade.portfolioName && (
                    <p className="text-[11px] text-muted-foreground/70 truncate">
                      {trade.portfolioName}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
