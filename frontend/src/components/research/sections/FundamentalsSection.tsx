import { useState } from 'react';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { StockInfo } from '@/lib/api';
import {
  formatCurrency,
  formatLargeNumber,
  formatRatio,
  formatRatioAsPercent,
} from '@/lib/format';

interface Insight {
  type: 'positive' | 'warning' | 'info';
  title: string;
  description: string;
}

const METRIC_TOOLTIPS: Record<
  string,
  { description: string; good: string; bad: string }
> = {
  'Market Cap': {
    description:
      'Tržní kapitalizace = cena akcie × počet akcií. Udává celkovou hodnotu firmy na burze.',
    good: 'Large cap (>$10B) = stabilní, Mid cap ($2-10B) = růstový potenciál',
    bad: 'Micro cap (<$300M) = vyšší riziko a volatilita',
  },
  'P/E (TTM)': {
    description:
      'Price-to-Earnings (za posledních 12 měsíců). Kolik investoři platí za $1 zisku.',
    good: '10-20 je běžné, pod 15 může být podhodnocené',
    bad: 'Nad 30 může značit předražení nebo vysoká očekávání růstu',
  },
  'P/E (Fwd)': {
    description:
      'Forward P/E. Cena akcie dělená očekávaným ziskem na další rok.',
    good: 'Nižší než TTM P/E značí očekávaný růst zisků',
    bad: 'Vyšší než TTM P/E značí očekávaný pokles zisků',
  },
  PEG: {
    description:
      'P/E dělené očekávaným růstem zisků. Zohledňuje růst při hodnocení valuace.',
    good: 'Pod 1.0 je považováno za podhodnocené',
    bad: 'Nad 2.0 může být předražené vzhledem k růstu',
  },
  'P/B': {
    description: 'Price-to-Book. Cena akcie dělená účetní hodnotou na akcii.',
    good: 'Pod 1.0 může značit podhodnocení, 1-3 je běžné',
    bad: 'Nad 5 může značit předražení (závisí na odvětví)',
  },
  'P/S': {
    description: 'Price-to-Sales. Tržní kapitalizace dělená ročními tržbami.',
    good: 'Pod 2 je levné, 2-5 je běžné pro rostoucí firmy',
    bad: 'Nad 10 je drahé, vyžaduje vysoký růst tržeb',
  },
  'Gross Margin': {
    description:
      'Hrubá marže = (Tržby - Náklady na prodej) / Tržby. Základní ziskovost.',
    good: 'Nad 40% je výborné, nad 60% je špičkové (software)',
    bad: 'Pod 20% značí nízkou přidanou hodnotu',
  },
  'Operating Margin': {
    description: 'Provozní marže. Zisk z hlavní činnosti před úroky a daněmi.',
    good: 'Nad 20% je velmi dobré, nad 30% je excelentní',
    bad: 'Pod 10% značí nízkou efektivitu nebo vysoké náklady',
  },
  'Profit Margin': {
    description:
      'Čistá zisková marže. Kolik % z tržeb zůstane jako čistý zisk.',
    good: 'Nad 15% je výborné, nad 25% je špičkové',
    bad: 'Pod 5% značí slabou ziskovost',
  },
  ROE: {
    description:
      'Return on Equity. Čistý zisk dělený vlastním kapitálem. Efektivita využití kapitálu akcionářů.',
    good: 'Nad 15% je dobré, nad 20% je výborné',
    bad: 'Pod 10% značí neefektivní využití kapitálu',
  },
  ROA: {
    description:
      'Return on Assets. Čistý zisk dělený celkovými aktivy. Efektivita využití majetku.',
    good: 'Nad 10% je dobré, nad 15% je výborné',
    bad: 'Pod 5% značí neefektivní využití aktiv',
  },
  'Revenue Growth': {
    description: 'Meziroční růst tržeb. Důležitý ukazatel dynamiky firmy.',
    good: 'Nad 10% je solidní růst, nad 20% je vysoký růst',
    bad: 'Záporný růst značí problémy nebo zralý trh',
  },
  'EPS (TTM)': {
    description:
      'Earnings Per Share. Čistý zisk na jednu akcii za posledních 12 měsíců.',
    good: 'Rostoucí EPS v čase značí zdravou firmu',
    bad: 'Klesající nebo záporný EPS značí problémy',
  },
  'EPS (Fwd)': {
    description: 'Očekávaný zisk na akcii pro další rok podle analytiků.',
    good: 'Vyšší než TTM EPS značí očekávaný růst',
    bad: 'Nižší než TTM EPS značí očekávaný pokles',
  },
  'Debt/Equity': {
    description:
      'Dluh dělený vlastním kapitálem. Měří finanční páku a zadluženost.',
    good: 'Pod 50% je konzervativní, pod 100% je přijatelné',
    bad: 'Nad 150% značí vysoké zadlužení a riziko',
  },
  'Current Ratio': {
    description:
      'Oběžná aktiva dělená krátkodobými závazky. Měří krátkodobou likviditu.',
    good: 'Nad 1.5 je zdravé, nad 2.0 je velmi bezpečné',
    bad: 'Pod 1.0 značí problémy s likviditou',
  },
  'Free Cash Flow': {
    description:
      'Volný peněžní tok. Hotovost po investicích, použitelná pro dividendy nebo růst.',
    good: 'Kladný a rostoucí FCF je důležitý',
    bad: 'Záporný FCF vyžaduje externí financování',
  },
  Revenue: {
    description: 'Celkové roční tržby firmy. Základní ukazatel velikosti.',
    good: 'Rostoucí tržby v čase jsou pozitivní',
    bad: 'Klesající tržby značí problémy nebo saturovaný trh',
  },
  'Dividend Yield': {
    description: 'Roční dividenda dělená cenou akcie. Výnos z dividend.',
    good: '2-4% je solidní, nad 4% je vysoký výnos',
    bad: 'Příliš vysoký (>8%) může značit riziko snížení dividendy',
  },
  'Dividend Rate': {
    description: 'Roční dividenda na akcii v dolarech.',
    good: 'Stabilní nebo rostoucí dividenda v čase',
    bad: 'Klesající dividenda značí problémy firmy',
  },
  'Payout Ratio': {
    description: 'Kolik % zisku se vyplácí jako dividendy.',
    good: '30-60% je udržitelné s prostorem pro růst',
    bad: 'Nad 80% může být neudržitelné',
  },
};

