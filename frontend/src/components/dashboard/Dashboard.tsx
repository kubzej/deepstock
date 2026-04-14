import { useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HoldingsTable, type Holding as HoldingView } from './HoldingsTable';
import { OpenLotsRanking, type OpenLot } from './OpenLotsRanking';
import { PortfolioHeatmap } from './PortfolioHeatmap';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, TrendingUp, AlertTriangle } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { DataFreshnessIndicator } from '@/components/shared/DataFreshnessIndicator';
import { EmptyState, ErrorState, PageHero, PageShell } from '@/components/shared';
import { formatCurrency, formatPercent, toCZK } from '@/lib/format';
import { usePortfolioSnapshot } from '@/hooks/usePortfolioSnapshot';

interface DashboardProps {
  onAddTransaction?: () => void;
}

export function Dashboard({ onAddTransaction }: DashboardProps) {
  const {
    portfolio,
    holdings,
    openLots,
    quotes,
    rates,
    isInitialLoading,
    isFetching,
    error,
    ratesError,
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

  const snapshotPortfolioId = isAllPortfolios ? null : (portfolio?.id ?? undefined);
  const { data: snapshot } = usePortfolioSnapshot(snapshotPortfolioId);

  const totalValueCzk = snapshot?.total_value_czk ?? 0;
  const totalCostCzk = snapshot?.total_cost_czk ?? 0;
  const totalPnLCzk = snapshot?.total_pnl_czk ?? 0;
  const totalPnLPercent = snapshot?.total_pnl_percent ?? 0;
  const dailyChangeCzk = snapshot?.daily_change_czk ?? 0;
  const dailyChangePercent = snapshot?.daily_change_percent ?? 0;

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

  // Enrich open lots with current prices (including pre/post market when available)
  const lotsWithPrices: OpenLot[] = useMemo(() => {
    return openLots.map((lot) => ({
      ...lot,
      currentPrice: quotes[lot.ticker]?.price ?? 0,
      priceScale: lot.priceScale ?? 1,
      preMarketPrice: quotes[lot.ticker]?.preMarketPrice ?? null,
      postMarketPrice: quotes[lot.ticker]?.postMarketPrice ?? null,
    }));
  }, [openLots, quotes]);

  // Loading state - only show skeleton on initial load (no data yet)
  if (isInitialLoading) {
    return (
      <PageShell width="full">
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
      </PageShell>
    );
  }

  // Error state
  if (error) {
    return (
      <PageShell width="full">
        <ErrorState
          title="Nepodařilo se načíst portfolio"
          description={error}
          retryAction={{ label: 'Zkusit znovu', onClick: refresh }}
        />
      </PageShell>
    );
  }

  // Empty portfolio state
  if (holdings.length === 0) {
    return (
      <PageShell width="full" gap="lg">
        <PageHero
          eyebrow={portfolio?.name ?? 'Portfolio'}
          title={
            <h1 className="text-4xl md:text-5xl font-bold font-mono-price">
              {formatCurrency(0)}
            </h1>
          }
        />

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
      </PageShell>
    );
  }

  return (
    <PageShell width="full" gap="lg">
      <PageHero
        eyebrow={
          isAllPortfolios
            ? 'Všechna portfolia'
            : (portfolio?.name ?? 'Portfolio')
        }
        title={
          <h1 className="text-4xl md:text-5xl font-bold font-mono-price">
            {formatCurrency(totalValueCzk)}
          </h1>
        }
        actions={
          <>
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
              title="Obnovit data"
            >
              <RefreshCw
                className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
          </>
        }
      >
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
              <span className="text-lg font-mono-price font-semibold text-warning">
                {formatCurrency(extendedHoursData.preMarketChangeCzk)}
              </span>
              <span className="text-sm font-mono-price ml-1.5 text-warning/70">
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
              <span className="text-lg font-mono-price font-semibold text-sky-500">
                {formatCurrency(extendedHoursData.postMarketChangeCzk)}
              </span>
              <span className="text-sm font-mono-price ml-1.5 text-sky-500/70">
                {formatPercent(
                  extendedHoursData.postMarketChangePercent,
                  1,
                  true,
                )}
              </span>
            </div>
          )}

          {/* Unrealized P/L across open holdings */}
          <div>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide block">
              Nerealizovaný P/L
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
      </PageHero>

      {/* Exchange rate fallback warning */}
      {ratesError && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Nepodařilo se načíst aktuální kurzy — hodnoty portfolia jsou
            přepočítány orientačními kurzy.
          </AlertDescription>
        </Alert>
      )}

      {/* Content with Tabs */}
      <Tabs defaultValue="holdings" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="holdings">Držené pozice</TabsTrigger>
          <TabsTrigger value="lots">Otevřené loty</TabsTrigger>
          <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings">
          <HoldingsTable
            holdings={holdingsForTable}
            quotes={quotes}
            rates={rates}
            showPortfolioColumn={isAllPortfolios}
          />
        </TabsContent>

        <TabsContent value="lots">
          {lotsWithPrices.length > 0 ? (
            <OpenLotsRanking
              lots={lotsWithPrices}
              rates={rates}
              showPortfolioColumn={isAllPortfolios}
            />
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="Žádné otevřené loty"
              description="Přidejte transakci pro sledování jednotlivých nákupních lotů."
              action={
                onAddTransaction
                  ? { label: 'Přidat transakci', onClick: onAddTransaction }
                  : undefined
              }
            />
          )}
        </TabsContent>

        <TabsContent value="heatmap">
          <PortfolioHeatmap
            holdings={holdingsForTable}
            quotes={quotes}
            rates={rates}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
