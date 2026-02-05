/**
 * MACDChart - Moving Average Convergence Divergence
 * Shows momentum and trend direction
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
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

interface MACDChartProps {
  ticker: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const COLORS = {
  macd: 'rgb(99 102 241)', // indigo-500
  signal: 'rgb(249 115 22)', // orange-500
  histogramPositive: 'rgb(16 185 129)', // emerald-500
  histogramNegative: 'rgb(244 63 94)', // rose-500
  axis: 'hsl(var(--muted-foreground))',
  zero: 'rgba(113, 113, 122, 0.3)',
};

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

function getSignalType(macdTrend: IndicatorSignalType): SignalType {
  if (macdTrend === 'bullish') return 'bullish';
  if (macdTrend === 'bearish') return 'bearish';
  return 'neutral';
}

function getEvaluation(
  macd: number | null,
  macdSignal: number | null,
  macdHistogram: number | null,
  macdTrend: IndicatorSignalType,
): string {
  if (macd === null || macdSignal === null) {
    return 'Nedostatek dat pro výpočet MACD.';
  }

  const histogramText =
    macdHistogram !== null
      ? macdHistogram > 0
        ? 'Histogram je kladný - momentum sílí.'
        : 'Histogram je záporný - momentum slábne.'
      : '';

  if (macdTrend === 'bullish') {
    if (macd > 0 && macdSignal > 0) {
      return `Býčí trend. MACD (${macd.toFixed(2)}) je nad signální linií (${macdSignal.toFixed(2)}) v kladném pásmu. ${histogramText}`;
    }
    return `Býčí signál. MACD překřížilo signální linii směrem nahoru. ${histogramText}`;
  }

  if (macdTrend === 'bearish') {
    if (macd < 0 && macdSignal < 0) {
      return `Medvědí trend. MACD (${macd.toFixed(2)}) je pod signální linií (${macdSignal.toFixed(2)}) v záporném pásmu. ${histogramText}`;
    }
    return `Medvědí signál. MACD překřížilo signální linii směrem dolů. ${histogramText}`;
  }

  return `Neutrální. MACD a signální linie jsou blízko sebe. Sledujte další vývoj.`;
}

// ============================================================
// TOOLTIP CONTENT
// ============================================================

const tooltipExplanation = (
  <div className="space-y-2">
    <p className="font-medium">MACD (Moving Average Convergence Divergence)</p>
    <p>Indikátor momentum a trendu založený na rozdílu klouzavých průměrů.</p>
    <div className="pt-2 space-y-1">
      <p>
        <span className="text-indigo-500">MACD linie</span> - rozdíl EMA 12 a
        EMA 26
      </p>
      <p>
        <span className="text-orange-500">Signální linie</span> - EMA 9 z MACD
      </p>
      <p>
        <span className="text-emerald-500">Histogram</span> - rozdíl MACD a
        signálu
      </p>
    </div>
    <div className="pt-2 space-y-1">
      <p className="text-emerald-500">Býčí: MACD nad signálem</p>
      <p className="text-rose-500">Medvědí: MACD pod signálem</p>
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
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-lg">
      <p className="text-xs text-zinc-500 mb-2">{label}</p>
      {payload.map((entry) => {
        const labelMap: Record<string, string> = {
          macd: 'MACD',
          signal: 'Signál',
          histogram: 'Histogram',
        };
        return (
          <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-zinc-600">{labelMap[entry.dataKey]}:</span>
            <span className="font-mono text-zinc-800">
              {entry.value?.toFixed(3) ?? '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function MACDChart({ ticker }: MACDChartProps) {
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

  const { macdHistory, macd, macdSignal, macdHistogram, macdTrend } =
    technicalData;

  const signal = getSignalType(macdTrend);
  const evaluation = getEvaluation(macd, macdSignal, macdHistogram, macdTrend);

  // Format data for display with histogram colors
  const chartData = macdHistory.map((d) => ({
    ...d,
    dateFormatted: formatDate(d.date),
    histogramColor:
      d.histogram !== null && d.histogram >= 0
        ? COLORS.histogramPositive
        : COLORS.histogramNegative,
  }));

  // Calculate Y domain
  const allValues = macdHistory
    .flatMap((d) => [d.macd, d.signal, d.histogram])
    .filter((v): v is number => v !== null);
  const maxAbs = Math.max(...allValues.map(Math.abs)) * 1.1;

  return (
    <ChartWrapper
      title="MACD"
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
              domain={[-maxAbs, maxAbs]}
              tick={{ fill: COLORS.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              orientation="right"
              width={50}
              tickFormatter={(v) => v.toFixed(2)}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Zero line */}
            <ReferenceLine y={0} stroke={COLORS.zero} />

            {/* Histogram bars */}
            <Bar
              dataKey="histogram"
              fill={COLORS.histogramPositive}
              isAnimationActive={false}
              // Dynamic fill based on value
              shape={(props) => {
                const { x, y, width, height, payload } = props as {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                  payload?: { histogram: number | null };
                };
                const fill =
                  payload?.histogram !== null &&
                  payload?.histogram !== undefined &&
                  payload.histogram >= 0
                    ? COLORS.histogramPositive
                    : COLORS.histogramNegative;
                return (
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={fill}
                    opacity={0.6}
                  />
                );
              }}
            />

            {/* MACD Line */}
            <Line
              type="monotone"
              dataKey="macd"
              stroke={COLORS.macd}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />

            {/* Signal Line */}
            <Line
              type="monotone"
              dataKey="signal"
              stroke={COLORS.signal}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
