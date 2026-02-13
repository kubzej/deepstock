/**
 * MarketPage - Přehled trhu
 * Zobrazuje klíčové tržní indikátory a sektory
 */
import { useState } from 'react';
import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import {
  StockHeatmap,
  EconomicCalendar,
} from '@/components/shared/TradingViewWidgets';
import { MarketOverview } from './MarketOverview';

type HeatmapSource = 'SPX500' | 'NASDAQ100' | 'DJIA' | 'STOXX600';

const HEATMAP_OPTIONS: { value: HeatmapSource; label: string }[] = [
  { value: 'SPX500', label: 'S&P 500' },
  { value: 'NASDAQ100', label: 'Nasdaq 100' },
  { value: 'DJIA', label: 'Dow Jones' },
  { value: 'STOXX600', label: 'Stoxx 600' },
];

export function MarketPage() {
  const queryClient = useQueryClient();
  const [heatmapSource, setHeatmapSource] = useState<HeatmapSource>('SPX500');

  // Track if any quotes are being fetched
  const isFetching = useIsFetching({ queryKey: ['quotes'] }) > 0;

  // Get dataUpdatedAt from quotes cache
  const quotesState = queryClient.getQueryState(['quotes']);
  const dataUpdatedAt = quotesState?.dataUpdatedAt ?? null;

  const handleRefresh = () => {
    // Invalidate all quote caches
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['quote'] });
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
