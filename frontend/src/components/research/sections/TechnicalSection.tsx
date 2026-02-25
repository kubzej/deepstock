import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { PriceChart } from '@/components/charts';
import {
  TradingViewAdvancedChart,
  isTradingViewSupported,
} from '@/components/shared/TradingViewWidgets';

const TechnicalAnalysis = lazy(() =>
  import('@/components/charts/TechnicalAnalysis').then((mod) => ({
    default: mod.TechnicalAnalysis,
  })),
);

interface TechnicalSectionProps {
  ticker: string;
  currency: string;
}

export function TechnicalSection({ ticker, currency }: TechnicalSectionProps) {
  const isSupported = isTradingViewSupported(ticker);

  return (
    <div className="space-y-8">
      {isSupported ? (
        <TradingViewAdvancedChart symbol={ticker} height={450} />
      ) : (
        <PriceChart ticker={ticker} currency={currency} height={350} />
      )}

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          </div>
        }
      >
        <TechnicalAnalysis ticker={ticker} />
      </Suspense>
    </div>
  );
}
