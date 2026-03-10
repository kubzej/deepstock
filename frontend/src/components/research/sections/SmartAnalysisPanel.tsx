import { useState } from 'react';
import {
  ChevronDown,
  X,
  Check,
  Info,
  BarChart2,
  TrendingUp,
} from 'lucide-react';
import type { StockInfo } from '@/lib/api';

interface Insight {
  type: 'positive' | 'warning' | 'info';
  title: string;
  description: string;
}

type Verdict = 'explore' | 'watch' | 'mixed' | 'skip';

const VERDICT_CONFIG: Record<
  Verdict,
  { label: string; colorClass: string; bgClass: string }
> = {
  explore: {
    label: 'Stojí za průzkum',
    colorClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50',
  },
  watch: {
    label: 'Sleduj, čekej',
    colorClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
  },
  mixed: {
    label: 'Smíšené signály',
    colorClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
  },
  skip: {
    label: 'Přeskoč',
    colorClass: 'text-rose-700',
    bgClass: 'bg-rose-50',
  },
};

type ValuationSignal =
  | 'undervalued'
  | 'slightly_undervalued'
  | 'fair'
  | 'slightly_overvalued'
  | 'overvalued'
  | 'hold'
  | null;

function valuationLabel(signal: ValuationSignal): {
  text: string;
  colorClass: string;
} {
  switch (signal) {
    case 'undervalued':
      return { text: 'Podhodnocená', colorClass: 'text-emerald-600' };
    case 'slightly_undervalued':
      return { text: 'Mírně podhodnocená', colorClass: 'text-emerald-500' };
    case 'fair':
      return { text: 'Férová cena', colorClass: 'text-zinc-500' };
    case 'slightly_overvalued':
      return { text: 'Mírně nadhodnocená', colorClass: 'text-amber-500' };
    case 'overvalued':
      return { text: 'Nadhodnocená', colorClass: 'text-rose-600' };
    case 'hold':
      return { text: 'Neutrální', colorClass: 'text-zinc-500' };
    default:
      return { text: 'Bez dat', colorClass: 'text-zinc-400' };
  }
}

function hasHighGrowthPotential(data: StockInfo): boolean {
  let signals = 0;

  // Signal 1: Composite upside > 30%
  const compositeUpside = data.valuation?.composite?.upside;
  if (compositeUpside != null && compositeUpside > 30) signals++;

  // Signal 2: Analyst target upside > 25% (min 5 analysts)
  if (data.targetMeanPrice && data.price && data.price > 0) {
    const analystUpside =
      ((data.targetMeanPrice - data.price) / data.price) * 100;
    const analystCount = data.numberOfAnalystOpinions ?? 0;
    if (analystUpside > 25 && analystCount >= 5) signals++;
  }

  // Signal 3: Strong growth momentum (revenue OR earnings > 20%)
  const revGrowth = data.revenueGrowth;
  const earnGrowth = data.earningsGrowth;
  if (
    (revGrowth != null && revGrowth > 0.2) ||
    (earnGrowth != null && earnGrowth > 0.2)
  ) {
    signals++;
  }

  return signals >= 2;
}

function computeVerdict(
  insights: Insight[],
  valuationSignal: ValuationSignal,
  data: StockInfo,
): Verdict {
  const warnings = insights.filter((i) => i.type === 'warning').length;
  const positives = insights.filter((i) => i.type === 'positive').length;

  const isUndervalued =
    valuationSignal === 'undervalued' ||
    valuationSignal === 'slightly_undervalued';
  const isOvervalued =
    valuationSignal === 'overvalued' ||
    valuationSignal === 'slightly_overvalued';
  const highGrowth = hasHighGrowthPotential(data);

  // Skip: výrazně negativní
  if (warnings >= 3 && isOvervalued) return 'skip';
  if (warnings > positives + 2) return 'skip';

  // Explore: kvalitní + podhodnocená NEBO silný růstový potenciál
  if (positives >= 3 && (isUndervalued || valuationSignal === 'fair'))
    return 'explore';
  if (positives > warnings && isUndervalued) return 'explore';
  if (highGrowth && positives >= warnings && !isOvervalued) return 'explore';

  // Watch
  if (isOvervalued && warnings <= positives) return 'watch';
  if (valuationSignal === 'fair' || valuationSignal === null) return 'watch';

  return 'mixed';
}

