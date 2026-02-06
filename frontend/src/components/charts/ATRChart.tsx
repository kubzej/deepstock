/**
 * ATRChart - Average True Range (Volatility)
 * Shows volatility measurement over time
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
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

interface ATRChartProps {
  ticker: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const COLORS = {
  atr: 'rgb(168 85 247)', // purple-500
  atrFill: 'rgba(168, 85, 247, 0.15)',
  axis: 'hsl(var(--muted-foreground))',
};

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

function getSignalType(atrSignal: IndicatorSignalType): SignalType {
  if (atrSignal === 'high') return 'bearish'; // High volatility = caution
  if (atrSignal === 'low') return 'bullish'; // Low volatility = stable
  return 'neutral';
}

function getEvaluation(
  atrSignal: IndicatorSignalType,
  atr14: number | null,
  atrPercent: number | null,
): string {
  if (atr14 === null || atrPercent === null) {
    return 'Nedostatek dat pro výpočet ATR.';
  }

  const atrText = atr14.toFixed(2);
  const percentText = atrPercent.toFixed(1);

  if (atrSignal === 'high' || atrPercent > 5) {
    return `Vysoká volatilita (ATR: ${atrText}, ${percentText}% ceny). Očekávejte větší cenové výkyvy, používejte širší stop-loss.`;
  }
  if (atrSignal === 'low' || atrPercent < 1) {
    return `Nízká volatilita (ATR: ${atrText}, ${percentText}% ceny). Klidný trh, možná příprava na průraz.`;
  }

  return `Průměrná volatilita (ATR: ${atrText}, ${percentText}% ceny). Normální tržní podmínky.`;
}

// ============================================================
// TOOLTIP CONTENT
// ============================================================

const tooltipExplanation = (
  <div className="space-y-2">
    <p className="font-medium">ATR (Average True Range)</p>
    <p>Měří průměrnou volatilitu za posledních 14 dní.</p>
    <div className="pt-2 space-y-1">
      <p>
        <span className="text-purple-500">ATR</span> - průměrné denní rozpětí
        ceny
      </p>
      <p>
        <span className="text-purple-400">ATR %</span> - volatilita jako % ceny
      </p>
    </div>
    <div className="pt-2 space-y-1">
      <p className="text-rose-500">Vysoké ATR = větší riziko</p>
      <p className="text-emerald-500">Nízké ATR = stabilní trh</p>
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
  payload: { atr: number | null };
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

  const atrPercent = payload[0]?.value;
  const atrAbsolute = payload[0]?.payload?.atr;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-lg">
      <p className="text-xs text-zinc-500 mb-2">{label}</p>
      <div className="flex items-center gap-2 text-sm">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: COLORS.atr }}
        />
        <span className="text-zinc-600">ATR %:</span>
        <span className="font-mono-price text-zinc-800">
          {atrPercent?.toFixed(2) ?? '—'}%
        </span>
      </div>
      {atrAbsolute !== null && (
        <div className="flex items-center gap-2 text-sm mt-1">
          <span className="h-2 w-2 rounded-full bg-purple-300" />
          <span className="text-zinc-600">ATR:</span>
          <span className="font-mono-price text-zinc-800">
            {atrAbsolute?.toFixed(2) ?? '—'}
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ATRChart({ ticker }: ATRChartProps) {
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

  const { atrHistory, atrSignal, atr14, atrPercent } = technicalData;

  const signal = getSignalType(atrSignal);
  const evaluation = getEvaluation(atrSignal, atr14, atrPercent);

  // Format data for display
  const chartData = atrHistory.map((d) => ({
    ...d,
    dateFormatted: formatDate(d.date),
  }));

  // Calculate Y domain for ATR %
  const atrPercentValues = atrHistory
    .map((d) => d.atrPercent)
    .filter((v): v is number => v !== null);
  const maxAtrPercent = Math.max(...atrPercentValues) * 1.1;
  const minAtrPercent = Math.min(...atrPercentValues) * 0.9;

  return (
    <ChartWrapper
      title="ATR (Volatilita)"
      tooltipContent={tooltipExplanation}
      signal={signal}
      evaluation={evaluation}
      period={period}
      onPeriodChange={setPeriod}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="atrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.atr} stopOpacity={0.2} />
                <stop offset="100%" stopColor={COLORS.atr} stopOpacity={0} />
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
              domain={[minAtrPercent, maxAtrPercent]}
              tick={{ fill: COLORS.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              orientation="right"
              width={45}
              tickFormatter={(v) => `${v.toFixed(1)}%`}
            />
            <Tooltip content={<CustomTooltip />} />

            <Area
              type="monotone"
              dataKey="atrPercent"
              stroke={COLORS.atr}
              strokeWidth={2}
              fill="url(#atrGradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
