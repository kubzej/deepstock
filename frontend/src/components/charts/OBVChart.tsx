/**
 * OBVChart - On-Balance Volume
 * Shows cumulative volume flow to confirm trends
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
  type IndicatorSignalType,
  type TechnicalPeriod,
} from '@/lib/api';

// ============================================================
// TYPES
// ============================================================

interface OBVChartProps {
  ticker: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const COLORS = {
  obv: 'rgb(16 185 129)', // emerald-500
  obvFill: 'rgba(16, 185, 129, 0.1)',
  sma: 'rgb(249 115 22)', // orange-500
  axis: 'hsl(var(--muted-foreground))',
};

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

function formatOBV(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(1)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(1)}M`;
  }
  if (absValue >= 1_000) {
    return `${sign}${(absValue / 1_000).toFixed(0)}K`;
  }
  return value.toString();
}

function getSignalType(
  obvTrend: IndicatorSignalType,
  obvDivergence: IndicatorSignalType,
): SignalType {
  // Divergence is more important signal
  if (obvDivergence === 'bullish') return 'bullish';
  if (obvDivergence === 'bearish') return 'bearish';
  // Fall back to trend
  if (obvTrend === 'bullish') return 'bullish';
  if (obvTrend === 'bearish') return 'bearish';
  return 'neutral';
}

function getEvaluation(
  obvTrend: IndicatorSignalType,
  obvDivergence: IndicatorSignalType,
  obv: number | null,
): string {
  if (obv === null) {
    return 'Nedostatek dat pro výpočet OBV.';
  }

  const obvFormatted = formatOBV(obv);

  if (obvDivergence === 'bullish') {
    return `Bullish divergence! OBV (${obvFormatted}) roste, zatímco cena klesá. Možný signál obratu nahoru.`;
  }
  if (obvDivergence === 'bearish') {
    return `Bearish divergence! OBV (${obvFormatted}) klesá, zatímco cena roste. Možný signál obratu dolů.`;
  }

  if (obvTrend === 'bullish') {
    return `OBV (${obvFormatted}) roste - akumulace. Velcí investoři nakupují, pozitivní signál pro trend.`;
  }
  if (obvTrend === 'bearish') {
    return `OBV (${obvFormatted}) klesá - distribuce. Velcí investoři prodávají, negativní signál pro trend.`;
  }

  return `OBV (${obvFormatted}) je stabilní. Žádný jasný signál akumulace nebo distribuce.`;
}

// ============================================================
// TOOLTIP CONTENT
// ============================================================

const tooltipExplanation = (
  <div className="space-y-2">
    <p className="font-medium">OBV (On-Balance Volume)</p>
    <p>Kumulativní objem ukazující tok peněz do/z akcie.</p>
    <div className="pt-2 space-y-1">
      <p>
        <span className="text-emerald-500">OBV</span> - kumulativní objem
      </p>
      <p>
        <span className="text-orange-500">SMA</span> - klouzavý průměr OBV
      </p>
    </div>
    <div className="pt-2 space-y-1">
      <p className="text-emerald-500">Rostoucí OBV = akumulace (nákupy)</p>
      <p className="text-rose-500">Klesající OBV = distribuce (prodeje)</p>
      <p className="text-amber-500">Divergence = možný obrat trendu</p>
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
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-zinc-600">
            {entry.dataKey === 'obv' ? 'OBV' : 'SMA'}:
          </span>
          <span className="font-mono-price text-zinc-800">
            {formatOBV(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function OBVChart({ ticker }: OBVChartProps) {
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

  const { obvHistory, obvTrend, obvDivergence, obv } = technicalData;

  const signal = getSignalType(obvTrend, obvDivergence);
  const evaluation = getEvaluation(obvTrend, obvDivergence, obv);

  // Format data for display
  const chartData = obvHistory.map((d) => ({
    ...d,
    dateFormatted: formatDate(d.date),
  }));

  // Calculate Y domain
  const allValues = obvHistory
    .flatMap((d) => [d.obv, d.obvSma])
    .filter((v): v is number => v !== null);
  const maxObv = Math.max(...allValues);
  const minObv = Math.min(...allValues);
  const padding = (maxObv - minObv) * 0.1;

  return (
    <ChartWrapper
      title="OBV (On-Balance Volume)"
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
              <linearGradient id="obvGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.obv} stopOpacity={0.15} />
                <stop offset="100%" stopColor={COLORS.obv} stopOpacity={0} />
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
              domain={[minObv - padding, maxObv + padding]}
              tick={{ fill: COLORS.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              orientation="right"
              width={55}
              tickFormatter={formatOBV}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* OBV area */}
            <Area
              type="monotone"
              dataKey="obv"
              stroke={COLORS.obv}
              strokeWidth={2}
              fill="url(#obvGradient)"
              isAnimationActive={false}
            />

            {/* OBV SMA line */}
            <Line
              type="monotone"
              dataKey="obvSma"
              stroke={COLORS.sma}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
