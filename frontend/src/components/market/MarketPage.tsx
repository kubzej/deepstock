/**
 * MarketPage - Přehled trhu
 * Zobrazuje klíčové tržní indikátory a sektory
 */
import { useState, useEffect } from 'react';
import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import {
  StockHeatmap,
  EconomicCalendar,
} from '@/components/shared/TradingViewWidgets';
import { MarketOverview } from './MarketOverview';

type HeatmapSource = 'SPX500' | 'NASDAQ100';

const HEATMAP_OPTIONS: { value: HeatmapSource; label: string }[] = [
  { value: 'SPX500', label: 'S&P 500' },
  { value: 'NASDAQ100', label: 'Nasdaq 100' },
];

export function MarketPage() {
  const queryClient = useQueryClient();
  const [heatmapSource, setHeatmapSource] = useState<HeatmapSource>('SPX500');

  // Track if any quotes are being fetched
  const isFetching = useIsFetching({ queryKey: ['quotes'] }) > 0;

  // Get the most recent dataUpdatedAt across all 'quotes' queries (keys like ['quotes', 'AAPL,MSFT,...'])
  const [dataUpdatedAt, setDataUpdatedAt] = useState<number | null>(() => {
    const queries = queryClient
      .getQueryCache()
      .findAll({ queryKey: ['quotes'] });
    const latest = queries.reduce(
      (max, q) => Math.max(max, q.state.dataUpdatedAt),
      0,
    );
    return latest > 0 ? latest : null;
  });

  useEffect(() => {
    const getLatest = () => {
      const queries = queryClient
        .getQueryCache()
        .findAll({ queryKey: ['quotes'] });
      const latest = queries.reduce(
        (max, q) => Math.max(max, q.state.dataUpdatedAt),
        0,
      );
      return latest > 0 ? latest : null;
    };

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.queryKey[0] === 'quotes') {
        setDataUpdatedAt(getLatest());
      }
    });

    return unsubscribe;
  }, [queryClient]);

  const handleRefresh = () => {
    // Remove individual quote caches so queryFn sees no cached data and forces API call
    queryClient.removeQueries({ queryKey: ['quote'] });
    // Trigger re-run of all batch quote queries
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Přehled trhu"
        subtitle="Klíčové indikátory, sektory a makro data"
        onRefresh={handleRefresh}
        isRefreshing={isFetching}
        dataUpdatedAt={dataUpdatedAt}
      />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Přehled</TabsTrigger>
          <TabsTrigger value="heatmap">Heatmapy</TabsTrigger>
          <TabsTrigger value="calendar">Kalendář</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <MarketOverview />
        </TabsContent>

        <TabsContent value="heatmap" className="mt-6 space-y-4">
          <PillGroup>
            {HEATMAP_OPTIONS.map((opt) => (
              <PillButton
                key={opt.value}
                active={heatmapSource === opt.value}
                onClick={() => setHeatmapSource(opt.value)}
              >
                {opt.label}
              </PillButton>
            ))}
          </PillGroup>
          <StockHeatmap
            key={heatmapSource}
            dataSource={heatmapSource}
            height="calc(100vh - 340px)"
          />
        </TabsContent>

        <TabsContent value="calendar" className="mt-6">
          <EconomicCalendar height="calc(100vh - 280px)" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
