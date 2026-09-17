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
  SlidersHorizontal,
  CircleAlert,
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
    color: 'text-positive',
    bgColor: 'bg-muted/40',
    icon: TrendingUp,
  },
  slightly_undervalued: {
    label: 'Mírně podhodnocená',
    color: 'text-positive',
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
    color: 'text-negative',
    bgColor: 'bg-muted/40',
    icon: TrendingDown,
  },
  overvalued: {
    label: 'Nadhodnocená',
    color: 'text-negative',
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Férová hodnota
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
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
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Potenciál</span>
              <span
                className={`font-mono-price ${composite.upside >= 0 ? 'text-positive' : 'text-negative'}`}
              >
                {composite.upside >= 0 ? '+' : ''}
                {composite.upside.toFixed(1)}%
              </span>
            </div>
            <UpsideBar upside={composite.upside} />
          </div>
          <span className="text-xs text-muted-foreground sm:text-right">
            {composite.modelsAvailable && composite.modelsAvailable > composite.modelsUsed
              ? `${composite.modelsUsed} z ${composite.modelsAvailable} modelů započteno`
              : `${composite.modelsUsed} ${composite.modelsUsed === 1 ? 'model' : composite.modelsUsed < 5 ? 'modely' : 'modelů'}`}
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
        <div className="w-1/2 bg-gradient-to-r from-primary/20 to-transparent" />
        <div className="w-1/2 bg-gradient-to-r from-transparent to-primary/35" />
      </div>
      {/* Position indicator */}
      <div
        className="absolute top-0 bottom-0 w-1.5 rounded-full bg-foreground"
        style={{ left: `calc(${position}% - 3px)` }}
      />
    </div>
  );
}

// ── Horizon badge config ─────────────────────────────────────────────────────

const HORIZON_BADGE: Record<string, { label: string; color: string }> = {
  short: { label: '6-18M', color: 'bg-muted text-muted-foreground' },
  medium: { label: '1-3R', color: 'bg-muted text-muted-foreground' },
  long: { label: '3-5R+', color: 'bg-muted text-muted-foreground' },
};

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
  const horizonBadge = HORIZON_BADGE[model.horizon] ?? HORIZON_BADGE.medium;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className={`w-full rounded-md px-2 py-3 text-left transition-colors ${
          expanded ? 'bg-muted/35' : 'hover:bg-muted/20'
        }`}
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <div className="flex min-w-0 items-start justify-between gap-3 md:flex-1 md:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-sm truncate">{model.method}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${horizonBadge.color}`}
                >
                  {horizonBadge.label}
                </span>
                {model.includedInComposite === false && (
                  <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                    nezapočteno
                  </span>
                )}
              </div>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <ConfIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${conf.color}`} />
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Spolehlivost: {conf.label}</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="grid grid-cols-2 gap-3 pl-0 text-left md:flex md:items-center md:gap-3 md:pl-0">
            <div className="space-y-0.5 md:w-24 md:text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground md:hidden">
                Fér. hodnota
              </p>
              <span className="font-mono-price text-sm">
                {formatCurrency(model.fairValue, currency)}
              </span>
            </div>

            <div className="space-y-0.5 md:w-16 md:text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground md:hidden">
                Potenciál
              </p>
              <span
                className={`font-mono-price text-sm ${model.upside >= 0 ? 'text-positive' : 'text-negative'}`}
              >
                {model.upside >= 0 ? '+' : ''}
                {model.upside.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mx-2 mb-4 space-y-3 px-1 py-3 text-xs leading-relaxed">
          <p className="font-medium text-foreground/90">{model.description}</p>
          {model.tooltip && (
            <p className="max-w-5xl text-muted-foreground">{model.tooltip}</p>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {Object.entries(model.inputs).map(([key, val]) => {
              if (val === null || val === undefined) return null;
              return (
                <span key={key} className="whitespace-nowrap">
                  <span className="text-muted-foreground">{formatInputLabel(key)}</span>{' '}
                  <span className="font-mono-price text-foreground/90">
                    {formatInputValue(key, val)}
                  </span>
                </span>
              );
            })}
            <span className="whitespace-nowrap">
              <span className="text-muted-foreground">Spolehlivost</span>{' '}
              <span className="text-foreground/90">{conf.label}</span>
            </span>
            {model.includedInComposite !== false && model.compositeWeight != null && (
              <span className="whitespace-nowrap">
                <span className="text-muted-foreground">Váha</span>{' '}
                <span className="font-mono-price text-foreground/90">{model.compositeWeight}×</span>
              </span>
            )}
          </div>

          {model.normalizationNotes && model.normalizationNotes.length > 0 && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <SlidersHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <span className="font-medium text-foreground/90">Úprava vstupů: </span>
                {model.normalizationNotes.join(' ')}
              </div>
            </div>
          )}

          {model.compositeExclusionReason && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <div>
                <span className="font-medium text-warning">Nezapočteno: </span>
                {model.compositeExclusionReason}
              </div>
            </div>
          )}

          {model.compositeWeightReason && (
            <p className="text-muted-foreground">{model.compositeWeightReason}</p>
          )}
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
  bookValuePerShare: 'Účetní hodnota / akcie',
  currentPB: 'Aktuální P/B',
  sectorFairPB: 'Sektorové P/B',
  sectorPBRange: 'Sektorové pásmo P/B',
  fairPB: 'Cílový P/B',
  kvalita: 'Kvalita',
  growthPct: 'Růst zisku',
  fairPE: 'Férové P/E',
  qualityScore: 'Skóre kvality',
  actualPEG: 'Aktuální PEG',
  dividend: 'Dividenda',
  divGrowth: 'Růst dividendy',
  beta: 'Beta',
  evEbitda: 'EV/EBITDA',
  fairMultiple: 'Férový násobek',
  ebitda: 'EBITDA (mld)',
  costOfEquity: 'Náklad kapitálu',
  historicalMultiple: '5letý průměr násobku',
  totalDebt: 'Celkový dluh',
  totalCash: 'Hotovost',
  sharesOutstanding: 'Počet akcií',
  revenue: 'Tržby',
  normalizedEps: 'Očištěné EPS',
  reportedEps: 'Vykázané EPS',
  historicalMedianPE: 'Medián historického P/E',
  usedPE: 'Použité P/E',
  normalizedFcfPerShare: 'Očištěné FCF/akcie',
  historicalMedianPfcf: 'Medián historického P/FCF',
  usedPfcf: 'Použité P/FCF',
  historicalMedianPB: 'Medián historického P/B',
  normalizedEbitdaB: 'Očištěná EBITDA (mld.)',
  historicalMedianEvEbitda: 'Medián EV/EBITDA',
  historicalMedianEvRevenue: 'Medián EV/tržby',
  observations: 'Počet období',
  sectorPeCeiling: 'Sektorový strop P/E',
  sectorPeFloor: 'Sektorové minimum P/E',
  riskFreeRate: 'Bezriziková sazba',
  equityRiskPremium: 'Akciová riziková prémie',
  growthPeriods: 'Období forward růstu',
  annualDividend: 'Roční dividenda',
  expectedGrowth: 'Očekávaný růst',
  payoutRatio: 'Výplatní poměr',
  currentMultiple: 'Aktuální násobek',
  targetMultiple: 'Cílový násobek',
  netDebtB: 'Čistý dluh (mld.)',
  costOfCapital: 'Náklad kapitálu',
  assumption: 'Předpoklad',
  forwardEps: 'Forward EPS',
  rawGrowth: 'Výchozí růst EPS',
  normalizedGrowth: 'Očištěný růst EPS',
  targetPEG: 'Cílové PEG',
  growthPhase: 'Fáze růstu',
  revenueB: 'Tržby (mld.)',
};

