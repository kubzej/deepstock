/**
 * ValuationSection - Displays fair value estimates from multiple models.
 * "Dumb" frontend - all calculations done on backend.
 */
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  ShieldCheck,
  ShieldAlert,
  Shield,
} from 'lucide-react';
import { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/format';
import type { StockInfo } from '@/lib/api';

type ValuationData = NonNullable<StockInfo['valuation']>;
type ValuationModel = ValuationData['models'][number];

// ── Signal labels & colors ───────────────────────────────────────────────────

const SIGNAL_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; icon: typeof TrendingUp }
> = {
  undervalued: {
    label: 'Podhodnocená',
    color: 'text-emerald-500',
    bgColor: 'bg-muted/40',
    icon: TrendingUp,
  },
  slightly_undervalued: {
    label: 'Mírně podhodnocená',
    color: 'text-emerald-500',
    bgColor: 'bg-muted/40',
    icon: TrendingUp,
  },
  fair: {
    label: 'Férově oceněná',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/40',
    icon: Minus,
  },
  slightly_overvalued: {
    label: 'Mírně nadhodnocená',
    color: 'text-rose-500',
    bgColor: 'bg-muted/40',
    icon: TrendingDown,
  },
  overvalued: {
    label: 'Nadhodnocená',
    color: 'text-rose-500',
    bgColor: 'bg-muted/40',
    icon: TrendingDown,
  },
  hold: {
    label: 'Neutrální',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/40',
    icon: Minus,
  },
};

const CONFIDENCE_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof ShieldCheck }
> = {
  high: {
    label: 'Vysoká',
    color: 'text-muted-foreground',
    icon: ShieldCheck,
  },
  medium: {
    label: 'Střední',
    color: 'text-muted-foreground/70',
    icon: Shield,
  },
  low: {
    label: 'Nízká',
    color: 'text-muted-foreground/50',
    icon: ShieldAlert,
  },
};

// ── Composite Summary ────────────────────────────────────────────────────────

