/**
 * ChartWrapper - Shared wrapper for technical indicator charts
 * Provides title, tooltip, period selector, and signal evaluation section
 */
import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import type { TechnicalPeriod } from '@/lib/api';

// ============================================================
// TYPES
// ============================================================

export type SignalType = 'bullish' | 'bearish' | 'neutral';

interface ChartWrapperProps {
  /** Chart title */
  title: string;
  /** Detailed explanation shown in tooltip */
  tooltipContent: ReactNode;
  /** The chart component */
  children: ReactNode;
  /** Current signal/evaluation */
  signal?: SignalType;
  /** Text description of current state */
  evaluation?: string;
  /** Current period */
  period: TechnicalPeriod;
  /** Period change handler */
  onPeriodChange: (period: TechnicalPeriod) => void;
}

const TIME_RANGES: { value: TechnicalPeriod; label: string }[] = [
  { value: '1w', label: '1T' },
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1R' },
  { value: '2y', label: '2R' },
];

// ============================================================
// SIGNAL BADGE
// ============================================================

function SignalBadge({ signal }: { signal: SignalType }) {
  const config = {
    bullish: {
      label: 'Býčí',
      className: 'bg-emerald-50 text-emerald-700',
    },
    bearish: {
      label: 'Medvědí',
      className: 'bg-rose-50 text-rose-700',
    },
    neutral: {
      label: 'Neutrální',
      className: 'bg-zinc-100 text-zinc-600',
    },
  };

  const { label, className } = config[signal];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

// ============================================================
// EVALUATION BOX
// ============================================================

function EvaluationBox({
  signal,
  evaluation,
}: {
  signal?: SignalType;
  evaluation?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-white p-3">
      {signal && <SignalBadge signal={signal} />}
      {evaluation && (
        <p className="text-sm text-zinc-600 leading-relaxed">{evaluation}</p>
      )}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ChartWrapper({
  title,
  tooltipContent,
  children,
  signal,
  evaluation,
  period,
  onPeriodChange,
}: ChartWrapperProps) {
  return (
    <div className="space-y-3">
      {/* Header with title, tooltip and period selector */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-800">
            {title}
          </h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs text-left">
              {tooltipContent}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Period selector */}
        <PillGroup>
          {TIME_RANGES.map((range) => (
            <PillButton
              key={range.value}
              active={period === range.value}
              onClick={() => onPeriodChange(range.value)}
              size="xs"
            >
              {range.label}
            </PillButton>
          ))}
        </PillGroup>
      </div>

      {/* Chart */}
      <div>{children}</div>

      {/* Evaluation section */}
      {(signal || evaluation) && (
        <EvaluationBox signal={signal} evaluation={evaluation} />
      )}
    </div>
  );
}
