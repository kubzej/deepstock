import { useState, useMemo } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ErrorState, PageBackButton, PageHero } from '@/components/shared';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useStock, useDeleteStock } from '@/hooks/useStocks';
import {
  useTickerTransactions,
  useDeleteTransaction,
} from '@/hooks/useTransactions';
import { useQuotes } from '@/hooks/useQuotes';
import type { Stock, Transaction } from '@/lib/api';
import {
  formatCurrency,
  formatPercent,
  formatPrice,
  formatDate,
  formatDateCzech,
  toCZK,
} from '@/lib/format';
import { TransactionModal } from '@/components/transactions';
import { StockFormDialog } from './StockFormDialog';
import { InsiderTrades } from './InsiderTrades';
import {
  SymbolOverview,
  isTradingViewSupported,
} from '@/components/shared/TradingViewWidgets';

export function StockDetail() {
  const { ticker } = useParams({ from: '/stocks/$ticker' });
  const navigate = useNavigate();
  const onBack = () => navigate({ to: '/stocks' });
  const {
    portfolio,
    getHoldingByTicker,
    quotes: portfolioQuotes,
    rates,
    loading: portfolioLoading,
    isAllPortfolios,
  } = usePortfolio();

  // Stock master data from API (React Query)
  const {
    data: stock,
    isLoading: stockLoading,
    error: stockError,
  } = useStock(ticker);

  // Transactions (React Query)
  const { data: transactions = [], isLoading: transactionsLoading } =
    useTickerTransactions(portfolio?.id ?? null, ticker, isAllPortfolios);

  // Quote from React Query (if not in portfolio context)
  const tickersToFetch = portfolioQuotes[ticker] ? [] : [ticker];
  const { data: fetchedQuotes = {}, isLoading: quoteLoading } =
    useQuotes(tickersToFetch);

  // Transaction delete mutation
  const deleteTransactionMutation = useDeleteTransaction();

  // Stock edit/delete state
  const [editStock, setEditStock] = useState<Stock | null>(null);
  const [deleteStockOpen, setDeleteStockOpen] = useState(false);
  const deleteStockMutation = useDeleteStock();

  // Transaction edit/delete state
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] =
    useState<Transaction | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [visibleTxCount, setVisibleTxCount] = useState(6);
  const [transactionFilter, setTransactionFilter] = useState<'active' | 'all'>(
    'active',
  );

  // Get optional holding (position) from portfolio
  const holding = getHoldingByTicker(ticker);
  // Use portfolio quote if available, otherwise fetched quote
  const quote = portfolioQuotes[ticker] || fetchedQuotes[ticker];

  // Assign lot numbers to BUY transactions (#1, #2, ...)
  const lotNumbers = useMemo(() => {
    const map = new Map<string, number>();
    let n = 1;
    // Oldest first = highest lot number first in the sorted list
    [...transactions].reverse().forEach((tx) => {
      if (tx.type === 'BUY') {
        map.set(tx.id, n++);
      }
    });
    return map;
  }, [transactions]);

  const hasActiveTransactions = useMemo(
    () =>
      transactions.some(
        (tx) =>
          tx.type === 'BUY' &&
          tx.remainingShares !== null &&
          tx.remainingShares > 0.0001,
      ),
    [transactions],
  );

  const effectiveTransactionFilter =
    transactionFilter === 'active' && !hasActiveTransactions
      ? 'all'
      : transactionFilter;

  const filteredTransactions = useMemo(() => {
    if (effectiveTransactionFilter === 'all') {
      return transactions;
    }

    return transactions.filter(
      (tx) =>
        tx.type === 'BUY' &&
        tx.remainingShares !== null &&
        tx.remainingShares > 0.0001,
    );
  }, [effectiveTransactionFilter, transactions]);

  const activeTransactionCount = useMemo(
    () =>
      transactions.filter(
        (tx) =>
          tx.type === 'BUY' &&
          tx.remainingShares !== null &&
          tx.remainingShares > 0.0001,
      ).length,
    [transactions],
  );

  // Helper to get lot status for BUY transactions
  const getLotStatus = (tx: Transaction) => {
    const remaining = tx.remainingShares!;
    const sold = tx.shares - remaining;
    return {
      sold,
      remaining,
      isFullySold: remaining <= 0.0001,
    };
  };

  // Handle transaction delete
  const handleDeleteTransaction = async () => {
    if (!deletingTransaction) return;

    setDeleteError(null);

    try {
      await deleteTransactionMutation.mutateAsync({
        portfolioId: deletingTransaction.portfolioId,
        transactionId: deletingTransaction.id,
      });
      setDeletingTransaction(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Nepodařilo se smazat transakci',
      );
    }
  };

  const isLoading = stockLoading || portfolioLoading || quoteLoading;
  const deleteLoading = deleteTransactionMutation.isPending;

  // Loading state
  if (isLoading) {
    return (
      <div className="pb-24 md:pb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Zpět
        </Button>
        <div className="space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-12 w-40" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  // Error state
  if (stockError || !stock) {
    return (
      <div className="pb-24 md:pb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Zpět
        </Button>
        <ErrorState
          title="Akcii se nepodařilo načíst"
          description={stockError?.message || 'Akcie nebyla nalezena.'}
        />
      </div>
    );
  }

  // Stock info from master data
  const stockName = stock.name;
  const stockCurrency = stock.currency || 'USD';
  const stockSector = stock.sector;
  const priceScale = stock.price_scale ?? 1;

  // Price info from quotes
  const currentPrice = (quote?.price ?? 0) * priceScale;
  const dailyChange = (quote?.change ?? 0) * priceScale;
  const dailyChangePercent = quote?.changePercent ?? 0;

  // Position metrics (only if holding exists)
  const hasPosition = !!holding && holding.shares > 0;
  const position = hasPosition
    ? {
        shares: holding.shares,
        avgCost: holding.avg_cost,
        totalCost: holding.avg_cost * holding.shares,
        totalValue: currentPrice * holding.shares,
        unrealizedPnL:
          currentPrice * holding.shares - holding.avg_cost * holding.shares,
        unrealizedPnLPercent:
          holding.avg_cost > 0
            ? ((currentPrice - holding.avg_cost) / holding.avg_cost) * 100
            : 0,
      }
    : null;

  // CZK conversions for position
  const positionCzk = position
    ? (() => {
        const totalCost = holding!.total_invested_czk;
        const totalValue = toCZK(position.totalValue, stockCurrency, rates);
        return {
          totalCost,
          totalValue,
          unrealizedPnL: totalValue - totalCost,
        };
      })()
    : null;

  return (
    <div className="pb-24 md:pb-6 space-y-6">
      <PageBackButton onClick={onBack} />

      <PageHero
        title={
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-3xl font-bold uppercase tracking-tight md:text-4xl">
                {ticker}
              </h1>
              <span className="text-base text-muted-foreground md:text-lg">
                {stockName}
              </span>
            </div>
            {currentPrice > 0 ? (
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                <span className="text-4xl font-bold font-mono-price md:text-5xl">
                  {formatPrice(currentPrice, stockCurrency)}
                </span>
                <span
                  className={`flex items-center gap-1 font-mono-price text-base md:text-lg ${
                    dailyChange >= 0 ? 'text-positive' : 'text-negative'
                  }`}
                >
                  {dailyChange >= 0 ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  {formatPrice(Math.abs(dailyChange), stockCurrency)} (
                  {formatPercent(dailyChangePercent, 2, true)})
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Cena není k dispozici
              </p>
            )}
          </div>
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => stock && setEditStock(stock)}
            >
              <Pencil className="mr-1 h-4 w-4" />
              Upravit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/20 text-destructive hover:bg-destructive/8 hover:text-destructive"
              onClick={() => setDeleteStockOpen(true)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Smazat
            </Button>
          </div>
        }
        meta={
          <>
            <Badge variant="outline" className="font-normal">
              Sektor: {stockSector || '—'}
            </Badge>
            <Badge variant="outline" className="font-normal">
              Burza: {stock.exchange || '—'}
            </Badge>
            <Badge variant="outline" className="font-normal">
              Měna: {stockCurrency}
            </Badge>
            {quote?.earningsDate && (
              <Badge variant="outline" className="font-normal">
                Earnings: {formatDateCzech(quote.earningsDate)}
              </Badge>
            )}
          </>
        }
      >
        {position && positionCzk ? (
          <div className="grid max-w-5xl gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Počet akcií
              </p>
              <p className="text-lg font-mono-price font-semibold">
                {position.shares}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Průměrná cena
              </p>
              <p className="text-lg font-mono-price font-semibold">
                {formatPrice(position.avgCost, stockCurrency)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Investováno
              </p>
              <p className="text-lg font-mono-price font-semibold">
                {formatCurrency(positionCzk.totalCost)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Aktuální hodnota
              </p>
              <p className="text-lg font-mono-price font-semibold">
                {formatCurrency(positionCzk.totalValue)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Nerealizovaný P/L
              </p>
              <p
                className={`text-lg font-mono-price font-semibold ${
                  positionCzk.unrealizedPnL >= 0
                    ? 'text-positive'
                    : 'text-negative'
                }`}
              >
                {formatCurrency(positionCzk.unrealizedPnL)}
              </p>
              <p
                className={`text-[11px] font-mono-price ${
                  positionCzk.unrealizedPnL >= 0
                    ? 'text-positive/70'
                    : 'text-negative/70'
                }`}
              >
                {formatPercent(
                  positionCzk.totalCost > 0
                    ? (positionCzk.unrealizedPnL / positionCzk.totalCost) * 100
                    : 0,
                  2,
                  true,
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            Nemáte otevřenou pozici v této akcii
          </div>
        )}
      </PageHero>

      {/* Price Chart - only for supported exchanges */}
      {isTradingViewSupported(ticker, stock.exchange || undefined) && (
        <section className="space-y-3">
          <div>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Vývoj ceny
            </h2>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-2">
            <SymbolOverview
              symbol={ticker}
              exchange={stock.exchange || undefined}
              height={350}
            />
          </div>
        </section>
      )}

      {/* Transactions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Transakce ({transactions.length})
          </h2>
        </div>

        <ToggleGroup
          type="single"
          value={effectiveTransactionFilter}
          onValueChange={(value) => {
            if (value === 'active' || value === 'all') {
              setTransactionFilter(value);
              setVisibleTxCount(6);
            }
          }}
          variant="segmented"
          size="sm"
          className="w-fit"
        >
          <ToggleGroupItem value="active" disabled={!hasActiveTransactions}>
            Aktivní ({activeTransactionCount})
          </ToggleGroupItem>
          <ToggleGroupItem value="all">Vše ({transactions.length})</ToggleGroupItem>
        </ToggleGroup>

        {transactionsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Žádné transakce</p>
        ) : (
          <>
            <div className="space-y-2">
              {filteredTransactions.slice(0, visibleTxCount).map((tx) => {
                const isBuy = tx.type === 'BUY';
                const lotStatus = isBuy ? getLotStatus(tx) : null;

                let pnl: number | null = null;
                let pnlPercent: number | null = null;
                let pnlCzk: number | null = null;

                if (
                  !isBuy &&
                  tx.realizedPnl !== null &&
                  tx.realizedPnl !== undefined
                ) {
                  pnl = tx.realizedPnl;
                  pnlCzk = tx.realizedPnlCzk;
                  const costBasisSold = tx.costBasisSold!;
                  pnlPercent =
                    costBasisSold > 0 ? (pnl / costBasisSold) * 100 : 0;
                }

                if (
                  isBuy &&
                  lotStatus &&
                  lotStatus.remaining > 0 &&
                  tx.remainingCostBasis !== null &&
                  tx.remainingCostBasisCzk !== null &&
                  quote?.price
                ) {
                  const currentPriceScaled = quote.price * priceScale;
                  const remainingCostBasis = tx.remainingCostBasis;
                  pnl =
                    currentPriceScaled * lotStatus.remaining -
                    remainingCostBasis;
                  pnlPercent =
                    remainingCostBasis > 0
                      ? (pnl / remainingCostBasis) * 100
                      : 0;
                  const costBasisCzk = tx.remainingCostBasisCzk;
                  const currentValueCzk = toCZK(
                    currentPriceScaled * lotStatus.remaining,
                    tx.currency,
                    rates,
                  );
                  pnlCzk = currentValueCzk - costBasisCzk;
                }

                const lotNum = isBuy
                  ? lotNumbers.get(tx.id)
                  : tx.sourceTransactionId
                    ? lotNumbers.get(tx.sourceTransactionId)
                    : undefined;

                let lotInfo: string | null = null;
                if (isBuy && lotStatus) {
                  if (lotStatus.isFullySold) {
                    lotInfo = `prodáno ${lotStatus.sold}/${tx.shares}`;
                  } else if (lotStatus.sold > 0) {
                    lotInfo = `zbývá ${lotStatus.remaining}/${tx.shares}`;
                  }
                } else if (!isBuy && tx.sourceTransaction) {
                  lotInfo = `z lotu #${lotNum ?? '?'} (${formatPrice(tx.sourceTransaction.price, tx.sourceTransaction.currency)})`;
                }

                const isClosed =
                  (isBuy && lotStatus?.isFullySold) || !isBuy;
                const isActiveLot =
                  isBuy && !!lotStatus && lotStatus.remaining > 0;
                const primaryAmount =
                  isActiveLot
                    ? formatCurrency(tx.remainingCostBasisCzk)
                    : pnlCzk !== null
                      ? formatCurrency(pnlCzk)
                      : formatCurrency(tx.totalCzk);
                const secondaryAmount =
                  pnlCzk !== null
                    ? formatPercent(pnlPercent!, 1, true)
                    : null;
                const secondaryAmountTone =
                  pnlCzk !== null
                    ? pnlPercent! >= 0
                      ? 'text-positive/70'
                      : 'text-negative/70'
                    : 'text-muted-foreground';
                const primaryAmountTone =
                  isActiveLot
                    ? 'text-foreground'
                    : pnlCzk !== null
                      ? pnlCzk >= 0
                        ? 'text-positive'
                        : 'text-negative'
                      : 'text-foreground';
                const transactionLabel = isBuy ? 'NÁKUP' : 'PRODEJ';
                const quantityLabel =
                  isActiveLot
                    ? `${lotStatus.remaining} ks`
                    : `${tx.shares} ks`;
                const priceLabel = formatPrice(tx.price, tx.currency);
                const currentPriceLabel =
                  isActiveLot && quote?.price
                    ? formatPrice(quote.price * priceScale, tx.currency)
                    : null;
                const secondaryMeta = [
                  lotInfo,
                  tx.feeCzk != null && tx.feeCzk > 0
                    ? `Poplatky ${formatCurrency(tx.feeCzk)}`
                    : null,
                ].filter(Boolean) as string[];

                return (
                  <div
                    key={tx.id}
                    className={`rounded-xl border px-4 py-3 transition-colors ${
                      isActiveLot
                        ? 'border-border/70 bg-muted/18 hover:bg-muted/24'
                        : isClosed
                          ? 'border-border/35 bg-muted/6 opacity-60'
                          : 'border-border/70 bg-muted/18 hover:bg-muted/24'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-6">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={`h-[20px] px-1.5 py-0 text-[10px] font-medium ${
                              isBuy
                                ? 'border-positive/25 bg-positive/8 text-positive'
                                : 'border-negative/25 bg-negative/8 text-negative'
                            }`}
                          >
                            {transactionLabel}
                          </Badge>
                          {lotNum && (
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono-price text-muted-foreground">
                              #{lotNum}
                            </span>
                          )}
                          {isActiveLot && (
                            <span className="inline-flex h-2 w-2 rounded-full bg-positive" />
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            {formatDateCzech(tx.date)}
                          </span>
                          {isAllPortfolios && tx.portfolioName && (
                            <span className="text-[11px] text-muted-foreground">
                              {tx.portfolioName}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-sm font-medium text-foreground">
                            {quantityLabel} × {priceLabel}
                            {currentPriceLabel && (
                              <span className="ml-1.5 text-foreground/80">
                                → {currentPriceLabel}
                              </span>
                            )}
                          </span>
                        </div>

                        {secondaryMeta.length > 0 && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            {secondaryMeta.map((item) => (
                              <span key={item} className="font-mono-price">
                                {item}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <div className="text-right">
                          <div
                            className={`font-mono-price text-sm font-semibold ${primaryAmountTone}`}
                          >
                            {pnlCzk !== null &&
                            !(isBuy && lotStatus && lotStatus.remaining > 0) &&
                            pnlCzk > 0
                              ? '+'
                              : ''}
                            {primaryAmount}
                          </div>
                          {secondaryAmount && (
                            <div
                              className={`text-[10px] font-mono-price ${secondaryAmountTone}`}
                            >
                              {secondaryAmount}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => setEditingTransaction(tx)}
                            title="Upravit transakci"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingTransaction(tx)}
                            title="Smazat transakci"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {visibleTxCount < filteredTransactions.length && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 w-full text-xs text-muted-foreground"
                onClick={() =>
                  setVisibleTxCount((prev) =>
                    Math.min(prev + 10, filteredTransactions.length),
                  )
                }
              >
                Zobrazit dalších{' '}
                {Math.min(10, filteredTransactions.length - visibleTxCount)}
              </Button>
            )}
          </>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Insider obchody
          </h2>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/70 p-3 md:p-4">
          <InsiderTrades ticker={ticker} />
        </div>
      </section>

      {/* Stock Edit Dialog */}
      <StockFormDialog
        stock={editStock}
        open={!!editStock}
        onOpenChange={(open) => !open && setEditStock(null)}
        onSuccess={() => setEditStock(null)}
      />

      {/* Stock Delete Confirmation */}
      <Dialog open={deleteStockOpen} onOpenChange={setDeleteStockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat {ticker}?</DialogTitle>
            <DialogDescription>
              Tato akce je nevratná. Smazáním akcie smažete i všechny transakce
              a holdings s ní spojené.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteStockOpen(false)}
              disabled={deleteStockMutation.isPending}
            >
              Zrušit
            </Button>
            <Button
              variant="destructive"
              disabled={deleteStockMutation.isPending}
              onClick={() => {
                if (!stock) return;
                deleteStockMutation.mutate(stock.id, {
                  onSuccess: () => {
                    setDeleteStockOpen(false);
                    onBack();
                  },
                });
              }}
            >
              {deleteStockMutation.isPending ? 'Mažu...' : 'Smazat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Edit Modal */}
      <TransactionModal
        open={!!editingTransaction}
        onOpenChange={(open) => !open && setEditingTransaction(null)}
        editTransaction={editingTransaction}
      />

      {/* Transaction Delete Confirmation */}
      <Dialog
        open={!!deletingTransaction}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingTransaction(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat transakci?</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat{' '}
              {deletingTransaction?.type === 'BUY' ? 'nákup' : 'prodej'}{' '}
              {deletingTransaction?.shares} ks {deletingTransaction?.ticker} ze
              dne {deletingTransaction && formatDate(deletingTransaction.date)}?
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeletingTransaction(null)}
              disabled={deleteLoading}
            >
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTransaction}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Mažu...' : 'Smazat'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
