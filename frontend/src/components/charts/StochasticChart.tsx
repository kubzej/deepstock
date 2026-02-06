/**
 * StochasticChart - Stochastic Oscillator
 * Shows momentum with %K and %D lines (0-100 scale)
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

interface StochasticChartProps {
  ticker: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const COLORS = {
  kLine: 'rgb(99 102 241)', // indigo-500
  dLine: 'rgb(249 115 22)', // orange-500
  overbought: 'rgba(244, 63, 94, 0.1)', // rose-500 light
  oversold: 'rgba(16, 185, 129, 0.1)', // emerald-500 light
  axis: 'hsl(var(--muted-foreground))',
  reference: 'rgba(113, 113, 122, 0.3)',
};

const OVERBOUGHT = 80;
const OVERSOLD = 20;

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

function getSignalType(stochasticSignal: IndicatorSignalType): SignalType {
  if (stochasticSignal === 'oversold') return 'bullish';
  if (stochasticSignal === 'overbought') return 'bearish';
  return 'neutral';
}

function getEvaluation(
  stochasticSignal: IndicatorSignalType,
  stochasticK: number | null,
  stochasticD: number | null,
): string {
  if (stochasticK === null || stochasticD === null) {
    return 'Nedostatek dat pro výpočet Stochastic.';
  }

  const crossover = stochasticK > stochasticD ? 'nad' : 'pod';

  if (stochasticSignal === 'overbought') {
    if (stochasticK < stochasticD) {
      return `Stochastic v překoupené zóně (%K: ${stochasticK.toFixed(1)}, %D: ${stochasticD.toFixed(1)}). %K překřížilo %D dolů - možný prodejní signál.`;
    }
    return `Stochastic v překoupené zóně (%K: ${stochasticK.toFixed(1)}). Zvýšené riziko korekce, ale trend může pokračovat.`;
  }

  if (stochasticSignal === 'oversold') {
    if (stochasticK > stochasticD) {
      return `Stochastic v přeprodané zóně (%K: ${stochasticK.toFixed(1)}, %D: ${stochasticD.toFixed(1)}). %K překřížilo %D nahoru - možný nákupní signál.`;
    }
    return `Stochastic v přeprodané zóně (%K: ${stochasticK.toFixed(1)}). Potenciální příležitost k nákupu.`;
  }

  return `Stochastic v neutrální zóně (%K: ${stochasticK.toFixed(1)} ${crossover} %D: ${stochasticD.toFixed(1)}). Sledujte průraz do extrémních zón.`;
}

// ============================================================
// TOOLTIP CONTENT
// ============================================================

const tooltipExplanation = (
  <div className="space-y-2">
    <p className="font-medium">Stochastic Oscillator</p>
    <p>Oscilátor porovnávající zavírací cenu s cenovým rozpětím za období.</p>
    <div className="pt-2 space-y-1">
      <p>
        <span className="text-indigo-500">%K</span> - rychlá linie (14 period)
      </p>
      <p>
        <span className="text-orange-500">%D</span> - signální linie (3-per. SMA
        z %K)
      </p>
    </div>
    <div className="pt-2 space-y-1">
      <p className="text-rose-500">Nad 80: Překoupeno</p>
      <p className="text-emerald-500">Pod 20: Přeprodáno</p>
      <p className="text-zinc-500">Křížení %K a %D = signál</p>
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
            {entry.dataKey === 'k' ? '%K' : '%D'}:
          </span>
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

export function StochasticChart({ ticker }: StochasticChartProps) {
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

  const { stochasticHistory, stochasticSignal, stochasticK, stochasticD } =
    technicalData;

  const signal = getSignalType(stochasticSignal);
  const evaluation = getEvaluation(stochasticSignal, stochasticK, stochasticD);

  // Format data for display
  const chartData = stochasticHistory.map((d) => ({
    ...d,
    dateFormatted: formatDate(d.date),
  }));

  return (
    <ChartWrapper
      title="Stochastic Oscillator"
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
              ticks={[0, 20, 50, 80, 100]}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Overbought zone */}
            <ReferenceArea
              y1={OVERBOUGHT}
              y2={100}
              fill={COLORS.overbought}
              fillOpacity={1}
            />

            {/* Oversold zone */}
            <ReferenceArea
              y1={0}
              y2={OVERSOLD}
              fill={COLORS.oversold}
              fillOpacity={1}
            />

            {/* Reference lines */}
            <ReferenceLine y={OVERBOUGHT} stroke={COLORS.reference} />
            <ReferenceLine y={OVERSOLD} stroke={COLORS.reference} />
            <ReferenceLine
              y={50}
              stroke={COLORS.reference}
              strokeDasharray="4 4"
            />

            {/* %K Line (fast) */}
            <Line
              type="monotone"
              dataKey="k"
              stroke={COLORS.kLine}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />

            {/* %D Line (slow/signal) */}
            <Line
              type="monotone"
              dataKey="d"
              stroke={COLORS.dLine}
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
