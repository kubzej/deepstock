/**
 * VolumeChart - Volume Analysis with average
 * Shows trading volume bars with moving average line
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart,
  Bar,
  Line,
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

interface VolumeChartProps {
  ticker: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const COLORS = {
  volumeAbove: 'rgb(16 185 129)', // emerald-500
  volumeBelow: 'rgb(161 161 170)', // zinc-400
  average: 'rgb(249 115 22)', // orange-500
  axis: 'hsl(var(--muted-foreground))',
};

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

function formatVolume(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return value.toString();
}

function getSignalType(volumeSignal: IndicatorSignalType): SignalType {
  if (volumeSignal === 'high') return 'bullish';
  if (volumeSignal === 'low') return 'bearish';
  return 'neutral';
}

function getEvaluation(
  volumeSignal: IndicatorSignalType,
  currentVolume: number | null,
  avgVolume: number | null,
  volumeChange: number | null,
): string {
  if (currentVolume === null || avgVolume === null) {
    return 'Nedostatek dat pro analýzu objemu.';
  }

  const volFormatted = formatVolume(currentVolume);
  const avgFormatted = formatVolume(avgVolume);
  const changeText =
    volumeChange !== null
      ? volumeChange >= 0
        ? `+${volumeChange.toFixed(0)}%`
        : `${volumeChange.toFixed(0)}%`
      : '';

  if (volumeSignal === 'high' || (volumeChange && volumeChange > 50)) {
    return `Vysoký objem (${volFormatted}, ${changeText} vs průměr ${avgFormatted}). Zvýšený zájem investorů, může signalizovat významný pohyb.`;
  }
  if (volumeSignal === 'low' || (volumeChange && volumeChange < -50)) {
    return `Nízký objem (${volFormatted}, ${changeText} vs průměr ${avgFormatted}). Slabý zájem, pohyby ceny mohou být méně spolehlivé.`;
  }

  return `Průměrný objem (${volFormatted}, ${changeText} vs průměr ${avgFormatted}). Normální aktivita na trhu.`;
}

// ============================================================
// TOOLTIP CONTENT
// ============================================================

const tooltipExplanation = (
  <div className="space-y-2">
    <p className="font-medium">Analýza objemu</p>
    <p>Objem obchodů ukazuje zájem a sílu cenových pohybů.</p>
    <div className="pt-2 space-y-1">
      <p>
        <span className="text-emerald-500">Zelené sloupce</span> - objem nad
        průměrem
      </p>
      <p>
        <span className="text-zinc-400">Šedé sloupce</span> - objem pod průměrem
      </p>
      <p>
        <span className="text-orange-500">Oranžová linie</span> - 20denní průměr
      </p>
    </div>
    <div className="pt-2 space-y-1">
      <p className="text-emerald-500">Vysoký objem = silný signál</p>
      <p className="text-zinc-500">Nízký objem = slabý signál</p>
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
            {entry.dataKey === 'volume' ? 'Objem' : 'Průměr'}:
          </span>
          <span className="font-mono-price text-zinc-800">
            {formatVolume(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function VolumeChart({ ticker }: VolumeChartProps) {
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

  const {
    volumeHistory,
    volumeSignal,
    currentVolume,
    avgVolume20,
    volumeChange,
  } = technicalData;

  const signal = getSignalType(volumeSignal);
  const evaluation = getEvaluation(
    volumeSignal,
    currentVolume,
    avgVolume20,
    volumeChange,
  );

  // Format data for display
  const chartData = volumeHistory.map((d) => ({
    ...d,
    dateFormatted: formatDate(d.date),
  }));

  // Calculate max for Y domain
  const maxVolume = Math.max(
    ...volumeHistory.map((d) => Math.max(d.volume, d.avgVolume || 0)),
  );

  return (
    <ChartWrapper
      title="Analýza objemu"
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
              domain={[0, maxVolume * 1.1]}
              tick={{ fill: COLORS.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              orientation="right"
              width={50}
              tickFormatter={formatVolume}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Volume bars with dynamic color */}
            <Bar
              dataKey="volume"
              fill={COLORS.volumeAbove}
              isAnimationActive={false}
              shape={(props) => {
                const { x, y, width, height, payload } = props as {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                  payload?: { isAboveAvg: boolean };
                };
                const fill = payload?.isAboveAvg
                  ? COLORS.volumeAbove
                  : COLORS.volumeBelow;
                return (
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={fill}
                    opacity={0.7}
                  />
                );
              }}
            />

            {/* Average volume line */}
            <Line
              type="monotone"
              dataKey="avgVolume"
              stroke={COLORS.average}
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
