/**
 * FibonacciChart - Fibonacci Retracement levels
 * Shows price with key Fibonacci support/resistance levels
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartWrapper, type SignalType } from './ChartWrapper';
import { fetchTechnicalIndicators, type TechnicalPeriod } from '@/lib/api';

// ============================================================
// TYPES
// ============================================================

interface FibonacciChartProps {
  ticker: string;
}

interface FibonacciLevels {
  '0': number | null;
  '236': number | null;
  '382': number | null;
  '500': number | null;
  '618': number | null;
  '786': number | null;
  '1000': number | null;
}

// ============================================================
// CONSTANTS
// ============================================================

const COLORS = {
  price: 'rgb(16 185 129)', // emerald-500
  fib0: 'rgb(239 68 68)', // red-500 (0%)
  fib236: 'rgb(249 115 22)', // orange-500
  fib382: 'rgb(234 179 8)', // yellow-500
  fib500: 'rgb(168 85 247)', // purple-500
  fib618: 'rgb(59 130 246)', // blue-500
  fib786: 'rgb(6 182 212)', // cyan-500
  fib100: 'rgb(34 197 94)', // green-500 (100%)
  axis: 'hsl(var(--muted-foreground))',
};

const FIBONACCI_LABELS: Record<string, { label: string; color: string }> = {
  '0': { label: '0%', color: COLORS.fib0 },
  '236': { label: '23.6%', color: COLORS.fib236 },
  '382': { label: '38.2%', color: COLORS.fib382 },
  '500': { label: '50%', color: COLORS.fib500 },
  '618': { label: '61.8%', color: COLORS.fib618 },
  '786': { label: '78.6%', color: COLORS.fib786 },
  '1000': { label: '100%', color: COLORS.fib100 },
};

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

function formatPrice(value: number): string {
  return value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getSignalType(
  fibPosition: number | null,
  nearestLevel: number | null,
): SignalType {
  if (fibPosition === null) return 'neutral';

  // Near 61.8% or 38.2% are key support/resistance
  if (nearestLevel === 61.8 || nearestLevel === 38.2) {
    // Use nearestLevel to determine if we're at support or resistance
    return nearestLevel === 61.8 && fibPosition > 50
      ? 'bullish'
      : nearestLevel === 38.2 && fibPosition < 50
        ? 'bearish'
        : 'neutral';
  }

  // Price above 61.8% is bullish
  if (fibPosition > 61.8) return 'bullish';

  // Price below 38.2% is bearish
  if (fibPosition < 38.2) return 'bearish';

  return 'neutral';
}

function getEvaluation(
  fibPosition: number | null,
  nearestLevel: number | null,
  currentPrice: number | null,
  fibLevels: FibonacciLevels | null,
): string {
  if (fibPosition === null || currentPrice === null || !fibLevels) {
    return 'Nedostatek dat pro výpočet Fibonacci.';
  }

  const posText = fibPosition.toFixed(1);
  const priceText = formatPrice(currentPrice);
  const nearestText =
    nearestLevel !== null ? ` (nejblíže k ${nearestLevel}%)` : '';

  // Determine position description
  if (fibPosition >= 78.6) {
    return `Cena ${priceText} blízko maxima období (${posText}%)${nearestText}. Silný uptrendový pohyb, ale pozor na odpor u 100%.`;
  }

  if (fibPosition >= 61.8) {
    const level618 = fibLevels['618'];
    return `Cena ${priceText} nad klíčovou úrovní 61.8% (${level618 ? formatPrice(level618) : '-'}). Býčí signál, 61.8% slouží jako podpora.`;
  }

  if (fibPosition >= 50) {
    const level500 = fibLevels['500'];
    return `Cena ${priceText} kolem 50% retracementu (${level500 ? formatPrice(level500) : '-'}). Neutrální zóna, sledujte průraz.`;
  }

  if (fibPosition >= 38.2) {
    const level382 = fibLevels['382'];
    return `Cena ${priceText} u úrovně 38.2% (${level382 ? formatPrice(level382) : '-'}). Typická korekční zóna, může sloužit jako podpora.`;
  }

  if (fibPosition >= 23.6) {
    const level236 = fibLevels['236'];
    return `Cena ${priceText} blízko 23.6% (${level236 ? formatPrice(level236) : '-'}). Slabá podpora, riziko dalšího poklesu.`;
  }

  return `Cena ${priceText} blízko minima období (${posText}%). Potenciální dno, ale vyžaduje potvrzení obratu.`;
}

// ============================================================
// CUSTOM TOOLTIP
// ============================================================

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    color: string;
  }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;

  const price = payload.find((p) => p.dataKey === 'price')?.value;

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs text-zinc-500">{label}</p>
      {price !== undefined && (
        <p className="text-sm font-medium" style={{ color: COLORS.price }}>
          Cena: {formatPrice(price)}
        </p>
      )}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function FibonacciChart({ ticker }: FibonacciChartProps) {
  const [period, setPeriod] = useState<TechnicalPeriod>('3mo');

  const { data: technicalData, isLoading } = useQuery({
    queryKey: ['technical', ticker, period],
    queryFn: () => fetchTechnicalIndicators(ticker, period),
    staleTime: 5 * 60 * 1000,
  });

  // Tooltip content for info icon
  const tooltipContent = (
    <div className="space-y-2 text-sm">
      <p>
        <strong>Fibonacci Retracement</strong> identifikuje klíčové cenové
        úrovně odvozené z Fibonacciho posloupnosti.
      </p>
      <p>
        <strong>Klíčové úrovně:</strong>
      </p>
      <ul className="list-inside list-disc space-y-1 text-xs">
        <li>
          <span className="font-medium">23.6%</span> - mělká korekce
        </li>
        <li>
          <span className="font-medium">38.2%</span> - typická korekce
        </li>
        <li>
          <span className="font-medium">50%</span> - polovina pohybu
        </li>
        <li>
          <span className="font-medium">61.8%</span> - zlatý řez
          (nejdůležitější)
        </li>
        <li>
          <span className="font-medium">78.6%</span> - hluboká korekce
        </li>
      </ul>
      <p className="text-xs text-zinc-500">
        Úrovně fungují jako potenciální support/rezistence.
      </p>
    </div>
  );

  // Loading state
  if (isLoading) {
    return (
      <ChartWrapper
        title="Fibonacci Retracement"
        tooltipContent={tooltipContent}
        period={period}
        onPeriodChange={setPeriod}
      >
        <Skeleton className="h-[300px] w-full" />
      </ChartWrapper>
    );
  }

  // No data state
  if (!technicalData?.fibonacciHistory?.length) {
    return (
      <ChartWrapper
        title="Fibonacci Retracement"
        tooltipContent={tooltipContent}
        period={period}
        onPeriodChange={setPeriod}
      >
        <div className="flex h-[300px] items-center justify-center text-sm text-zinc-500">
          Žádná data pro Fibonacci
        </div>
      </ChartWrapper>
    );
  }

  const {
    fibonacciHistory,
    fibonacciLevels,
    fibonacciPosition,
    nearestFibLevel,
    currentPrice,
  } = technicalData;

  const signal = getSignalType(
    fibonacciPosition ?? null,
    nearestFibLevel ?? null,
  );
  const evaluation = getEvaluation(
    fibonacciPosition ?? null,
    nearestFibLevel ?? null,
    currentPrice ?? null,
    fibonacciLevels ?? null,
  );

  // Format data for display
  const chartData = fibonacciHistory.map((d) => ({
    ...d,
    dateFormatted: formatDate(d.date),
  }));

  // Calculate Y-axis domain with padding
  const prices = chartData
    .map((d) => d.price)
    .filter((p): p is number => p !== null);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.05;

  return (
    <ChartWrapper
      title="Fibonacci Retracement"
      tooltipContent={tooltipContent}
      signal={signal}
      evaluation={evaluation}
      period={period}
      onPeriodChange={setPeriod}
    >
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 50, left: 10, bottom: 5 }}
          >
            <XAxis
              dataKey="dateFormatted"
              tick={{ fontSize: 10, fill: COLORS.axis }}
              tickLine={false}
              axisLine={{ stroke: COLORS.axis, strokeWidth: 0.5 }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minPrice - padding, maxPrice + padding]}
              tick={{ fontSize: 10, fill: COLORS.axis }}
              tickLine={false}
              axisLine={{ stroke: COLORS.axis, strokeWidth: 0.5 }}
              tickFormatter={(value) => value.toFixed(0)}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Fibonacci Reference Lines */}
            {fibonacciLevels &&
              (
                Object.entries(fibonacciLevels) as [string, number | null][]
              ).map(([key, value]) => {
                if (value === null || value === undefined) return null;
                const levelInfo = FIBONACCI_LABELS[key];
                if (!levelInfo) return null;

                return (
                  <ReferenceLine
                    key={key}
                    y={value}
                    stroke={levelInfo.color}
                    strokeDasharray="5 5"
                    strokeWidth={1}
                    label={{
                      value: `${levelInfo.label} (${formatPrice(value)})`,
                      position: 'right',
                      fill: levelInfo.color,
                      fontSize: 9,
                    }}
                  />
                );
              })}

            {/* Price Line */}
            <Line
              type="monotone"
              dataKey="price"
              stroke={COLORS.price}
              strokeWidth={2}
              dot={false}
              name="Cena"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Fibonacci Levels Legend */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs">
        {Object.entries(FIBONACCI_LABELS).map(([key, info]) => (
          <div key={key} className="flex items-center gap-1">
            <div
              className="h-2 w-4 rounded-sm"
              style={{ backgroundColor: info.color }}
            />
            <span className="text-zinc-600">{info.label}</span>
          </div>
        ))}
      </div>

      {/* Current Position Info */}
      {fibonacciPosition !== null && fibonacciPosition !== undefined && (
        <div className="mt-2 text-center text-xs text-zinc-500">
          Aktuální pozice:{' '}
          <span className="font-medium">{fibonacciPosition.toFixed(1)}%</span>
          {nearestFibLevel !== null && nearestFibLevel !== undefined && (
            <span> (nejblíže k {nearestFibLevel}%)</span>
          )}
        </div>
      )}
    </ChartWrapper>
  );
}