interface MetricProps {
  label: string;
  value: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

function Metric({ label, value, sentiment = 'neutral' }: MetricProps) {
  const colorClass =
    sentiment === 'positive'
      ? 'text-emerald-500'
      : sentiment === 'negative'
        ? 'text-rose-500'
        : 'text-foreground';

  const tooltip = METRIC_TOOLTIPS[label];

  return (
    <div>
      <div className="flex items-center gap-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-2 text-sm">
                <p>{tooltip.description}</p>
                <p className="text-emerald-400">✓ {tooltip.good}</p>
                <p className="text-rose-400">✗ {tooltip.bad}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className={`text-lg font-mono-price font-medium ${colorClass}`}>
        {value}
      </p>
    </div>
  );
}

interface BadgeConfig {
  count: number;
  label: string;
  type: 'warnings' | 'positives' | 'info';
  colorClass: string;
  bgClass: string;
}

function InsightsPanel({ insights }: { insights: Insight[] }) {
  const [expanded, setExpanded] = useState<
    'warnings' | 'positives' | 'info' | null
  >(null);

  if (insights.length === 0) return null;

  const positives = insights.filter((i) => i.type === 'positive');
  const warnings = insights.filter((i) => i.type === 'warning');
  const infos = insights.filter((i) => i.type === 'info');

  const badges: BadgeConfig[] = [
    {
      count: warnings.length,
      label: warnings.length === 1 ? 'riziko' : 'rizika',
      type: 'warnings',
      colorClass: 'text-rose-600',
      bgClass: 'bg-rose-50',
    },
    {
      count: positives.length,
      label: positives.length === 1 ? 'pozitivum' : 'pozitiv',
      type: 'positives',
      colorClass: 'text-emerald-600',
      bgClass: 'bg-emerald-50',
    },
    {
      count: infos.length,
      label: infos.length === 1 ? 'poznámka' : 'poznámek',
      type: 'info',
      colorClass: 'text-zinc-600',
      bgClass: 'bg-zinc-100',
    },
  ];

  const activeItems =
    expanded === 'warnings'
      ? warnings
      : expanded === 'positives'
        ? positives
        : expanded === 'info'
          ? infos
          : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mr-2">
          Smart analýza
        </span>
        {badges
          .filter((b) => b.count > 0)
          .map((badge) => {
            const isActive = expanded === badge.type;
            return (
              <button
                key={badge.type}
                onClick={() => setExpanded(isActive ? null : badge.type)}
                className={`inline-flex items-center gap-2 h-8 px-4 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {badge.count} {badge.label}
              </button>
            );
          })}
      </div>

      {expanded && activeItems.length > 0 && (
        <div className="grid gap-x-8 gap-y-3 md:grid-cols-2 lg:grid-cols-3 pt-4">
          {activeItems.map((insight, i) => (
            <div key={i}>
              <p className="text-sm font-medium text-foreground">
                {insight.title}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                {insight.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FundamentalsSectionProps {
  data: StockInfo;
}

export function FundamentalsSection({ data }: FundamentalsSectionProps) {
  const insights: Insight[] = data.insights ?? [];

  return (
    <div className="space-y-8">
      <InsightsPanel insights={insights} />

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground/70">Valuace</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-3">
          <Metric
            label="Market Cap"
            value={formatLargeNumber(data.marketCap)}
          />
          <Metric label="P/E (TTM)" value={formatRatio(data.trailingPE)} />
          <Metric label="P/E (Fwd)" value={formatRatio(data.forwardPE)} />
          <Metric label="PEG" value={formatRatio(data.pegRatio)} />
          <Metric label="P/B" value={formatRatio(data.priceToBook)} />
          <Metric label="P/S" value={formatRatio(data.priceToSales)} />
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground/70">Ziskovost</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-3">
          <Metric
            label="Gross Margin"
            value={formatRatioAsPercent(data.grossMargin)}
            sentiment={
              data.grossMargin && data.grossMargin > 0.4
                ? 'positive'
                : 'neutral'
            }
          />
          <Metric
            label="Operating Margin"
            value={formatRatioAsPercent(data.operatingMargin)}
            sentiment={
              data.operatingMargin && data.operatingMargin > 0.2
                ? 'positive'
                : 'neutral'
            }
          />
          <Metric
            label="Profit Margin"
            value={formatRatioAsPercent(data.profitMargin)}
            sentiment={
              data.profitMargin && data.profitMargin > 0.15
                ? 'positive'
                : 'neutral'
            }
          />
          <Metric
            label="ROE"
            value={formatRatioAsPercent(data.roe)}
            sentiment={data.roe && data.roe > 0.15 ? 'positive' : 'neutral'}
          />
          <Metric
            label="ROA"
            value={formatRatioAsPercent(data.roa)}
            sentiment={data.roa && data.roa > 0.1 ? 'positive' : 'neutral'}
          />
          <Metric
            label="Revenue Growth"
            value={formatRatioAsPercent(data.revenueGrowth)}
            sentiment={
              data.revenueGrowth && data.revenueGrowth > 0.1
                ? 'positive'
                : data.revenueGrowth && data.revenueGrowth < 0
                  ? 'negative'
                  : 'neutral'
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground/70">
          Finanční zdraví
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-3">
          <Metric label="EPS (TTM)" value={formatRatio(data.eps)} />
          <Metric label="EPS (Fwd)" value={formatRatio(data.forwardEps)} />
          <Metric
            label="Debt/Equity"
            value={formatRatio(data.debtToEquity)}
            sentiment={
              data.debtToEquity && data.debtToEquity < 50
                ? 'positive'
                : data.debtToEquity && data.debtToEquity > 100
                  ? 'negative'
                  : 'neutral'
            }
          />
          <Metric
            label="Current Ratio"
            value={formatRatio(data.currentRatio)}
            sentiment={
              data.currentRatio && data.currentRatio > 1.5
                ? 'positive'
                : data.currentRatio && data.currentRatio < 1
                  ? 'negative'
                  : 'neutral'
            }
          />
          <Metric
            label="Free Cash Flow"
            value={formatLargeNumber(data.freeCashflow)}
          />
          <Metric label="Revenue" value={formatLargeNumber(data.revenue)} />
        </div>
      </div>

      {data.dividendYield && data.dividendYield > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground/70">
            Dividendy
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-3">
            <Metric
              label="Dividend Yield"
              value={formatRatioAsPercent(data.dividendYield)}
              sentiment="positive"
            />
            <Metric
              label="Dividend Rate"
              value={formatCurrency(data.dividendRate, data.currency ?? 'USD')}
            />
            <Metric
              label="Payout Ratio"
              value={formatRatioAsPercent(data.payoutRatio)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
