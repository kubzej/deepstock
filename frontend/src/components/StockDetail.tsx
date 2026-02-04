import { useState, useEffect, useMemo } from 'react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  fetchStock,
  fetchQuotes,
  fetchTransactions,
  fetchAllTransactions,
} from '@/lib/api';
import type { Stock, Quote, Transaction } from '@/lib/api';
import {
  formatCurrency,
  formatPercent,
  formatPrice,
  formatDate,
  toCZK,
} from '@/lib/format';

interface StockDetailProps {
  ticker: string;
  onBack: () => void;
  onEdit?: (stock: Stock) => void;
  onDelete?: (stock: Stock) => void;
}

export function StockDetail({
  ticker,
  onBack,
  onEdit,
  onDelete,
}: StockDetailProps) {
  const {
    portfolio,
    getHoldingByTicker,
    quotes: portfolioQuotes,
    rates,
    loading: portfolioLoading,
    isAllPortfolios,
  } = usePortfolio();

  // Stock master data from API
  const [stock, setStock] = useState<Stock | null>(null);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState<string | null>(null);

  // Transactions
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  // Local quote if not in portfolio
  const [localQuote, setLocalQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Load stock from API
  useEffect(() => {
    const loadStock = async () => {
      try {
        setStockLoading(true);
        setStockError(null);
        const data = await fetchStock(ticker);
        setStock(data);
      } catch (err) {
        setStockError(
          err instanceof Error ? err.message : 'Nepodařilo se načíst akcii',
        );
      } finally {
        setStockLoading(false);
      }
    };
    loadStock();
  }, [ticker]);

  // Load transactions
  useEffect(() => {
    const loadTransactions = async () => {
      // Need either specific portfolio or "all portfolios" mode
      if (!portfolio?.id && !isAllPortfolios) return;
      try {
        setTransactionsLoading(true);
        let data;
        if (isAllPortfolios) {
          data = await fetchAllTransactions(100);
        } else {
          data = await fetchTransactions(portfolio!.id, 100);
        }
        // Filter transactions for this ticker
        const tickerTransactions = data.filter((t) => t.ticker === ticker);
        setTransactions(tickerTransactions);
      } catch (err) {
        console.error('Failed to load transactions:', err);
      } finally {
        setTransactionsLoading(false);
      }
    };
    loadTransactions();
  }, [portfolio?.id, ticker, isAllPortfolios]);

  // Load quote if not available from portfolio context
  useEffect(() => {
    const loadQuote = async () => {
      // If quote already exists in portfolio context, skip
      if (portfolioQuotes[ticker]) {
        return;
      }

      try {
        setQuoteLoading(true);
        const quotes = await fetchQuotes([ticker]);
        if (quotes[ticker]) {
          setLocalQuote(quotes[ticker]);
        }
      } catch (err) {
        console.error('Failed to load quote:', err);
        // Non-critical error, just show no price
      } finally {
        setQuoteLoading(false);
      }
    };
    loadQuote();
  }, [ticker, portfolioQuotes]);

  // Get optional holding (position) from portfolio
  const holding = getHoldingByTicker(ticker);
  // Use portfolio quote if available, otherwise local quote
  const quote = portfolioQuotes[ticker] || localQuote;

  // Calculate sold shares per lot (for BUY transaction status)
  const soldPerLot = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach((tx) => {
      if (tx.type === 'SELL' && tx.sourceTransactionId) {
        const current = map.get(tx.sourceTransactionId) || 0;
        map.set(tx.sourceTransactionId, current + tx.shares);
      }
    });
    return map;
  }, [transactions]);

  // Helper to get lot status for BUY transactions
  const getLotStatus = (txId: string, totalShares: number) => {
    const sold = soldPerLot.get(txId) || 0;
    return {
      sold,
      remaining: totalShares - sold,
      isFullySold: sold >= totalShares,
    };
  };

  const isLoading = stockLoading || portfolioLoading || quoteLoading;

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
        <p className="text-destructive">{stockError || 'Akcie nenalezena'}</p>
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
    ? {
        totalCost: toCZK(position.totalCost, stockCurrency, rates),
        totalValue: toCZK(position.totalValue, stockCurrency, rates),
        unrealizedPnL: toCZK(position.unrealizedPnL, stockCurrency, rates),
      }
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
            onClick={() => stock && onEdit?.(stock)}
            disabled={!onEdit}
          >
            <Pencil className="w-4 h-4 mr-1" />
            Upravit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => stock && onDelete?.(stock)}
            disabled={!onDelete}
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
        </div>
      </div>

      {/* Notes */}
      {stock?.notes && (
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {stock.notes}
        </p>
      )}

      {/* Position Stats */}
      {position && positionCzk && (
        <div className="mb-8">
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
                P/L
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
                  ({formatPercent(position.unrealizedPnLPercent, 2, true)})
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No position */}
      {!hasPosition && (
        <div className="mb-8 py-8 text-center text-muted-foreground border border-dashed border-border rounded-lg">
          Nemáte otevřenou pozici v této akcii
        </div>
      )}

      {/* Transactions */}
      <div className="mb-6">
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs uppercase text-muted-foreground">
                    Datum
                  </TableHead>
                  {isAllPortfolios && (
                    <TableHead className="text-xs uppercase text-muted-foreground">
                      Portfolio
                    </TableHead>
                  )}
                  <TableHead className="text-xs uppercase text-muted-foreground">
                    Typ
                  </TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground">
                    Lot
                  </TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground text-right">
                    P/L {stockCurrency}
                  </TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground text-right">
                    Množství
                  </TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground text-right">
                    Cena
                  </TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground text-right">
                    Celkem CZK
                  </TableHead>
                  <TableHead className="text-xs uppercase text-muted-foreground text-right">
                    Akce
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  // Calculate P/L for BUY transactions (unrealized) or SELL (realized)
                  const isBuy = tx.type === 'BUY';
                  const lotStatus = isBuy
                    ? getLotStatus(tx.id, tx.shares)
                    : null;
                  const isSold = lotStatus?.isFullySold ?? false;

                  let pnl: number | null = null;
                  let pnlPercent: number | null = null;
                  let sourceLotPrice: number | null = null;

                  if (isBuy && !isSold && currentPrice > 0) {
                    // Unrealized P/L for open BUY lots
                    const remaining = lotStatus?.remaining ?? tx.shares;
                    pnl = (currentPrice - tx.price) * remaining;
                    pnlPercent = ((currentPrice - tx.price) / tx.price) * 100;
                  } else if (!isBuy && tx.sourceTransaction) {
                    // Realized P/L for SELL - use source transaction object
                    sourceLotPrice = tx.sourceTransaction.price;
                    pnl = (tx.price - sourceLotPrice) * tx.shares;
                    pnlPercent =
                      ((tx.price - sourceLotPrice) / sourceLotPrice) * 100;
                  }

                  // Lot info for BUY transactions
                  let lotInfo = '—';

                  if (tx.type === 'SELL' && sourceLotPrice !== null) {
                    // SELL: Show source lot buy price
                    lotInfo = `@ ${formatPrice(sourceLotPrice, tx.currency)}`;
                  } else if (isBuy && lotStatus) {
                    // BUY: Show sold status
                    if (lotStatus.isFullySold) {
                      // Fully sold
                      lotInfo = 'Prodáno';
                    } else if (lotStatus.sold > 0) {
                      // Partially sold
                      lotInfo = `Prodáno ${lotStatus.sold}/${tx.shares}`;
                    }
                    // else: not sold at all, keep '—'
                  }

                  return (
                    <TableRow key={tx.id} className="hover:bg-muted/50">
                      <TableCell className="font-mono-price text-sm">
                        {formatDate(tx.date)}
                      </TableCell>
                      {isAllPortfolios && (
                        <TableCell className="text-sm">
                          <Badge
                            variant="outline"
                            className="text-xs font-normal"
                          >
                            {tx.portfolioName}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-700/60 text-zinc-300">
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lotInfo}
                      </TableCell>
                      <TableCell className="font-mono-price text-sm text-right">
                        {pnl !== null ? (
                          <span
                            className={
                              pnl >= 0 ? 'text-positive' : 'text-negative'
                            }
                          >
                            {formatPrice(pnl, tx.currency)}
                            <span className="block text-xs">
                              ({formatPercent(pnlPercent!, 1, true)})
                            </span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="font-mono-price text-sm text-right">
                        {tx.shares}
                      </TableCell>
                      <TableCell className="font-mono-price text-sm text-right">
                        {formatPrice(tx.price, tx.currency)}
                      </TableCell>
                      <TableCell className="font-mono-price text-sm text-right font-medium">
                        {formatCurrency(tx.totalCzk)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
