import { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { fetchStock, fetchQuotes } from '@/lib/api';
import type { Stock, Quote } from '@/lib/api';
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
}

export function StockDetail({ ticker, onBack }: StockDetailProps) {
  const {
    getHoldingByTicker,
    quotes: portfolioQuotes,
    rates,
    loading: portfolioLoading,
  } = usePortfolio();

  // Stock master data from API
  const [stock, setStock] = useState<Stock | null>(null);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState<string | null>(null);

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

  const isLoading = stockLoading || portfolioLoading || quoteLoading;

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
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
      <div className="min-h-screen bg-background p-4">
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

  // TODO: Fetch real lots from API
  const tickerLots: Array<{
    id: string;
    date: string;
    shares: number;
    buyPrice: number;
    currency: string;
    currentPrice: number;
    pnlLocal: number;
    pnlPercent: number;
    pnlCzk: number;
  }> = [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 pb-24 md:pb-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Zpět
      </Button>

      {/* Stock Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{ticker}</h1>
            <p className="text-muted-foreground">{stockName}</p>
          </div>
          {stockSector && (
            <Badge variant="outline" className="text-xs">
              {stockSector}
            </Badge>
          )}
        </div>

        {/* Price Header */}
        <div className="mt-4">
          {currentPrice > 0 ? (
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold font-mono-price">
                {formatPrice(currentPrice, stockCurrency)}
              </span>
              <div
                className={`flex items-center gap-1 ${
                  dailyChange >= 0 ? 'text-positive' : 'text-negative'
                }`}
              >
                {dailyChange >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span className="font-mono-price">
                  {formatPrice(Math.abs(dailyChange), stockCurrency)} (
                  {formatPercent(dailyChangePercent, 2, true)})
                </span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Cena není k dispozici</p>
          )}
        </div>
      </div>

      {/* Company Description */}
      {stock?.notes && (
        <div className="mb-6">
          <h3 className="text-base font-medium mb-2">O společnosti</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {stock.notes}
          </p>
        </div>
      )}

      {/* Position Card - only if has position */}
      {position && positionCzk && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Vaše pozice</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Počet akcií</p>
                <p className="text-lg font-mono-price font-semibold">
                  {position.shares}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Průměrná cena</p>
                <p className="text-lg font-mono-price font-semibold">
                  {formatPrice(position.avgCost, stockCurrency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Investováno</p>
                <p className="text-lg font-mono-price font-semibold">
                  {formatCurrency(positionCzk.totalCost)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Aktuální hodnota
                </p>
                <p className="text-lg font-mono-price font-semibold">
                  {formatCurrency(positionCzk.totalValue)}
                </p>
              </div>
            </div>

            {/* P/L Row */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Nerealizovaný zisk/ztráta
                  </p>
                  <p
                    className={`text-xl font-mono-price font-bold ${
                      positionCzk.unrealizedPnL >= 0
                        ? 'text-positive'
                        : 'text-negative'
                    }`}
                  >
                    {formatCurrency(positionCzk.unrealizedPnL)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    position.unrealizedPnLPercent >= 0
                      ? 'text-positive border-positive/20'
                      : 'text-negative border-negative/20'
                  }
                >
                  {formatPercent(position.unrealizedPnLPercent, 2, true)}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No position info */}
      {!hasPosition && (
        <Card className="mb-6 border-dashed">
          <CardContent className="py-6 text-center text-muted-foreground">
            Nemáte otevřenou pozici v této akcii
          </CardContent>
        </Card>
      )}

      {/* Open Lots */}
      {tickerLots.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              Otevřené loty ({tickerLots.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase text-muted-foreground">
                      Datum
                    </TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground text-right">
                      Počet
                    </TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground text-right">
                      Nákup
                    </TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground text-right">
                      Aktuální
                    </TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground text-right">
                      P/L (CZK)
                    </TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground text-right">
                      P/L %
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickerLots.map((lot) => (
                    <TableRow key={lot.id} className="hover:bg-muted/50">
                      <TableCell className="font-mono-price text-sm">
                        {formatDate(lot.date)}
                      </TableCell>
                      <TableCell className="font-mono-price text-sm text-right">
                        {lot.shares}
                      </TableCell>
                      <TableCell className="font-mono-price text-sm text-right">
                        {formatPrice(lot.buyPrice, lot.currency)}
                      </TableCell>
                      <TableCell className="font-mono-price text-sm text-right">
                        {formatPrice(lot.currentPrice, lot.currency)}
                      </TableCell>
                      <TableCell
                        className={`font-mono-price text-sm text-right font-medium ${
                          lot.pnlCzk >= 0 ? 'text-positive' : 'text-negative'
                        }`}
                      >
                        {formatCurrency(lot.pnlCzk)}
                      </TableCell>
                      <TableCell
                        className={`font-mono-price text-sm text-right font-medium ${
                          lot.pnlPercent >= 0
                            ? 'text-positive'
                            : 'text-negative'
                        }`}
                      >
                        {formatPercent(lot.pnlPercent, 1, true)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
