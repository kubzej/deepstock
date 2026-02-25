/**
 * Research Page - Stock lookup with fundamentals & valuation
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { TooltipProvider } from '@/components/ui/tooltip';
import { fetchStockInfo } from '@/lib/api';
import { ValuationSection } from '@/components/research/ValuationSection';
import { StockHeader } from '@/components/research/sections/StockHeader';
import { FundamentalsSection } from '@/components/research/sections/FundamentalsSection';
import { TechnicalSection } from '@/components/research/sections/TechnicalSection';

// Main component
export function ResearchPage() {
  const [ticker, setTicker] = useState('');
  const [activeTicker, setActiveTicker] = useState<string | null>(null);

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } =
    useQuery({
      queryKey: ['stockInfo', activeTicker],
      queryFn: () => fetchStockInfo(activeTicker!),
      enabled: !!activeTicker,
      staleTime: 5 * 60 * 1000, // 5 minutes
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = ticker.trim().toUpperCase();
    if (trimmed) {
      setActiveTicker(trimmed);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-8 pb-12">
        {/* Header */}
        <PageHeader
          title="Průzkum akcie"
          onRefresh={activeTicker ? () => refetch() : undefined}
          isRefreshing={isFetching}
          dataUpdatedAt={activeTicker ? dataUpdatedAt : undefined}
        />

        {/* Search */}
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Zadejte ticker (AAPL, MSFT, ...)"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="pl-10"
              maxLength={10}
            />
          </div>
          <Button type="submit" disabled={!ticker.trim() || isLoading}>
            Analyzovat
          </Button>
        </form>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-6 w-64" />
            </div>
            <Skeleton className="h-12 w-48" />
            <div className="grid grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
            Nepodařilo se načíst data pro {activeTicker}
          </div>
        )}

        {/* No data */}
        {!isLoading && !error && activeTicker && !data && (
          <div className="p-4 bg-muted rounded-lg text-muted-foreground">
            Ticker {activeTicker} nebyl nalezen
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="space-y-6">
            <StockHeader data={data} />

            {/* Description */}
            {data.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {data.description}
              </p>
            )}

            {/* Tabs */}
            <Tabs defaultValue="fundamentals" className="w-full">
              <TabsList>
                <TabsTrigger value="fundamentals">Fundamenty</TabsTrigger>
                <TabsTrigger value="valuation">Valuace</TabsTrigger>
                <TabsTrigger value="technical">Technika</TabsTrigger>
              </TabsList>

              <TabsContent value="fundamentals" className="mt-6">
                <FundamentalsSection data={data} />
              </TabsContent>

              <TabsContent value="valuation" className="mt-6">
                <ValuationSection data={data} />
              </TabsContent>

              <TabsContent value="technical" className="mt-6">
                <TechnicalSection
                  ticker={data.symbol}
                  currency={data.currency ?? 'USD'}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
