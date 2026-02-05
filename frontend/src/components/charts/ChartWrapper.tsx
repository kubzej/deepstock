/**
 * ChartWrapper - Shared wrapper for technical indicator charts
 * Provides title, tooltip, and signal evaluation section
 */
import { ReactNode } from 'react';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
}

// ============================================================
// SIGNAL BADGE
// ============================================================

function SignalBadge({ signal }: { signal: SignalType }) {
  const config = {
    bullish: {
      label: 'Býčí',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    bearish: {
      label: 'Medvědí',
      className: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    neutral: {
      label: 'Neutrální',
      className: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    },
  };

  const { label, className } = config[signal];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
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
}: ChartWrapperProps) {
  return (
    <div className="space-y-4">
      {/* Header with title and tooltip */}
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

      {/* Chart */}
      <div>{children}</div>

      {/* Evaluation section */}
      {(signal || evaluation) && (
        <EvaluationBox signal={signal} evaluation={evaluation} />
      )}
    </div>
  );
}
