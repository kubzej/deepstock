/**
 * ADXChart - Average Directional Index
 * Shows trend strength with +DI and -DI directional indicators
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
  ReferenceArea,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartWrapper, type SignalType } from './ChartWrapper';
import {
  fetchTechnicalIndicators,
  type IndicatorSignalType,
  type TechnicalPeriod,
} from '@/lib/api';

// ============================================================
// TYPES
// ============================================================

interface ADXChartProps {
  ticker: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const COLORS = {
  adx: 'rgb(168 85 247)', // purple-500 - trend strength
  plusDI: 'rgb(16 185 129)', // emerald-500 - bullish direction
  minusDI: 'rgb(244 63 94)', // rose-500 - bearish direction
  strongTrend: 'rgba(168, 85, 247, 0.08)',
  axis: 'hsl(var(--muted-foreground))',
  reference: 'rgba(113, 113, 122, 0.3)',
};

const STRONG_TREND_THRESHOLD = 25;

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

function getSignalType(
  adxSignal: IndicatorSignalType,
  adxTrend: IndicatorSignalType,
): SignalType {
  // Strong trend with direction
  if (adxSignal === 'strong') {
    if (adxTrend === 'bullish') return 'bullish';
    if (adxTrend === 'bearish') return 'bearish';
  }
  return 'neutral';
}

function getEvaluation(
  adx: number | null,
  plusDI: number | null,
  minusDI: number | null,
): string {
  if (adx === null || plusDI === null || minusDI === null) {
    return 'Nedostatek dat pro výpočet ADX.';
  }

  const adxText = adx.toFixed(1);
  const direction = plusDI > minusDI ? 'bullish' : 'bearish';

  if (adx >= 50) {
    return `Velmi silný ${direction} trend (ADX: ${adxText}). Trend je extrémně silný, ale pozor na možné vyčerpání.`;
  }
  if (adx >= 25) {
    return `Silný ${direction} trend (ADX: ${adxText}). Dobrá příležitost pro trendové strategie, +DI: ${plusDI.toFixed(1)}, -DI: ${minusDI.toFixed(1)}.`;
  }
  if (adx >= 20) {
    return `Slabý trend (ADX: ${adxText}). Trend se může formovat, sledujte křížení +DI a -DI.`;
  }

  return `Žádný jasný trend (ADX: ${adxText}). Trh je v konsolidaci, vyhněte se trendovým strategiím.`;
}

// ============================================================
// TOOLTIP CONTENT
// ============================================================

const tooltipExplanation = (
  <div className="space-y-2">
    <p className="font-medium">ADX (Average Directional Index)</p>
    <p>Měří sílu trendu (ne směr) na škále 0-100.</p>
    <div className="pt-2 space-y-1">
      <p>
        <span className="text-purple-500">ADX</span> - síla trendu
      </p>
      <p>
        <span className="text-emerald-500">+DI</span> - bullish směr
      </p>
      <p>
        <span className="text-rose-500">-DI</span> - bearish směr
      </p>
    </div>
    <div className="pt-2 space-y-1">
      <p className="text-purple-500">ADX nad 25 = silný trend</p>
      <p className="text-zinc-500">ADX pod 20 = slabý/žádný trend</p>
      <p className="text-emerald-500">+DI nad -DI = bullish směr</p>
      <p className="text-rose-500">-DI nad +DI = bearish směr</p>
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

  const labelMap: Record<string, string> = {
    adx: 'ADX',
    plusDI: '+DI',
    minusDI: '-DI',
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-lg">
      <p className="text-xs text-zinc-500 mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-zinc-600">{labelMap[entry.dataKey]}:</span>
          <span className="font-mono-price text-zinc-800">
            {entry.value?.toFixed(1) ?? '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ADXChart({ ticker }: ADXChartProps) {
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

  const { adxHistory, adxSignal, adxTrend, adx, plusDI, minusDI } =
    technicalData;

  const signal = getSignalType(adxSignal, adxTrend);
  const evaluation = getEvaluation(adx, plusDI, minusDI);

  // Format data for display
  const chartData = adxHistory.map((d) => ({
    ...d,
    dateFormatted: formatDate(d.date),
  }));

  return (
    <ChartWrapper
      title="ADX (Síla trendu)"
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
            <XAxis
              dataKey="dateFormatted"
              tick={{ fill: COLORS.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: COLORS.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              orientation="right"
              width={35}
              ticks={[0, 25, 50, 75, 100]}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Strong trend zone */}
            <ReferenceArea
              y1={STRONG_TREND_THRESHOLD}
              y2={100}
              fill={COLORS.strongTrend}
              fillOpacity={1}
            />

            {/* Threshold line */}
            <ReferenceLine
              y={STRONG_TREND_THRESHOLD}
              stroke={COLORS.reference}
              strokeDasharray="4 4"
            />

            {/* +DI Line (bullish) */}
            <Line
              type="monotone"
              dataKey="plusDI"
              stroke={COLORS.plusDI}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />

            {/* -DI Line (bearish) */}
            <Line
              type="monotone"
              dataKey="minusDI"
              stroke={COLORS.minusDI}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />

            {/* ADX Line (trend strength) */}
            <Line
              type="monotone"
              dataKey="adx"
              stroke={COLORS.adx}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