function getTechnicalNote(data: StockInfo): string | null {
  const { price, fiftyTwoWeekHigh, fiftyTwoWeekLow } = data;
  if (!price || !fiftyTwoWeekHigh || !fiftyTwoWeekLow) return null;

  const range = fiftyTwoWeekHigh - fiftyTwoWeekLow;
  if (range <= 0) return null;

  const position = ((price - fiftyTwoWeekLow) / range) * 100;
  const pctFromHigh = ((fiftyTwoWeekHigh - price) / fiftyTwoWeekHigh) * 100;
  const pctFromLow = ((price - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100;

  if (position <= 20) {
    return `Technika: cena je ${pctFromLow.toFixed(0)} % nad 52týdenním minimem — blízko dna pásma`;
  }
  if (position >= 80) {
    return `Technika: cena je ${pctFromHigh.toFixed(0)} % pod 52týdenním maximem — blízko vrcholu pásma`;
  }
  return `Technika: cena je ve středu 52týdenního pásma (${position.toFixed(0)} % od dna)`;
}

const INSIGHT_STYLE: Record<
  Insight['type'],
  { icon: React.ElementType; iconClass: string; bgClass: string }
> = {
  warning: { icon: X, iconClass: 'text-rose-500', bgClass: 'bg-rose-500/10' },
  positive: {
    icon: Check,
    iconClass: 'text-emerald-500',
    bgClass: 'bg-emerald-500/10',
  },
  info: { icon: Info, iconClass: 'text-zinc-400', bgClass: 'bg-zinc-400/10' },
};

function InsightGroup({ items }: { items: Insight[] }) {
  if (items.length === 0) return null;
  return (
    <>
      {items.map((insight, i) => {
        const { icon: Icon, iconClass, bgClass } = INSIGHT_STYLE[insight.type];
        return (
          <div key={i} className="flex gap-2.5">
            <div
              className={`mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center ${bgClass}`}
            >
              <Icon className={`w-3 h-3 ${iconClass}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {insight.title}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                {insight.description}
              </p>
            </div>
          </div>
        );
      })}
    </>
  );
}

interface SmartAnalysisPanelProps {
  data: StockInfo;
}

export function SmartAnalysisPanel({ data }: SmartAnalysisPanelProps) {
  const [open, setOpen] = useState(true);

  const insights: Insight[] = data.insights ?? [];
  if (insights.length === 0 && !data.valuation) return null;

  const composite = data.valuation?.composite ?? null;
  const valuationSignal = composite?.signal ?? null;
  const modelsUsed = composite?.modelsUsed ?? 0;
  const valLabel = valuationLabel(valuationSignal);

  const verdict = computeVerdict(insights, valuationSignal, data);
  const vc = VERDICT_CONFIG[verdict];

  const warnings = insights.filter((i) => i.type === 'warning');
  const positives = insights.filter((i) => i.type === 'positive');
  const infos = insights.filter((i) => i.type === 'info');

  const technicalNote = getTechnicalNote(data);

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Smart analýza
          </span>
          <span
            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${vc.colorClass} ${vc.bgClass}`}
          >
            {vc.label}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Body */}
      {open && (
        <div className="px-5 pb-5 pt-4 space-y-5">
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Rizika
              </p>
              <div className="grid gap-x-8 gap-y-3 md:grid-cols-2 lg:grid-cols-3">
                <InsightGroup items={warnings} />
              </div>
            </div>
          )}

          {/* Positives */}
          {positives.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Pozitiva
              </p>
              <div className="grid gap-x-8 gap-y-3 md:grid-cols-2 lg:grid-cols-3">
                <InsightGroup items={positives} />
              </div>
            </div>
          )}

          {/* Info */}
          {infos.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Ostatní
              </p>
              <div className="grid gap-x-8 gap-y-3 md:grid-cols-2 lg:grid-cols-3">
                <InsightGroup items={infos} />
              </div>
            </div>
          )}

          {/* Valuation */}
          {composite && modelsUsed > 0 && (
            <div className="flex gap-2.5">
              <div className="mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center bg-zinc-400/10">
                <BarChart2 className="w-3 h-3 text-zinc-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Valuace:{' '}
                  <span className={valLabel.colorClass}>{valLabel.text}</span>
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                  Kompozitní signál z {modelsUsed} valuačních modelů (DCF, P/E
                  peers, DDM…)
                </p>
              </div>
            </div>
          )}

          {/* Technical note */}
          {technicalNote && (
            <div className="flex gap-2.5">
              <div className="mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center bg-zinc-400/10">
                <TrendingUp className="w-3 h-3 text-zinc-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Pozice v pásmu
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                  {technicalNote.replace('Technika: cena je ', '')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
