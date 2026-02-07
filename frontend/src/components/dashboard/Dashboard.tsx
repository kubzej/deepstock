import { useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HoldingsTable, type Holding as HoldingView } from './HoldingsTable';
import { OpenLotsRanking, type OpenLot } from './OpenLotsRanking';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, RefreshCw, TrendingUp } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { DataFreshnessIndicator } from '@/components/shared/DataFreshnessIndicator';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatCurrency, formatPercent, toCZK } from '@/lib/format';

interface DashboardProps {
  onStockClick?: (ticker: string) => void;
  onAddTransaction?: () => void;
}

export function Dashboard({ onStockClick, onAddTransaction }: DashboardProps) {
  const {
    portfolio,
    holdings,
    openLots,
    quotes,
    rates,
    isInitialLoading,
    isFetching,
    error,
    refresh,
    dataUpdatedAt,
    isAllPortfolios,
  } = usePortfolio();

  // Transform holdings to HoldingsTable format
  const holdingsForTable: HoldingView[] = useMemo(() => {
    return holdings.map((h) => ({
      ticker: h.ticker,
      name: h.name,
      shares: h.shares,
      avgCost: h.avg_cost,
      currency: h.currency,
      sector: h.sector || '',
      totalInvestedCzk: h.total_invested_czk,
      priceScale: h.price_scale ?? 1,
      portfolioName: h.portfolio_name,
    }));
  }, [holdings]);

  // Calculate totals in CZK
  const totalValueCzk = holdingsForTable.reduce((sum, h) => {
    const price = quotes[h.ticker]?.price ?? 0;
    const scale = h.priceScale ?? 1;
    // For LSE stocks, price is in pence - multiply by scale to get actual value
    return sum + toCZK(price * scale * h.shares, h.currency, rates);
  }, 0);

  // Use historical invested CZK if available, otherwise calculate from current rate
  const totalCostCzk = holdingsForTable.reduce((sum, h) => {
    if (h.totalInvestedCzk !== undefined && h.totalInvestedCzk !== null) {
      return sum + h.totalInvestedCzk;
    }
    // Fallback to current rate calculation
    return sum + toCZK(h.avgCost * h.shares, h.currency, rates);
  }, 0);

  const totalPnLCzk = totalValueCzk - totalCostCzk;
  const totalPnLPercent =
    totalCostCzk > 0 ? (totalPnLCzk / totalCostCzk) * 100 : 0;

  const dailyChangeCzk = holdingsForTable.reduce((sum, h) => {
    const change = quotes[h.ticker]?.change ?? 0;
    const scale = h.priceScale ?? 1;
    return sum + toCZK(change * scale * h.shares, h.currency, rates);
  }, 0);

  const dailyChangePercent =
    totalValueCzk > 0
      ? (dailyChangeCzk / (totalValueCzk - dailyChangeCzk)) * 100
      : 0;

  // Calculate extended hours (pre-market / after-hours) change
  const extendedHoursData = useMemo(() => {
    let preMarketChangeCzk = 0;
    let postMarketChangeCzk = 0;
    let hasPreMarket = false;
    let hasPostMarket = false;

    holdingsForTable.forEach((h) => {
      const quote = quotes[h.ticker];
      if (!quote) return;

      const scale = h.priceScale ?? 1;
      const regularPrice = quote.price;

      // Pre-market change: difference between pre-market price and previous close
      if (
        quote.preMarketPrice &&
        quote.preMarketChangePercent !== undefined &&
        quote.preMarketChangePercent !== null
      ) {
        hasPreMarket = true;
        // Pre-market change is relative to regular close, calculate absolute change
        const preMarketChange =
          regularPrice * (quote.preMarketChangePercent / 100);
        preMarketChangeCzk += toCZK(
          preMarketChange * scale * h.shares,
          h.currency,
          rates,
        );
      }

      // Post-market (after-hours) change: difference between after-hours price and regular close
      if (
        quote.postMarketPrice &&
        quote.postMarketChangePercent !== undefined &&
        quote.postMarketChangePercent !== null
      ) {
        hasPostMarket = true;
        // Post-market change is relative to regular close
        const postMarketChange =
          regularPrice * (quote.postMarketChangePercent / 100);
        postMarketChangeCzk += toCZK(
          postMarketChange * scale * h.shares,
          h.currency,
          rates,
        );
      }
    });

    const preMarketChangePercent =
      totalValueCzk > 0 ? (preMarketChangeCzk / totalValueCzk) * 100 : 0;
    const postMarketChangePercent =
      totalValueCzk > 0 ? (postMarketChangeCzk / totalValueCzk) * 100 : 0;

    return {
      preMarketChangeCzk,
      preMarketChangePercent,
      hasPreMarket,
      postMarketChangeCzk,
      postMarketChangePercent,
      hasPostMarket,
    };
  }, [holdingsForTable, quotes, rates, totalValueCzk]);

  // Enrich open lots with current prices
  const lotsWithPrices: OpenLot[] = useMemo(() => {
    return openLots.map((lot) => ({
      ...lot,
      currentPrice: quotes[lot.ticker]?.price ?? 0,
      priceScale: lot.priceScale ?? 1,
    }));
  }, [openLots, quotes]);

  // Loading state - only show skeleton on initial load (no data yet)
  if (isInitialLoading) {
    return (
      <div className="space-y-6 pb-12">
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-12 w-64" />
          <div className="flex gap-8">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={refresh} variant="outline">
          Zkusit znovu
        </Button>
      </div>
    );
  }

  // Empty portfolio state
  if (holdings.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="mb-8">
          <p className="text-muted-foreground text-sm mb-1">
            {portfolio?.name ?? 'Portfolio'}
          </p>
          <h1 className="text-4xl md:text-5xl font-bold font-mono-price mb-4">
            {formatCurrency(0)}
          </h1>
        </div>

        {/* Empty state */}
        <EmptyState
          icon={TrendingUp}
          title="Prázdné portfolio"
          description="Zatím nemáte žádné pozice. Přidejte první transakci pro sledování vašeho portfolia."
          action={
            onAddTransaction
              ? { label: 'Přidat transakci', onClick: onAddTransaction }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <p className="text-muted-foreground text-sm">
            {isAllPortfolios
              ? 'Všechna portfolia'
              : (portfolio?.name ?? 'Portfolio')}
          </p>
          <div className="flex items-center gap-2">
            <DataFreshnessIndicator
              dataUpdatedAt={dataUpdatedAt}
              isFetching={isFetching}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={refresh}
              disabled={isFetching}
              className="h-7 w-7"
            >
              <RefreshCw
                className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>

        {/* Main Value */}
        <h1 className="text-4xl md:text-5xl font-bold font-mono-price mb-4">
          {formatCurrency(totalValueCzk)}
        </h1>

        {/* Stats row below */}
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {/* Daily Change */}
          <div>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide block">
              Dnes
            </span>
            <span
              className={`text-lg font-mono-price font-semibold ${
                dailyChangeCzk >= 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {formatCurrency(dailyChangeCzk)}
            </span>
            <span
              className={`text-sm font-mono-price ml-1.5 ${
                dailyChangeCzk >= 0 ? 'text-positive/70' : 'text-negative/70'
              }`}
            >
              {formatPercent(dailyChangePercent, 1, true)}
            </span>
          </div>

          {/* Pre-market Change - show only if data available */}
          {extendedHoursData.hasPreMarket && (
            <div>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide block">
                Pre-market
              </span>
              <span className="text-lg font-mono-price font-semibold text-orange-500">
                {formatCurrency(extendedHoursData.preMarketChangeCzk)}
              </span>
              <span className="text-sm font-mono-price ml-1.5 text-orange-500/70">
                {formatPercent(
                  extendedHoursData.preMarketChangePercent,
                  1,
                  true,
                )}
              </span>
            </div>
          )}

          {/* After-hours Change - show only if data available */}
          {extendedHoursData.hasPostMarket && (
            <div>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide block">
                After-hours
              </span>
              <span className="text-lg font-mono-price font-semibold text-violet-500">
                {formatCurrency(extendedHoursData.postMarketChangeCzk)}
              </span>
              <span className="text-sm font-mono-price ml-1.5 text-violet-500/70">
                {formatPercent(
                  extendedHoursData.postMarketChangePercent,
                  1,
                  true,
                )}
              </span>
            </div>
          )}

          {/* Total P/L */}
          <div>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide block">
              Celkem P/L
            </span>
            <span
              className={`text-lg font-mono-price font-semibold ${
                totalPnLCzk >= 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {formatCurrency(totalPnLCzk)}
            </span>
            <span
              className={`text-sm font-mono-price ml-1.5 ${
                totalPnLCzk >= 0 ? 'text-positive/70' : 'text-negative/70'
              }`}
            >
              {formatPercent(totalPnLPercent, 1, true)}
            </span>
          </div>

          {/* Invested */}
          <div>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide block">
              Investováno
            </span>
            <span className="text-lg font-mono-price font-semibold">
              {formatCurrency(totalCostCzk)}
            </span>
          </div>

          {/* Positions */}
          <div>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide block">
              Pozice
            </span>
            <span className="text-lg font-mono-price font-semibold">
              {holdings.length}
            </span>
          </div>
        </div>
      </div>

      {/* Content with Tabs */}
      <Tabs defaultValue="holdings" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="holdings">Držené pozice</TabsTrigger>
          <TabsTrigger value="lots">Otevřené loty</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings">
          <HoldingsTable
            holdings={holdingsForTable}
            quotes={quotes}
            rates={rates}
            onRowClick={onStockClick}
            showPortfolioColumn={isAllPortfolios}
          />
        </TabsContent>

        <TabsContent value="lots">
          {lotsWithPrices.length > 0 ? (
            <OpenLotsRanking
              lots={lotsWithPrices}
              rates={rates}
              onLotClick={onStockClick}
              showPortfolioColumn={isAllPortfolios}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Žádné otevřené loty
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