function formatInputLabel(key: string): string {
  return INPUT_LABELS[key] ?? key;
}

const PERCENT_INPUTS = new Set([
  'growthRate',
  'discountRate',
  'terminalGrowth',
  'riskFreeRate',
  'equityRiskPremium',
  'expectedGrowth',
  'rawGrowth',
  'normalizedGrowth',
  'costOfCapital',
  'bondYield',
]);

const MULTIPLE_INPUTS = new Set([
  'sectorPE',
  'fairPE',
  'actualPEG',
  'fairPB',
  'currentPB',
  'sectorFairPB',
  'evEbitda',
  'fairMultiple',
  'historicalMultiple',
  'historicalMedianPE',
  'usedPE',
  'historicalMedianPfcf',
  'usedPfcf',
  'historicalMedianPB',
  'historicalMedianEvEbitda',
  'historicalMedianEvRevenue',
  'sectorPeCeiling',
  'sectorPeFloor',
  'currentMultiple',
  'targetMultiple',
  'targetPEG',
]);

const inputNumberFormatter = new Intl.NumberFormat('cs-CZ', {
  maximumFractionDigits: 2,
});

function formatInputValue(key: string, val: number | string | null): string {
  if (val === null) return '—';
  if (typeof val === 'number') {
    const formatted = inputNumberFormatter.format(val);
    if (PERCENT_INPUTS.has(key)) return `${formatted} %`;
    if (MULTIPLE_INPUTS.has(key)) return `${formatted}×`;
    return formatted;
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
    growth: 'Růstová fáze',
    turnaround: 'Přechodová fáze',
    'Zero Growth': 'Bez růstu',
  };
  return translations[val] ?? val;
}

// ── Horizon grouping config ──────────────────────────────────────────────────

const HORIZON_CONFIG: Record<
  string,
  { label: string; description: string; order: number }
> = {
  short: {
    label: 'Krátkodobé',
    description: '6-18 měsíců',
    order: 1,
  },
  medium: {
    label: 'Střednědobé',
    description: '1-3 roky',
    order: 2,
  },
  long: {
    label: 'Dlouhodobé',
    description: '3-5+ let',
    order: 3,
  },
};

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

  // Sort models by horizon (short first)
  const sortedModels = [...valuation.models].sort((a, b) => {
    const orderA = HORIZON_CONFIG[a.horizon]?.order ?? 99;
    const orderB = HORIZON_CONFIG[b.horizon]?.order ?? 99;
    return orderA - orderB;
  });

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

      {/* Models list */}
      <div>
        {/* Table header */}
        <div className="hidden items-center gap-3 pb-2 text-xs text-muted-foreground uppercase tracking-wide md:flex">
          <div className="flex-1">Metoda</div>
          <div className="w-24 text-right">Fér. hodnota</div>
          <div className="w-16 text-right">Potenciál</div>
          <div className="w-3.5" />
        </div>

        {/* Model rows */}
        {sortedModels.map((model) => (
          <ModelRow
            key={model.modelId ?? model.method}
            model={model}
            currency={valuation.currency}
          />
        ))}
      </div>
    </div>
  );
}
