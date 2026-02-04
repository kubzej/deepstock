import { useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  HoldingsTable,
  type Holding as HoldingView,
} from '@/components/HoldingsTable';
import { OpenLotsRanking, type OpenLot } from '@/components/OpenLotsRanking';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { formatCurrency, formatPercent, toCZK } from '@/lib/format';

interface DashboardProps {
  onStockClick?: (ticker: string) => void;
}

export function Dashboard({ onStockClick }: DashboardProps) {
  const { portfolio, holdings, quotes, rates, loading, error, refresh } =
    usePortfolio();

  // Transform holdings to HoldingsTable format
  const holdingsForTable: HoldingView[] = useMemo(() => {
    return holdings.map((h) => ({
      ticker: h.ticker,
      name: h.name,
      shares: h.shares,
      avgCost: h.avg_cost,
      currency: h.currency,
      sector: '', // TODO: add sector to holdings API
    }));
  }, [holdings]);

  // Calculate totals in CZK
  const totalValueCzk = holdingsForTable.reduce((sum, h) => {
    const price = quotes[h.ticker]?.price ?? 0;
    return sum + toCZK(price * h.shares, h.currency, rates);
  }, 0);

  const totalCostCzk = holdingsForTable.reduce((sum, h) => {
    return sum + toCZK(h.avgCost * h.shares, h.currency, rates);
  }, 0);

  const totalPnLCzk = totalValueCzk - totalCostCzk;
  const totalPnLPercent =
    totalCostCzk > 0 ? (totalPnLCzk / totalCostCzk) * 100 : 0;

  const dailyChangeCzk = holdingsForTable.reduce((sum, h) => {
    const change = quotes[h.ticker]?.change ?? 0;
    return sum + toCZK(change * h.shares, h.currency, rates);
  }, 0);

  const dailyChangePercent =
    totalValueCzk > 0
      ? (dailyChangeCzk / (totalValueCzk - dailyChangeCzk)) * 100
      : 0;

  // TODO: fetch real open lots from API
  const lotsWithPrices: OpenLot[] = useMemo(() => {
    return [];
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Načítání portfolia...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
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
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-6 mb-4">
            <Plus className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Prázdné portfolio</h2>
          <p className="text-muted-foreground max-w-md">
            Zatím nemáte žádné pozice. Přidejte první transakci pro sledování
            vašeho portfolia.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="mb-8">
        <p className="text-muted-foreground text-sm mb-1">
          {portfolio?.name ?? 'Portfolio'}
        </p>

        {/* Main Value */}
        <h1 className="text-4xl md:text-5xl font-bold font-mono-price mb-4">
          {formatCurrency(totalValueCzk)}
        </h1>

        {/* Stats row below */}
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {/* Daily Change */}
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-0.5">
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

          {/* Total P/L */}
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-0.5">
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
            <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-0.5">
              Investováno
            </span>
            <span className="text-lg font-mono-price font-semibold">
              {formatCurrency(totalCostCzk)}
            </span>
          </div>

          {/* Positions */}
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-0.5">
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
          />
        </TabsContent>

        <TabsContent value="lots">
          {lotsWithPrices.length > 0 ? (
            <OpenLotsRanking
              lots={lotsWithPrices}
              rates={rates}
              maxItems={10}
              onLotClick={(ticker) => console.log('Lot clicked:', ticker)}
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
