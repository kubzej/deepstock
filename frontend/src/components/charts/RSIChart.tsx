/**
 * RSIChart - Relative Strength Index gauge meter
 * Shows overbought/oversold conditions with visual indicator
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartWrapper, type SignalType } from './ChartWrapper';
import { fetchTechnicalIndicators, type TechnicalPeriod } from '@/lib/api';

// ============================================================
// TYPES
// ============================================================

interface RSIChartProps {
  ticker: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const RSI_OVERBOUGHT = 70;
const RSI_OVERSOLD = 30;

// ============================================================
// HELPERS
// ============================================================

function getSignalType(rsi: number | null): SignalType {
  if (rsi === null) return 'neutral';
  if (rsi >= RSI_OVERBOUGHT) return 'bearish';
  if (rsi <= RSI_OVERSOLD) return 'bullish';
  return 'neutral';
}

function getEvaluation(rsi: number | null): string {
  if (rsi === null) {
    return 'Nedostatek dat pro výpočet RSI.';
  }

  if (rsi >= 80) {
    return `RSI na ${rsi.toFixed(1)} - silně překoupeno. Vysoké riziko korekce, zvažte realizaci zisků.`;
  }
  if (rsi >= RSI_OVERBOUGHT) {
    return `RSI na ${rsi.toFixed(1)} - překoupeno. Cena může být krátkodobě přehnaná, buďte opatrní s novými nákupy.`;
  }
  if (rsi <= 20) {
    return `RSI na ${rsi.toFixed(1)} - silně přeprodáno. Může být dobrá příležitost k nákupu, ale ověřte fundamenty.`;
  }
  if (rsi <= RSI_OVERSOLD) {
    return `RSI na ${rsi.toFixed(1)} - přeprodáno. Potenciální nákupní příležitost, sledujte obrat.`;
  }
  if (rsi >= 50) {
    return `RSI na ${rsi.toFixed(1)} - neutrální s bullish nádechem. Momentum je mírně pozitivní.`;
  }
  return `RSI na ${rsi.toFixed(1)} - neutrální s bearish nádechem. Momentum je mírně negativní.`;
}

// ============================================================
// TOOLTIP CONTENT
// ============================================================

const tooltipExplanation = (
  <div className="space-y-2">
    <p className="font-medium">RSI (Relative Strength Index)</p>
    <p>Oscilátor měřící sílu a rychlost cenových změn na škále 0-100.</p>
    <div className="pt-2 space-y-1">
      <p className="text-rose-500">Nad 70: Překoupeno (riziko poklesu)</p>
      <p className="text-emerald-500">Pod 30: Přeprodáno (potenciál růstu)</p>
      <p className="text-zinc-500">30-70: Neutrální zóna</p>
    </div>
  </div>
);

// ============================================================
// RSI GAUGE COMPONENT
// ============================================================

function RSIGauge({ value }: { value: number | null }) {
  const position = value !== null ? Math.max(0, Math.min(100, value)) : 50;

  return (
    <div className="space-y-4">
      {/* Gauge bar */}
      <div className="relative">
        {/* Gradient bar with smooth transition */}
        <div
          className="h-10 rounded-full"
          style={{
            background:
              'linear-gradient(to right, #10b981 0%, #10b981 15%, #86efac 25%, #e5e7eb 40%, #e5e7eb 60%, #fca5a5 75%, #ef4444 85%, #ef4444 100%)',
          }}
        />

        {/* Zone labels on the bar */}
        <div className="absolute inset-0 flex">
          <div className="flex-[30] flex items-center justify-center">
            <span className="text-xs font-medium text-white drop-shadow">
              Přeprodáno
            </span>
          </div>
          <div className="flex-[40] flex items-center justify-center">
            <span className="text-xs font-medium text-zinc-600">Neutrální</span>
          </div>
          <div className="flex-[30] flex items-center justify-center">
            <span className="text-xs font-medium text-white drop-shadow">
              Překoupeno
            </span>
          </div>
        </div>

        {/* Indicator */}
        {value !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-300"
            style={{ left: `${position}%` }}
          >
            <div className="w-10 h-10 rounded-full bg-white border-2 border-zinc-300 shadow-lg flex items-center justify-center">
              <span className="text-xs font-bold text-zinc-800">
                {value.toFixed(0)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Scale numbers */}
      <div className="flex justify-between text-xs text-zinc-500 px-1">
        <span>0</span>
        <span>30</span>
        <span>70</span>
        <span>100</span>
      </div>

      {/* Zone explanations */}
      <div className="grid grid-cols-3 gap-4 pt-2">
        <div className="text-center">
          <p className="text-sm font-medium text-emerald-600">
            &lt;30 Přeprodáno
          </p>
          <p className="text-xs text-zinc-500">Možný odraz</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-700">30-70 Neutrální</p>
          <p className="text-xs text-zinc-500">Normální momentum</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-rose-600">&gt;70 Překoupeno</p>
          <p className="text-xs text-zinc-500">Možný pokles</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function RSIChart({ ticker }: RSIChartProps) {
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
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const currentRsi = technicalData.rsi14;
  const signal = getSignalType(currentRsi);
  const evaluation = getEvaluation(currentRsi);

  return (
    <ChartWrapper
      title="RSI (Relative Strength Index)"
      tooltipContent={tooltipExplanation}
      signal={signal}
      evaluation={evaluation}
      period={period}
      onPeriodChange={setPeriod}
    >
      <div className="bg-white rounded-lg p-6">
        <RSIGauge value={currentRsi} />
      </div>
    </ChartWrapper>
  );
}