function CompositeCard({
  composite,
  currentPrice,
  currency,
}: {
  composite: NonNullable<ValuationData['composite']>;
  currentPrice: number;
  currency: string;
}) {
  const signal = SIGNAL_CONFIG[composite.signal] ?? SIGNAL_CONFIG.hold;
  const SignalIcon = signal.icon;

  return (
    <div className={`rounded-lg p-5 ${signal.bgColor}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Férová hodnota
          </p>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-mono-price font-bold">
              {formatCurrency(composite.fairValue, currency)}
            </span>
            <span className="text-sm text-muted-foreground">
              vs. {formatCurrency(currentPrice, currency)}
            </span>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 ${signal.color}`}>
          <SignalIcon className="w-4 h-4" />
          <span className="text-sm">{signal.label}</span>
        </div>
      </div>

      {composite.upside !== null && (
        <div className="mt-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Potenciál</span>
              <span
                className={`font-mono-price ${composite.upside >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
              >
                {composite.upside >= 0 ? '+' : ''}
                {composite.upside.toFixed(1)}%
              </span>
            </div>
            <UpsideBar upside={composite.upside} />
          </div>
          <span className="text-xs text-muted-foreground">
            {composite.modelsUsed}{' '}
            {composite.modelsUsed === 1
              ? 'model'
              : composite.modelsUsed < 5
                ? 'modely'
                : 'modelů'}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Upside visual bar ────────────────────────────────────────────────────────

function UpsideBar({ upside }: { upside: number }) {
  // Map upside to position: -50% = 0%, 0% = 50%, +50% = 100%
  const clampedUpside = Math.max(-50, Math.min(50, upside));
  const position = ((clampedUpside + 50) / 100) * 100;

  return (
    <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 flex">
        <div className="w-1/2 bg-gradient-to-r from-rose-500/20 to-transparent" />
        <div className="w-1/2 bg-gradient-to-r from-transparent to-emerald-500/20" />
      </div>
      {/* Position indicator */}
      <div
        className="absolute top-0 bottom-0 w-1.5 rounded-full bg-foreground"
        style={{ left: `calc(${position}% - 3px)` }}
      />
    </div>
  );
}

// ── Individual Model Row ─────────────────────────────────────────────────────

function ModelRow({
  model,
  currency,
}: {
  model: ValuationModel;
  currency: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const conf = CONFIDENCE_CONFIG[model.confidence] ?? CONFIDENCE_CONFIG.low;
  const ConfIcon = conf.icon;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full py-2.5 flex items-center gap-3 hover:bg-muted/20 transition-colors text-left rounded"
      >
        {/* Method name */}
        <div className="flex-1 min-w-0">
          <span className="text-sm truncate">{model.method}</span>
        </div>

        {/* Fair value */}
        <span className="font-mono-price text-sm">
          {formatCurrency(model.fairValue, currency)}
        </span>

        {/* Upside */}
        <span
          className={`font-mono-price text-sm w-16 text-right ${model.upside >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
        >
          {model.upside >= 0 ? '+' : ''}
          {model.upside.toFixed(1)}%
        </span>

        {/* Confidence */}
        <Tooltip>
          <TooltipTrigger asChild>
            <ConfIcon className={`w-3.5 h-3.5 ${conf.color} shrink-0`} />
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Spolehlivost: {conf.label}</p>
          </TooltipContent>
        </Tooltip>
      </button>

      {expanded && (
        <div className="pb-2 pl-1 space-y-1.5">
          {model.tooltip && (
            <p className="text-xs text-muted-foreground/80 italic">
              {model.tooltip}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{model.description}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {Object.entries(model.inputs).map(([key, val]) => {
              if (val === null || val === undefined) return null;
              return (
                <span key={key} className="font-mono-price">
                  {formatInputLabel(key)}: {formatInputValue(val)}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Input formatting helpers ─────────────────────────────────────────────────

const INPUT_LABELS: Record<string, string> = {
  eps: 'EPS',
  growthRate: 'Růst',
  bondYield: 'Výnos dluhopisů',
  fcfPerShare: 'FCF/akcie',
  discountRate: 'Diskont',
  terminalGrowth: 'Terminální růst',
  epsType: 'Typ EPS',
  sectorPE: 'Sektor P/E',
  sector: 'Sektor',
  targetHigh: 'Cíl max',
  targetLow: 'Cíl min',
  numAnalysts: 'Analytiků',
  recommendation: 'Doporučení',
  bookValue: 'Účetní hodnota',
  fairPB: 'Cílový P/B',
  kvalita: 'Kvalita',
  growthPct: 'Růst zisku',
  fairPE: 'Férové P/E',
  actualPEG: 'Aktuální PEG',
  dividend: 'Dividenda',
  divGrowth: 'Růst dividendy',
  beta: 'Beta',
  evEbitda: 'EV/EBITDA',
  fairMultiple: 'Férový násobek',
  ebitda: 'EBITDA (mld)',
  costOfEquity: 'Náklad kapitálu',
};

function formatInputLabel(key: string): string {
  return INPUT_LABELS[key] ?? key;
}

function formatInputValue(val: number | string | null): string {
  if (val === null) return '—';
  if (typeof val === 'number') {
    return val % 1 === 0 ? String(val) : val.toFixed(2);
  }
  // Translate common values
  const translations: Record<string, string> = {
    forward: 'forward',
    trailing: 'trailing',
    strong_buy: 'Silný nákup',
    buy: 'Nákup',
    hold: 'Držet',
    sell: 'Prodej',
    strong_sell: 'Silný prodej',
  };
  return translations[val] ?? val;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ValuationSection({ data }: { data: StockInfo }) {
  const valuation = data.valuation;

  if (!valuation || valuation.models.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Info className="w-8 h-8 mx-auto mb-3 opacity-50" />
        <p className="text-sm">
          Pro tuto akcii není k dispozici dostatek dat pro výpočet férové
          hodnoty.
        </p>
        <p className="text-xs mt-1">
          Potřebujeme kladné EPS, cash flow nebo analytické odhady.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Composite fair value */}
      {valuation.composite && (
        <CompositeCard
          composite={valuation.composite}
          currentPrice={valuation.currentPrice}
          currency={valuation.currency}
        />
      )}

      {/* Individual models */}
      <div>
        <h4 className="text-sm font-semibold text-foreground/70 mb-2">
          Použité modely
        </h4>

        {/* Table header */}
        <div className="flex items-center gap-3 pb-1.5 text-xs text-muted-foreground uppercase tracking-wide">
          <div className="flex-1">Metoda</div>
          <div className="w-24 text-right">Fér. hodnota</div>
          <div className="w-16 text-right">Potenciál</div>
          <div className="w-3.5" />
          <div className="w-3.5" />
        </div>

        {/* Model rows */}
        {valuation.models.map((model) => (
          <ModelRow
            key={model.method}
            model={model}
            currency={valuation.currency}
          />
        ))}
      </div>
    </div>
  );
}
