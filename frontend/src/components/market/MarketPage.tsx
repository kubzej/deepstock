/**
 * MarketPage - Přehled trhu
 * Zobrazuje klíčové tržní indikátory a sektory
 */
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { MarketOverview } from './MarketOverview';

export function MarketPage() {
  const queryClient = useQueryClient();

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
      />

      <MarketOverview />
    </div>
  );
}
