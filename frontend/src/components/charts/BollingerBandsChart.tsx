/**
 * BollingerBandsChart - Bollinger Bands volatility indicator
 * Shows price with upper, middle (SMA 20), and lower bands
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
import { getSmartDecimals } from '@/lib/format';

// ============================================================
// TYPES
// ============================================================

interface BollingerBandsChartProps {
  ticker: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const COLORS = {
  price: 'rgb(16 185 129)', // emerald-500
  bands: 'rgb(99 102 241)', // indigo-500
  bandsFill: 'rgba(99, 102, 241, 0.1)',
  middle: 'rgb(168 85 247)', // purple-500
  axis: 'hsl(var(--muted-foreground))',
};

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

function getSignalType(bollingerSignal: IndicatorSignalType): SignalType {
  if (bollingerSignal === 'bullish' || bollingerSignal === 'oversold') {
    return 'bullish';
  }
  if (bollingerSignal === 'bearish' || bollingerSignal === 'overbought') {
    return 'bearish';
  }
  return 'neutral';
}

function getEvaluation(
  bollingerSignal: IndicatorSignalType,
  bollingerPosition: number | null,
  currentPrice: number | null,
): string {
  if (bollingerPosition === null || currentPrice === null) {
    return 'Nedostatek dat pro vyhodnocení Bollinger Bands.';
  }

  // bollingerPosition is already 0-100 from backend
  const posPercent = bollingerPosition.toFixed(0);

  if (bollingerSignal === 'overbought' || bollingerPosition >= 95) {
    return `Cena u horního pásma (${posPercent}%). Možná překoupená situace, potenciální korekce dolů.`;
  }
  if (bollingerSignal === 'oversold' || bollingerPosition <= 5) {
    return `Cena u dolního pásma (${posPercent}%). Možná přeprodaná situace, potenciální odraz nahoru.`;
  }
  if (bollingerPosition >= 70) {
    return `Cena v horní části pásem (${posPercent}%). Bullish momentum, sledujte případný návrat k středu.`;
  }
  if (bollingerPosition <= 30) {
    return `Cena v dolní části pásem (${posPercent}%). Bearish tlak, sledujte podporu na dolním pásmu.`;
  }

  return `Cena uprostřed pásem (${posPercent}%). Konsolidace, čekejte na průraz.`;
}

// ============================================================
// TOOLTIP CONTENT
// ============================================================

const tooltipExplanation = (
  <div className="space-y-2">
    <p className="font-medium">Bollinger Bands</p>
    <p>Měří volatilitu a identifikuje překoupené/přeprodané úrovně.</p>
    <div className="pt-2 space-y-1">
      <p>
        <span className="text-emerald-500">Cena</span> - aktuální cenový vývoj
      </p>
      <p>
        <span className="text-indigo-400">Horní/Dolní pásmo</span> - 2
        standardní odchylky
      </p>
      <p>
        <span className="text-purple-400">Střední linie</span> - SMA 20
      </p>
    </div>
    <div className="pt-2 space-y-1">
      <p className="text-emerald-500">Cena u dolního pásma = potenciál růstu</p>
      <p className="text-rose-500">Cena u horního pásma = riziko poklesu</p>
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
    price: 'Cena',
    upper: 'Horní pásmo',
    middle: 'Střed (SMA 20)',
    lower: 'Dolní pásmo',
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

export function BollingerBandsChart({ ticker }: BollingerBandsChartProps) {
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

  const { bollingerHistory, bollingerSignal, bollingerPosition, currentPrice } =
    technicalData;

  const signal = getSignalType(bollingerSignal);
  const evaluation = getEvaluation(
    bollingerSignal,
    bollingerPosition,
    currentPrice,
  );

  // Format data for display
  const chartData = bollingerHistory.map((d) => ({
    ...d,
    dateFormatted: formatDate(d.date),
  }));

  // Calculate Y domain
  const allValues = bollingerHistory
    .flatMap((d) => [d.price, d.upper, d.lower])
    .filter((v): v is number => v !== null);
  const minPrice = Math.min(...allValues) * 0.98;
  const maxPrice = Math.max(...allValues) * 1.02;
  const smartDecimals = getSmartDecimals(allValues);

  return (
    <ChartWrapper
      title="Bollinger Bands"
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
              <linearGradient id="bandsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.bands} stopOpacity={0.15} />
                <stop
                  offset="50%"
                  stopColor={COLORS.bands}
                  stopOpacity={0.05}
                />
                <stop
                  offset="100%"
                  stopColor={COLORS.bands}
                  stopOpacity={0.15}
                />
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
              tickFormatter={(v) => v.toFixed(smartDecimals)}
              orientation="right"
              width={55}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Band fill area between upper and lower */}
            <Area
              type="monotone"
              dataKey="upper"
              stroke="transparent"
              fill="url(#bandsGradient)"
              isAnimationActive={false}
            />

            {/* Upper band */}
            <Line
              type="monotone"
              dataKey="upper"
              stroke={COLORS.bands}
              strokeWidth={1}
              strokeDasharray="4 2"
              dot={false}
              isAnimationActive={false}
            />

            {/* Middle band (SMA 20) */}
            <Line
              type="monotone"
              dataKey="middle"
              stroke={COLORS.middle}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />

            {/* Lower band */}
            <Line
              type="monotone"
              dataKey="lower"
              stroke={COLORS.bands}
              strokeWidth={1}
              strokeDasharray="4 2"
              dot={false}
              isAnimationActive={false}
            />

            {/* Price line */}
            <Line
              type="monotone"
              dataKey="price"
              stroke={COLORS.price}
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
