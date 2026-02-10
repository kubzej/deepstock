/**
 * MarketPage - Přehled trhu
 * Zobrazuje klíčové tržní indikátory a sektory
 */
import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { MarketOverview } from './MarketOverview';

export function MarketPage() {
  const queryClient = useQueryClient();

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

      <MarketOverview />
    </div>
  );
}
