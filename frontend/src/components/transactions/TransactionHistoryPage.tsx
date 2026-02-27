/**
 * Transaction History Page
 *
 * Shows all stock and option transactions with filters.
 * For tax purposes - list of all transactions with filtering.
 */
import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, startOfYear, parseISO, isAfter, isBefore } from 'date-fns';
import { cs } from 'date-fns/locale';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, FileText, DollarSign } from 'lucide-react';
import { usePortfolios } from '@/hooks/usePortfolios';
import {
  useAllTransactions,
  useAllOptionTransactions,
} from '@/hooks/useTransactionHistory';
import { formatPrice } from '@/lib/format';

import type { Transaction, OptionTransaction } from '@/lib/api';

type TabType = 'stocks' | 'options';
type TransactionTypeFilter = 'all' | 'buy' | 'sell';
type OptionTypeFilter = 'all' | 'call' | 'put';

export function TransactionHistoryPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('stocks');

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all');
  const [optionTypeFilter, setOptionTypeFilter] =
    useState<OptionTypeFilter>('all');
  const [portfolioFilter, setPortfolioFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>(
    format(startOfYear(new Date()), 'yyyy-MM-dd'),
  );
  const [dateTo, setDateTo] = useState<string>(
    format(new Date(), 'yyyy-MM-dd'),
  );

  // Data
  const { data: portfolios = [] } = usePortfolios();
  const {
    data: stockTransactions = [],
    isLoading: stocksLoading,
    isFetching: stocksFetching,
    dataUpdatedAt: stocksUpdatedAt,
  } = useAllTransactions();
  const {
    data: optionTransactions = [],
    isLoading: optionsLoading,
    isFetching: optionsFetching,
    dataUpdatedAt: optionsUpdatedAt,
  } = useAllOptionTransactions();

  const isFetching = activeTab === 'stocks' ? stocksFetching : optionsFetching;
  const dataUpdatedAt =
    activeTab === 'stocks' ? stocksUpdatedAt : optionsUpdatedAt;

  // Filter stock transactions
  const filteredStockTransactions = useMemo(() => {
    return stockTransactions.filter((tx: Transaction) => {
      // Search
      if (search) {
        const s = search.toLowerCase();
        if (
          !tx.ticker.toLowerCase().includes(s) &&
          !tx.stockName.toLowerCase().includes(s)
        ) {
          return false;
        }
      }

      // Type filter
      if (typeFilter === 'buy' && tx.type !== 'BUY') return false;
      if (typeFilter === 'sell' && tx.type !== 'SELL') return false;

      // Portfolio filter
      if (portfolioFilter !== 'all' && tx.portfolioId !== portfolioFilter) {
        return false;
      }

      // Date range
      const txDate = parseISO(tx.date);
      if (dateFrom && isBefore(txDate, parseISO(dateFrom))) return false;
      if (dateTo && isAfter(txDate, parseISO(dateTo + 'T23:59:59')))
        return false;

      return true;
    });
  }, [
    stockTransactions,
    search,
    typeFilter,
    portfolioFilter,
    dateFrom,
    dateTo,
  ]);

  // Filter option transactions
  const filteredOptionTransactions = useMemo(() => {
    return optionTransactions.filter((tx: OptionTransaction) => {
      // Search
      if (search) {
        const s = search.toLowerCase();
        if (
          !tx.symbol.toLowerCase().includes(s) &&
          !tx.option_symbol.toLowerCase().includes(s)
        ) {
          return false;
        }
      }

      // Type filter (buy/sell based on action)
      if (typeFilter !== 'all') {
        const isBuy = tx.action === 'BTO' || tx.action === 'BTC';
        if (typeFilter === 'buy' && !isBuy) return false;
        if (typeFilter === 'sell' && isBuy) return false;
      }

      // Option type filter (call/put)
      if (optionTypeFilter === 'call' && tx.option_type !== 'call')
        return false;
      if (optionTypeFilter === 'put' && tx.option_type !== 'put') return false;

      // Portfolio filter
      if (portfolioFilter !== 'all' && tx.portfolio_id !== portfolioFilter) {
        return false;
      }

      // Date range
      const txDate = parseISO(tx.date);
      if (dateFrom && isBefore(txDate, parseISO(dateFrom))) return false;
      if (dateTo && isAfter(txDate, parseISO(dateTo + 'T23:59:59')))
        return false;

      return true;
    });
  }, [
    optionTransactions,
    search,
    typeFilter,
    optionTypeFilter,
    portfolioFilter,
    dateFrom,
    dateTo,
  ]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['transactionHistory'] });
    queryClient.invalidateQueries({ queryKey: ['optionTransactionHistory'] });
  };

  // Get portfolio name by ID
  const getPortfolioName = (portfolioId: string) => {
    const portfolio = portfolios.find((p) => p.id === portfolioId);
    return portfolio?.name || '—';
  };

  // Format action for display
  const formatAction = (action: string) => {
    switch (action) {
      case 'BTO':
        return 'Buy to Open';
      case 'STO':
        return 'Sell to Open';
      case 'BTC':
        return 'Buy to Close';
      case 'STC':
        return 'Sell to Close';
      case 'EXPIRATION':
        return 'Expirace';
      case 'ASSIGNMENT':
        return 'Přiřazení';
      case 'EXERCISE':
        return 'Uplatnění';
      default:
        return action;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Historie transakcí"
        onRefresh={handleRefresh}
        isRefreshing={isFetching}
        dataUpdatedAt={dataUpdatedAt}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
        <TabsList>
          <TabsTrigger value="stocks">Akcie</TabsTrigger>
          <TabsTrigger value="options">Opce</TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 mt-4">
          {/* Search */}
          <div className="relative col-span-2 sm:flex-1 sm:min-w-[200px] sm:max-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Hledat ticker nebo název..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Type Filter */}
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as TransactionTypeFilter)}
          >
            <SelectTrigger className="w-full sm:w-[120px]">
              <SelectValue placeholder="Typ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vše</SelectItem>
              <SelectItem value="buy">Nákup</SelectItem>
              <SelectItem value="sell">Prodej</SelectItem>
            </SelectContent>
          </Select>

          {/* Option Type Filter - only for options tab */}
          {activeTab === 'options' && (
            <Select
              value={optionTypeFilter}
              onValueChange={(v) => setOptionTypeFilter(v as OptionTypeFilter)}
            >
              <SelectTrigger className="w-full sm:w-[120px]">
                <SelectValue placeholder="Put/Call" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Vše</SelectItem>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="put">Put</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Portfolio Filter */}
          <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Portfolio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všechna portfolia</SelectItem>
              {portfolios.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground shrink-0">Od</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full sm:w-[140px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground shrink-0">Do</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full sm:w-[140px]"
            />
          </div>
        </div>

        {/* Stock Transactions Table */}
        <TabsContent value="stocks" className="mt-4">
          {stocksLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredStockTransactions.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Žádné transakce k zobrazení"
              description="Zkuste změnit filtry nebo datum."
            />
          ) : (
            <>
              {/* Mobile Cards */}
              <div className="md:hidden space-y-2">
                {filteredStockTransactions.map((tx: Transaction) => (
                  <div
                    key={tx.id}
                    className="border border-border rounded-lg p-3 space-y-2"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold">{tx.ticker}</span>
                        <span className="text-muted-foreground text-sm ml-2">
                          {tx.type === 'BUY' ? 'Nákup' : 'Prodej'}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {format(parseISO(tx.date), 'd. M. yyyy', {
                          locale: cs,
                        })}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {tx.stockName}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {tx.shares} × {formatPrice(tx.price, tx.currency)}
                      </span>
                      <span className="font-mono-price font-medium">
                        {formatPrice(
                          tx.type === 'BUY' ? -tx.totalCzk : tx.totalCzk,
                          'CZK',
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                        Datum
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                        Ticker
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                        Název
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                        Typ
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                        Portfolio
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">
                        Množství
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">
                        Cena
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">
                        Poplatky
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">
                        Celkem CZK
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStockTransactions.map((tx: Transaction) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-muted-foreground">
                          {format(parseISO(tx.date), 'd. M. yyyy', {
                            locale: cs,
                          })}
                        </TableCell>
                        <TableCell className="font-bold">{tx.ticker}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">
                          {tx.stockName}
                        </TableCell>
                        <TableCell>
                          {tx.type === 'BUY' ? 'Nákup' : 'Prodej'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {tx.portfolioName || getPortfolioName(tx.portfolioId)}
                        </TableCell>
                        <TableCell className="text-right font-mono-price">
                          {tx.shares}
                        </TableCell>
                        <TableCell className="text-right font-mono-price">
                          {formatPrice(tx.price, tx.currency)}
                        </TableCell>
                        <TableCell className="text-right font-mono-price text-muted-foreground">
                          {tx.fees ? formatPrice(tx.fees, tx.currency) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono-price">
                          {formatPrice(
                            tx.type === 'BUY' ? -tx.totalCzk : tx.totalCzk,
                            'CZK',
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {/* Summary */}
          {!stocksLoading && filteredStockTransactions.length > 0 && (
            <div className="flex justify-end mt-4 text-sm text-muted-foreground">
              Zobrazeno {filteredStockTransactions.length} transakcí
            </div>
          )}
        </TabsContent>

        {/* Option Transactions Table */}
        <TabsContent value="options" className="mt-4">
          {optionsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredOptionTransactions.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="Žádné opční transakce k zobrazení"
              description="Zkuste změnit filtry nebo datum."
            />
          ) : (
            <>
              {/* Mobile Cards */}
              <div className="md:hidden space-y-2">
                {filteredOptionTransactions.map((tx: OptionTransaction) => {
                  const totalPremium = tx.total_premium || 0;
                  const rate = tx.exchange_rate_to_czk || 1;
                  const fees = tx.fees || 0;
                  const isSell = tx.action === 'STO' || tx.action === 'STC';
                  const totalCzk = isSell
                    ? totalPremium * rate - fees
                    : -(totalPremium * rate) - fees;

                  return (
                    <div
                      key={tx.id}
                      className="border border-border rounded-lg p-3 space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-bold">{tx.symbol}</span>
                          <span className="text-muted-foreground text-sm ml-2">
                            {tx.option_type.toUpperCase()} ${tx.strike_price}
                          </span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {format(parseISO(tx.date), 'd. M. yyyy', {
                            locale: cs,
                          })}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatAction(tx.action)} · Exp:{' '}
                        {format(parseISO(tx.expiration_date), 'd. M. yyyy', {
                          locale: cs,
                        })}
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {tx.contracts}×{' '}
                          {tx.premium
                            ? formatPrice(tx.premium, tx.currency)
                            : '—'}
                        </span>
                        <span className="font-mono-price font-medium">
                          {formatPrice(totalCzk, 'CZK')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                        Datum
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                        Symbol
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                        Typ
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">
                        Strike
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                        Expirace
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                        Akce
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                        Portfolio
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">
                        Kontrakty
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">
                        Premium
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">
                        Poplatky
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">
                        Celkem CZK
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOptionTransactions.map((tx: OptionTransaction) => {
                      // Calculate total in CZK
                      const totalPremium = tx.total_premium || 0;
                      const rate = tx.exchange_rate_to_czk || 1;
                      const fees = tx.fees || 0;
                      const isSell = tx.action === 'STO' || tx.action === 'STC';
                      const totalCzk = isSell
                        ? totalPremium * rate - fees
                        : -(totalPremium * rate) - fees;

                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="text-muted-foreground">
                            {format(parseISO(tx.date), 'd. M. yyyy', {
                              locale: cs,
                            })}
                          </TableCell>
                          <TableCell className="font-bold">
                            {tx.symbol}
                          </TableCell>
                          <TableCell>{tx.option_type.toUpperCase()}</TableCell>
                          <TableCell className="text-right font-mono-price">
                            ${tx.strike_price}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(
                              parseISO(tx.expiration_date),
                              'd. M. yyyy',
                              {
                                locale: cs,
                              },
                            )}
                          </TableCell>
                          <TableCell>{formatAction(tx.action)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {tx.portfolio_name ||
                              getPortfolioName(tx.portfolio_id)}
                          </TableCell>
                          <TableCell className="text-right font-mono-price">
                            {tx.contracts}
                          </TableCell>
                          <TableCell className="text-right font-mono-price">
                            {tx.premium
                              ? formatPrice(tx.premium, tx.currency)
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono-price text-muted-foreground">
                            {tx.fees ? formatPrice(tx.fees, tx.currency) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono-price">
                            {formatPrice(totalCzk, 'CZK')}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {/* Summary */}
          {!optionsLoading && filteredOptionTransactions.length > 0 && (
            <div className="flex justify-end mt-4 text-sm text-muted-foreground">
              Zobrazeno {filteredOptionTransactions.length} transakcí
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
