/**
 * Analysis Page
 *
 * Modular portfolio analysis with distribution, stock and option performance.
 */
import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, startOfYear, parseISO, isAfter, isBefore } from 'date-fns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  useAllTransactions,
  useAllOptionTransactions,
} from '@/hooks/useTransactionHistory';
import { useStocks } from '@/hooks/useStocks';
import { useStockPerformance } from '@/hooks/usePerformance';
import {
  DateRangeFilter,
  getDateRange,
  DistributionList,
  PerformanceChart,
  StockPerformance,
  OptionPerformance,
  calculateStockPerformance,
  calculateOptionPerformance,
  SECTOR_COLORS,
  COUNTRY_COLORS,
  EXCHANGE_COLORS,
} from '@/components/analysis';
import type { DateRangePreset, DistributionItem } from '@/components/analysis';
import type {
  Transaction,
  OptionTransaction,
  Stock,
  PerformancePeriod,
} from '@/lib/api';

type TabType = 'overview' | 'stocks' | 'options';

export function AnalysisPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('YTD');
  const [customFrom, setCustomFrom] = useState(
    format(startOfYear(new Date()), 'yyyy-MM-dd'),
  );
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Map date preset to performance period
  // Backend supports: 1W, 1M, 3M, 6M, MTD, YTD, 1Y, ALL
  const perfPeriod = useMemo((): PerformancePeriod => {
    const mapping: Record<string, PerformancePeriod> = {
      '1D': '1W',
      '2D': '1W',
      '1W': '1W',
      '1M': '1M',
      '3M': '3M',
      '6M': '6M',
      MTD: 'MTD',
      YTD: 'YTD',
      '1Y': '1Y',
      '5Y': 'ALL',
      ALL: 'ALL',
      CUSTOM: 'ALL',
    };
    return mapping[datePreset] || '1Y';
  }, [datePreset]);

  // Data
  const {
    holdings,
    quotes,
    rates,
    loading: portfolioLoading,
    activePortfolio,
  } = usePortfolio();
  const portfolioId = activePortfolio?.id;

  const { data: stockTransactions = [], isLoading: stocksLoading } =
    useAllTransactions();
  const { data: optionTransactions = [], isLoading: optionsLoading } =
    useAllOptionTransactions();
  const { data: stocks = [] } = useStocks();

  // Performance chart data - use active portfolio
  // Pass custom dates when CUSTOM preset is selected
  const { data: stockPerfData, isLoading: stockPerfLoading } =
    useStockPerformance(
      portfolioId,
      perfPeriod,
      datePreset === 'CUSTOM' ? customFrom : undefined,
      datePreset === 'CUSTOM' ? customTo : undefined,
    );

  const isLoading = portfolioLoading || stocksLoading || optionsLoading;

  // Date range
  const dateRange = useMemo(
    () => getDateRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  );

  // Filter transactions by date AND portfolio
  const filteredStockTransactions = useMemo(() => {
    return stockTransactions.filter((tx: Transaction) => {
      // Filter by portfolio if one is selected
      if (portfolioId && tx.portfolioId !== portfolioId) return false;
      const date = parseISO(tx.date);
      return !isBefore(date, dateRange.from) && !isAfter(date, dateRange.to);
    });
  }, [stockTransactions, dateRange, portfolioId]);

  const filteredOptionTransactions = useMemo(() => {
    return optionTransactions.filter((tx: OptionTransaction) => {
      // Filter by portfolio if one is selected (OptionTransaction uses snake_case)
      if (portfolioId && tx.portfolio_id !== portfolioId) return false;
      const date = parseISO(tx.date);
      return !isBefore(date, dateRange.from) && !isAfter(date, dateRange.to);
    });
  }, [optionTransactions, dateRange]);

  // Calculate performance
  const stockPerf = useMemo(
    () => calculateStockPerformance(filteredStockTransactions),
    [filteredStockTransactions],
  );

  const optionPerf = useMemo(
    () => calculateOptionPerformance(filteredOptionTransactions),
    [filteredOptionTransactions],
  );

  // Stock map for country lookup
  const stockMap = useMemo(() => {
    const map: Record<string, Stock> = {};
    stocks.forEach((s) => {
      map[s.ticker] = s;
    });
    return map;
  }, [stocks]);

  // Holdings with computed current_value for distribution drilling
  const holdingsWithValue = useMemo(() => {
    return holdings.map((h) => {
      const quote = quotes[h.ticker];
      const price = quote?.price || 0;
      const scale = h.price_scale ?? 1;
      const rate = rates[h.currency] || 1;
      return {
        ...h,
        current_value: h.shares * price * scale * rate,
      };
    });
  }, [holdings, quotes, rates]);

  // Distribution calculations
  const sectorDistribution = useMemo((): DistributionItem[] => {
    const sectorMap: Record<string, number> = {};
    let totalValue = 0;

    holdings.forEach((h) => {
      const quote = quotes[h.ticker];
      const price = quote?.price || 0;
      const scale = h.price_scale ?? 1;
      const rate = rates[h.currency] || 1;
      const value = h.shares * price * scale * rate;
      const sector = h.sector || 'Other';

      sectorMap[sector] = (sectorMap[sector] || 0) + value;
      totalValue += value;
    });

    return Object.entries(sectorMap)
      .map(([label, value]) => ({
        label,
        value,
        percent: totalValue > 0 ? (value / totalValue) * 100 : 0,
        color: SECTOR_COLORS[label] || SECTOR_COLORS['Other'],
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, quotes, rates]);

  const countryDistribution = useMemo((): DistributionItem[] => {
    const countryMap: Record<string, number> = {};
    let totalValue = 0;

    holdings.forEach((h) => {
      const quote = quotes[h.ticker];
      const price = quote?.price || 0;
      const scale = h.price_scale ?? 1;
      const rate = rates[h.currency] || 1;
      const value = h.shares * price * scale * rate;
      const stock = stockMap[h.ticker];
      const country = stock?.country || 'Neznámá';

      countryMap[country] = (countryMap[country] || 0) + value;
      totalValue += value;
    });

    return Object.entries(countryMap)
      .map(([label, value]) => ({
        label,
        value,
        percent: totalValue > 0 ? (value / totalValue) * 100 : 0,
        color: COUNTRY_COLORS[label] || COUNTRY_COLORS['Other'],
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, quotes, rates, stockMap]);

  const exchangeDistribution = useMemo((): DistributionItem[] => {
    const exchangeMap: Record<string, number> = {};
    let totalValue = 0;

    holdings.forEach((h) => {
      const quote = quotes[h.ticker];
      const price = quote?.price || 0;
      const scale = h.price_scale ?? 1;
      const rate = rates[h.currency] || 1;
      const value = h.shares * price * scale * rate;
      const stock = stockMap[h.ticker];
      const exchange = stock?.exchange || 'Other';

      exchangeMap[exchange] = (exchangeMap[exchange] || 0) + value;
      totalValue += value;
    });

    return Object.entries(exchangeMap)
      .map(([label, value]) => ({
        label,
        value,
        percent: totalValue > 0 ? (value / totalValue) * 100 : 0,
        color: EXCHANGE_COLORS[label] || EXCHANGE_COLORS['Other'],
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, quotes, rates, stockMap]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['all-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['all-option-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['holdings'] });
    queryClient.invalidateQueries({ queryKey: ['stockPerformance'] });
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Analýza"
        onRefresh={handleRefresh}
        isRefreshing={isLoading}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
        <TabsList>
          <TabsTrigger value="overview">Diverzifikace</TabsTrigger>
          <TabsTrigger value="stocks">Akcie</TabsTrigger>
          <TabsTrigger value="options">Opce</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="grid md:grid-cols-3 gap-8">
              <DistributionList
                title="Podle sektoru"
                items={sectorDistribution}
                holdings={holdingsWithValue}
                groupBy="sector"
              />
              <DistributionList
                title="Podle země"
                items={countryDistribution}
                holdings={holdingsWithValue}
                groupBy="country"
                stockLookup={stockMap}
              />
              <DistributionList
                title="Podle burzy"
                items={exchangeDistribution}
                holdings={holdingsWithValue}
                groupBy="exchange"
                stockLookup={stockMap}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="stocks" className="mt-6 space-y-6">
          <DateRangeFilter
            preset={datePreset}
            onPresetChange={setDatePreset}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />

          {/* Performance chart */}
          <PerformanceChart
            data={stockPerfData?.data ?? []}
            isLoading={stockPerfLoading}
            showInvested
          />

          {/* Transaction breakdown */}
          {stocksLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <StockPerformance data={stockPerf} />
          )}
        </TabsContent>

        <TabsContent value="options" className="mt-6 space-y-6">
          <DateRangeFilter
            preset={datePreset}
            onPresetChange={setDatePreset}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />

          {/* Transaction breakdown */}
          {optionsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <OptionPerformance data={optionPerf} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
