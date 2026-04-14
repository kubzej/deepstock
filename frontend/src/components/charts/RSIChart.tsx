/**
 * RSIChart - Relative Strength Index gauge meter
 * Shows overbought/oversold conditions with visual indicator
 */
import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartWrapper, type SignalType } from './ChartWrapper';
import { type TechnicalPeriod } from '@/lib/api';
import { useTechnicalData } from '@/hooks/useTechnicalData';

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
      <p className="text-negative">Nad 70: Překoupeno (riziko poklesu)</p>
      <p className="text-positive">Pod 30: Přeprodáno (potenciál růstu)</p>
      <p className="text-muted-foreground">30-70: Neutrální zóna</p>
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
              'linear-gradient(to right, var(--chart-positive) 0%, var(--chart-positive) 15%, var(--chart-lime) 25%, color-mix(in srgb, var(--muted) 82%, white) 40%, color-mix(in srgb, var(--muted) 82%, white) 60%, color-mix(in srgb, var(--chart-negative) 45%, white) 75%, var(--chart-negative) 85%, var(--chart-negative) 100%)',
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
            <span className="text-xs font-medium text-foreground/70">Neutrální</span>
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
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-border bg-background shadow-lg">
              <span className="text-xs font-bold text-foreground">
                {value.toFixed(0)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Scale numbers */}
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <span>0</span>
        <span>30</span>
        <span>70</span>
        <span>100</span>
      </div>

      {/* Zone explanations */}
      <div className="grid grid-cols-3 gap-4 pt-2">
        <div className="text-center">
          <p className="text-sm font-medium text-positive">
            &lt;30 Přeprodáno
          </p>
          <p className="text-xs text-muted-foreground">Možný odraz</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground/80">30-70 Neutrální</p>
          <p className="text-xs text-muted-foreground">Normální momentum</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-negative">&gt;70 Překoupeno</p>
          <p className="text-xs text-muted-foreground">Možný pokles</p>
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

  const { data: technicalData, isLoading } = useTechnicalData(ticker, period);

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
      <div className="rounded-xl border border-border/60 bg-card/80 p-6 shadow-xs">
        <RSIGauge value={currentRsi} />
      </div>
    </ChartWrapper>
  );
}
