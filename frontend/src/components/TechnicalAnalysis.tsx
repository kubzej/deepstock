/**
 * TechnicalAnalysis - Technical indicators
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import { MovingAveragesChart, RSIChart } from '@/components/charts';
import {
  fetchTechnicalIndicators,
  type TechnicalData,
  type TechnicalPeriod,
} from '@/lib/api';

// ============================================================
// TYPES
// ============================================================

interface TechnicalAnalysisProps {
  ticker: string;
}

const TIME_RANGES: { value: TechnicalPeriod; label: string }[] = [
  { value: '1w', label: '1T' },
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1R' },
  { value: '2y', label: '2R' },
];

// ============================================================
// MAIN COMPONENT
// ============================================================

export function TechnicalAnalysis({ ticker }: TechnicalAnalysisProps) {
  const [period, setPeriod] = useState<TechnicalPeriod>('3mo');

  const { data, isLoading, error } = useQuery({
    queryKey: ['technical', ticker, period],
    queryFn: () => fetchTechnicalIndicators(ticker, period),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-12 text-center text-zinc-500">
        Nepodařilo se načíst technická data
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Time range selector */}
      <div className="flex justify-end">
        <PillGroup>
          {TIME_RANGES.map((range) => (
            <PillButton
              key={range.value}
              active={period === range.value}
              onClick={() => setPeriod(range.value)}
            >
              {range.label}
            </PillButton>
          ))}
        </PillGroup>
      </div>

      {/* Moving Averages */}
      <MovingAveragesChart
        data={data.priceHistory}
        trendSignal={data.trendSignal}
        priceVsSma50={data.priceVsSma50}
        priceVsSma200={data.priceVsSma200}
      />

      {/* RSI */}
      <RSIChart currentRsi={data.rsi14} />
    </div>
  );
}
