/**
 * MovingAveragesChart - Price with SMA 50 and SMA 200
 * Shows trend direction based on moving average crossovers
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartWrapper, type SignalType } from './ChartWrapper';
import {
  fetchTechnicalIndicators,
  type TrendSignalType,
  type TechnicalPeriod,
} from '@/lib/api';

// ============================================================
// TYPES
// ============================================================

interface MovingAveragesChartProps {
  ticker: string;
}

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

function getSignalType(trendSignal: TrendSignalType): SignalType {
  if (trendSignal === 'strong_bullish' || trendSignal === 'bullish') {
    return 'bullish';
  }
  if (trendSignal === 'strong_bearish' || trendSignal === 'bearish') {
    return 'bearish';
  }
  return 'neutral';
}

function getEvaluation(
  trendSignal: TrendSignalType,
  priceVsSma50: number | null,
  priceVsSma200: number | null,
): string {
  if (priceVsSma50 === null || priceVsSma200 === null) {
    return 'Nedostatek dat pro vyhodnocení trendu.';
  }

  if (trendSignal === 'strong_bullish') {
    return `Silný býčí trend. Cena je ${priceVsSma50.toFixed(1)}% nad SMA 50 a ${priceVsSma200.toFixed(1)}% nad SMA 200. Oba klouzavé průměry směřují nahoru.`;
  }
  if (trendSignal === 'bullish') {
    return `Býčí trend. Cena drží nad oběma klouzavými průměry (${priceVsSma50.toFixed(1)}% vs SMA 50).`;
  }
  if (trendSignal === 'strong_bearish') {
    return `Silný medvědí trend. Cena je ${Math.abs(priceVsSma50).toFixed(1)}% pod SMA 50 a ${Math.abs(priceVsSma200).toFixed(1)}% pod SMA 200.`;
  }
  if (trendSignal === 'bearish') {
    return `Medvědí trend. Cena je pod oběma klouzavými průměry.`;
  }

  // Mixed
  if (priceVsSma50 < 0 && priceVsSma200 > 0) {
    return `Možná korekce. Cena klesla pod SMA 50, ale stále drží ${priceVsSma200.toFixed(1)}% nad SMA 200.`;
  }
  if (priceVsSma50 > 0 && priceVsSma200 < 0) {
    return `Potenciální obrat. Cena překročila SMA 50, ale zůstává pod SMA 200.`;
  }

  return 'Trend není jednoznačný. Sledujte vývoj klouzavých průměrů.';
}

// ============================================================
// TOOLTIP CONTENT
// ============================================================

const tooltipExplanation = (
  <div className="space-y-2">
    <p className="font-medium">Klouzavé průměry (SMA)</p>
    <p>
      <span className="text-emerald-500">Cena</span> - aktuální cenový vývoj.
    </p>
    <p>
      <span className="text-indigo-400">SMA 50</span> - krátkodobý trend (50
      dní).
    </p>
    <p>
      <span className="text-purple-400">SMA 200</span> - dlouhodobý trend (200
      dní).
    </p>
    <div className="pt-2 mt-2 space-y-1">
      <p className="text-emerald-400">Býčí: Cena nad oběma SMA</p>
      <p className="text-rose-400">Medvědí: Cena pod oběma SMA</p>
    </div>
  </div>
);

// ============================================================
// CUSTOM TOOLTIP
// ============================================================

interface TooltipPayload {
  value: number;
  dataKey: string;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
      <p className="text-xs text-zinc-400 mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-zinc-400">
            {entry.dataKey === 'price' && 'Cena'}
            {entry.dataKey === 'sma50' && 'SMA 50'}
            {entry.dataKey === 'sma200' && 'SMA 200'}:
          </span>
          <span className="font-mono text-white">
            {entry.value?.toFixed(2) ?? '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

// Chart colors - matching app patterns
const COLORS = {
  price: 'rgb(16 185 129)', // emerald-500 - main price line
  priceGradient: 'rgba(16, 185, 129, 0.1)',
  sma50: 'rgb(99 102 241)', // indigo-500 - medium term
  sma200: 'rgb(168 85 247)', // purple-500 - long term
  axis: 'hsl(var(--muted-foreground))',
  grid: 'rgba(63, 63, 70, 0.5)',
};

export function MovingAveragesChart({ ticker }: MovingAveragesChartProps) {
  const [period, setPeriod] = useState<TechnicalPeriod>('3mo');

  const { data: technicalData, isLoading } = useQuery({
    queryKey: ['technical', ticker, period],
    queryFn: () => fetchTechnicalIndicators(ticker, period),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading || !technicalData) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { priceHistory, trendSignal, priceVsSma50, priceVsSma200 } =
    technicalData;

  const signal = getSignalType(trendSignal);
  const evaluation = getEvaluation(trendSignal, priceVsSma50, priceVsSma200);

  // Filter out null values for domain calculation
  const prices = priceHistory
    .map((d) => [d.price, d.sma50, d.sma200])
    .flat()
    .filter((v): v is number => v !== null);

  const minPrice = Math.min(...prices) * 0.98;
  const maxPrice = Math.max(...prices) * 1.02;

  // Format data for display
  const chartData = priceHistory.map((d) => ({
    ...d,
    dateFormatted: formatDate(d.date),
  }));

  return (
    <ChartWrapper
      title="Klouzavé průměry (SMA)"
      tooltipContent={tooltipExplanation}
      signal={signal}
      evaluation={evaluation}
      period={period}
      onPeriodChange={setPeriod}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.price} stopOpacity={0.15} />
                <stop offset="100%" stopColor={COLORS.price} stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="dateFormatted"
              tick={{ fill: COLORS.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              tick={{ fill: COLORS.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => v.toFixed(0)}
              orientation="right"
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Price area with gradient fill */}
            <Area
              type="monotone"
              dataKey="price"
              stroke={COLORS.price}
              strokeWidth={2}
              fill="url(#priceGradient)"
              name="Cena"
              isAnimationActive={false}
            />

            {/* SMA 50 - medium term */}
            <Line
              type="monotone"
              dataKey="sma50"
              stroke={COLORS.sma50}
              strokeWidth={1.5}
              dot={false}
              name="SMA 50"
            />

            {/* SMA 200 - long term */}
            <Line
              type="monotone"
              dataKey="sma200"
              stroke={COLORS.sma200}
              strokeWidth={1.5}
              dot={false}
              name="SMA 200"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
