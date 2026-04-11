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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState } from '@/components/shared';

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
import { StockJournalTab } from './StockJournalTab';

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
  const [visibleTxCount, setVisibleTxCount] = useState(3);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

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

  // Price info from quotes
  const currentPrice = quote?.price ?? 0;
  const dailyChange = quote?.change ?? 0;
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Zpět
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => stock && setEditStock(stock)}
          >
            <Pencil className="w-4 h-4 mr-1" />
            Upravit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteStockOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Smazat
          </Button>
        </div>
      </div>

      {/* Stock Title */}
      <div className="mb-6">
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-2xl font-bold uppercase tracking-wide">
            {ticker}
          </span>
          <span className="text-muted-foreground">{stockName}</span>
        </div>

        {/* Price */}
        {currentPrice > 0 ? (
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-3xl font-bold font-mono-price">
              {formatPrice(currentPrice, stockCurrency)}
            </span>
            <span
              className={`flex items-center gap-1 font-mono-price ${
                dailyChange >= 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {dailyChange >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {formatPrice(Math.abs(dailyChange), stockCurrency)} (
              {formatPercent(dailyChangePercent, 2, true)})
            </span>
          </div>
        ) : (
          <p className="text-muted-foreground mb-4">Cena není k dispozici</p>
        )}

        {/* Meta Row */}
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Sektor: </span>
            <span>{stockSector || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Burza: </span>
            <span>{stock.exchange || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Měna: </span>
            <span>{stockCurrency}</span>
          </div>
          {quote?.earningsDate && (
            <div>
              <span className="text-muted-foreground">Earnings: </span>
              <span>{formatDateCzech(quote.earningsDate)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="prehled">
        <TabsList className="mb-6">
          <TabsTrigger value="prehled">Přehled</TabsTrigger>
          <TabsTrigger value="poznamky">Poznámky</TabsTrigger>
          <TabsTrigger value="insider">Insider obchody</TabsTrigger>
        </TabsList>

        <TabsContent value="prehled" className="space-y-6">
          {/* Notes */}
          {stock?.notes && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {stock.notes}
            </p>
          )}

          {/* Price Chart - only for supported exchanges */}
          {isTradingViewSupported(ticker, stock.exchange || undefined) && (
            <div>
              <SymbolOverview
                symbol={ticker}
                exchange={stock.exchange || undefined}
                height={350}
              />
            </div>
          )}

          {/* Position Stats */}
          {position && positionCzk && (
            <div>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Vaše pozice
              </h2>
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Počet akcií
                  </p>
                  <p className="text-lg font-mono-price font-semibold">
                    {position.shares}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Průměrná cena
                  </p>
                  <p className="text-lg font-mono-price font-semibold">
                    {formatPrice(position.avgCost, stockCurrency)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Investováno
                  </p>
                  <p className="text-lg font-mono-price font-semibold">
                    {formatCurrency(positionCzk.totalCost)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Aktuální hodnota
                  </p>
                  <p className="text-lg font-mono-price font-semibold">
                    {formatCurrency(positionCzk.totalValue)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
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
                    <span className="text-sm ml-2">
                      (
                      {formatPercent(
                        positionCzk.totalCost > 0
                          ? (positionCzk.unrealizedPnL /
                              positionCzk.totalCost) *
                              100
                          : 0,
                        2,
                        true,
                      )}
                      )
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* No position */}
          {!hasPosition && (
            <div className="py-8 text-center text-muted-foreground border border-dashed border-border rounded-lg">
              Nemáte otevřenou pozici v této akcii
            </div>
          )}

          {/* Transactions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Transakce ({transactions.length})
              </h2>
            </div>

            {transactionsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-muted-foreground text-sm">Žádné transakce</p>
            ) : (
              <>
                <div className="space-y-1">
                  {transactions.slice(0, visibleTxCount).map((tx) => {
                    const isBuy = tx.type === 'BUY';
                    const lotStatus = isBuy ? getLotStatus(tx) : null;

                    let pnl: number | null = null;
                    let pnlPercent: number | null = null;
                    let pnlCzk: number | null = null;

                    // Realized P/L for SELL transactions
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

                    // Unrealized P/L for BUY transactions (open lots)
                    if (
                      isBuy &&
                      lotStatus &&
                      lotStatus.remaining > 0 &&
                      tx.remainingCostBasis !== null &&
                      tx.remainingCostBasisCzk !== null &&
                      quote?.price
                    ) {
                      const priceScale = stock?.price_scale ?? 1;
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

                    // Lot number for BUY, or source lot number for SELL
                    const lotNum = isBuy
                      ? lotNumbers.get(tx.id)
                      : tx.sourceTransactionId
                        ? lotNumbers.get(tx.sourceTransactionId)
                        : undefined;

                    // Lot link description (right side)
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

                    const isExpanded = expandedTxId === tx.id;
                    const isClosed =
                      (isBuy && lotStatus?.isFullySold) || !isBuy;

                    return (
                      <div
                        key={tx.id}
                        className={`group rounded-xl cursor-pointer active:scale-[0.99] transition-transform ${
                          isClosed ? 'bg-muted/15 opacity-50' : 'bg-muted/30'
                        }`}
                        onClick={() =>
                          setExpandedTxId(isExpanded ? null : tx.id)
                        }
                      >
                        <div className="px-3 py-2.5">
                          {/* Header Row */}
                          <div className="flex items-center justify-between">
                            {/* Left: Badge + lot# + date */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 h-[18px] font-medium"
                                >
                                  {isBuy ? 'NÁKUP' : 'PRODEJ'}
                                </Badge>
                                {lotNum && (
                                  <span className="text-[10px] font-mono-price text-muted-foreground">
                                    #{lotNum}
                                  </span>
                                )}
                                <span className="text-[11px] text-muted-foreground">
                                  {formatDateCzech(tx.date)}
                                </span>
                                {isAllPortfolios && tx.portfolioName && (
                                  <span className="text-[11px] text-muted-foreground">
                                    · {tx.portfolioName}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Right: Investment + P/L for BUY, just P/L for SELL */}
                            <div className="flex flex-col items-end flex-shrink-0">
                              {isBuy && lotStatus && lotStatus.remaining > 0 ? (
                                <>
                                  {/* Investment amount */}
                                  <span className="font-mono-price text-sm font-medium">
                                    {formatCurrency(tx.remainingCostBasisCzk)}
                                  </span>
                                  {/* Unrealized P/L */}
                                  {pnlCzk !== null && (
                                    <div className="flex items-baseline gap-1">
                                      <span
                                        className={`font-mono-price text-[11px] ${
                                          pnlCzk >= 0
                                            ? 'text-positive'
                                            : 'text-negative'
                                        }`}
                                      >
                                        {pnlCzk >= 0 ? '+' : ''}
                                        {formatCurrency(pnlCzk)}
                                      </span>
                                      <span
                                        className={`text-[10px] font-mono-price ${
                                          pnlPercent! >= 0
                                            ? 'text-positive/60'
                                            : 'text-negative/60'
                                        }`}
                                      >
                                        {formatPercent(pnlPercent!, 1, true)}
                                      </span>
                                    </div>
                                  )}
                                </>
                              ) : pnlCzk !== null ? (
                                <>
                                  <span
                                    className={`font-mono-price text-sm font-medium ${
                                      pnlCzk >= 0
                                        ? 'text-positive'
                                        : 'text-negative'
                                    }`}
                                  >
                                    {formatCurrency(pnlCzk)}
                                  </span>
                                  <span
                                    className={`text-[10px] font-mono-price ${
                                      pnlPercent! >= 0
                                        ? 'text-positive/60'
                                        : 'text-negative/60'
                                    }`}
                                  >
                                    {formatPercent(pnlPercent!, 1, true)}
                                  </span>
                                </>
                              ) : (
                                <span className="font-mono-price text-sm font-medium">
                                  {formatCurrency(tx.totalCzk)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Subrow: shares × price → current price */}
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[11px] text-muted-foreground font-mono-price">
                              {isBuy && lotStatus && lotStatus.remaining > 0
                                ? `${lotStatus.remaining} ks × ${formatPrice(tx.price, tx.currency)}`
                                : `${tx.shares} ks × ${formatPrice(tx.price, tx.currency)}`}
                              {isBuy &&
                                lotStatus &&
                                lotStatus.remaining > 0 &&
                                quote?.price && (
                                  <span className="ml-1">
                                    →{' '}
                                    {formatPrice(
                                      quote.price * (stock?.price_scale ?? 1),
                                      tx.currency,
                                    )}
                                  </span>
                                )}
                            </span>
                            {lotInfo && (
                              <span className="text-[11px] text-muted-foreground">
                                {lotInfo}
                              </span>
                            )}
                          </div>

                          {/* Expanded Details */}
                          <div
                            className={`grid transition-all duration-200 ease-out ${
                              isExpanded
                                ? 'grid-rows-[1fr] opacity-100 mt-3'
                                : 'grid-rows-[0fr] opacity-0'
                            }`}
                          >
                            <div className="overflow-hidden">
                              {/* Action buttons */}
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs gap-1.5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTransaction(tx);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                  Upravit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingTransaction(tx);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Smazat
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {visibleTxCount < transactions.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 text-xs text-muted-foreground"
                    onClick={() =>
                      setVisibleTxCount((prev) =>
                        Math.min(prev + 10, transactions.length),
                      )
                    }
                  >
                    Zobrazit dalších{' '}
                    {Math.min(10, transactions.length - visibleTxCount)}
                  </Button>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="poznamky">
          <StockJournalTab ticker={ticker} />
        </TabsContent>

        <TabsContent value="insider">
          <InsiderTrades ticker={ticker} />
        </TabsContent>
      </Tabs>

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
