/**
 * Research Page - Stock lookup with fundamentals & valuation
 */
import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { fetchStockInfo, type StockInfo } from '@/lib/api';
import {
  formatLargeNumber,
  formatPercent,
  formatRatio,
  formatCurrency,
} from '@/lib/format';
import { PriceChart } from '@/components/charts';
import { ValuationSection } from '@/components/research/ValuationSection';

// Lazy load TechnicalAnalysis - heavy component with indicators
const TechnicalAnalysis = lazy(() =>
  import('@/components/charts/TechnicalAnalysis').then((mod) => ({
    default: mod.TechnicalAnalysis,
  })),
);

// ============================================================
// Insight interface (data comes from backend)
// ============================================================

interface Insight {
  type: 'positive' | 'warning' | 'info';
  title: string;
  description: string;
}

// ============================================================
// METRIC TOOLTIPS
// ============================================================

// Metric tooltips - descriptions in Czech
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

// Metric component with tooltip
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

// Stock header with price
function StockHeader({ data }: { data: StockInfo }) {
  const isPositive = (data.change ?? 0) >= 0;

  return (
    <div className="space-y-4">
      {/* Ticker + Name */}
      <div>
        <div className="flex items-baseline gap-3">
          <h2 className="text-3xl font-bold">{data.symbol}</h2>
          <span className="text-muted-foreground">{data.exchange}</span>
        </div>
        <p className="text-lg text-muted-foreground">{data.name}</p>
        <p className="text-sm text-muted-foreground">
          {data.sector} · {data.industry}
        </p>
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-4">
        <span className="text-4xl font-mono-price font-bold">
          {formatCurrency(data.price, data.currency ?? 'USD')}
        </span>
        <div
          className={`flex items-center gap-1 text-lg ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}
        >
          {isPositive ? (
            <TrendingUp className="w-5 h-5" />
          ) : (
            <TrendingDown className="w-5 h-5" />
          )}
          <span className="font-mono-price">
            {formatCurrency(data.change, data.currency ?? 'USD')} (
            {formatPercent(data.changePercent)})
          </span>
        </div>
      </div>

      {/* Day range */}
      <div className="flex gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">Denní rozpětí: </span>
          <span className="font-mono-price">
            {formatCurrency(data.dayLow, data.currency ?? 'USD')} —{' '}
            {formatCurrency(data.dayHigh, data.currency ?? 'USD')}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">52T rozpětí: </span>
          <span className="font-mono-price">
            {formatCurrency(data.fiftyTwoWeekLow, data.currency ?? 'USD')} —{' '}
            {formatCurrency(data.fiftyTwoWeekHigh, data.currency ?? 'USD')}
          </span>
        </div>
      </div>
    </div>
  );
}

// Summary badge for insights
interface BadgeConfig {
  count: number;
  label: string;
  type: 'warnings' | 'positives' | 'info';
  colorClass: string;
  bgClass: string;
}

// Insights panel component - summary badges + collapsible details
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
      {/* Summary badges row */}
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

      {/* Expanded details */}
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

// Fundamentals & Valuation section
function FundamentalsSection({ data }: { data: StockInfo }) {
  // Insights come from backend API
  const insights: Insight[] = data.insights ?? [];

  return (
    <div className="space-y-8">
      {/* Insights panel at the top */}
      <InsightsPanel insights={insights} />

      {/* Valuation metrics */}
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

      {/* Profitability */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground/70">Ziskovost</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-3">
          <Metric
            label="Gross Margin"
            value={formatPercent(data.grossMargin)}
            sentiment={
              data.grossMargin && data.grossMargin > 0.4
                ? 'positive'
                : 'neutral'
            }
          />
          <Metric
            label="Operating Margin"
            value={formatPercent(data.operatingMargin)}
            sentiment={
              data.operatingMargin && data.operatingMargin > 0.2
                ? 'positive'
                : 'neutral'
            }
          />
          <Metric
            label="Profit Margin"
            value={formatPercent(data.profitMargin)}
            sentiment={
              data.profitMargin && data.profitMargin > 0.15
                ? 'positive'
                : 'neutral'
            }
          />
          <Metric
            label="ROE"
            value={formatPercent(data.roe)}
            sentiment={data.roe && data.roe > 0.15 ? 'positive' : 'neutral'}
          />
          <Metric
            label="ROA"
            value={formatPercent(data.roa)}
            sentiment={data.roa && data.roa > 0.1 ? 'positive' : 'neutral'}
          />
          <Metric
            label="Revenue Growth"
            value={formatPercent(data.revenueGrowth)}
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

      {/* Financial health */}
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

      {/* Dividends */}
      {data.dividendYield && data.dividendYield > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground/70">
            Dividendy
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-3">
            <Metric
              label="Dividend Yield"
              value={formatPercent(data.dividendYield)}
              sentiment="positive"
            />
            <Metric
              label="Dividend Rate"
              value={formatCurrency(data.dividendRate, data.currency ?? 'USD')}
            />
            <Metric
              label="Payout Ratio"
              value={formatPercent(data.payoutRatio)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Technical section with price chart and indicators
function TechnicalSection({
  ticker,
  currency,
}: {
  ticker: string;
  currency: string;
}) {
  return (
    <div className="space-y-8">
      {/* Price Chart */}
      <PriceChart ticker={ticker} currency={currency} height={350} />

      {/* Technical Indicators - lazy loaded */}
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          </div>
        }
      >
        <TechnicalAnalysis ticker={ticker} />
      </Suspense>
    </div>
  );
}

// Main component
export function ResearchPage() {
  const [ticker, setTicker] = useState('');
  const [activeTicker, setActiveTicker] = useState<string | null>(null);

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } =
    useQuery({
      queryKey: ['stockInfo', activeTicker],
      queryFn: () => fetchStockInfo(activeTicker!),
      enabled: !!activeTicker,
      staleTime: 5 * 60 * 1000, // 5 minutes
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = ticker.trim().toUpperCase();
    if (trimmed) {
      setActiveTicker(trimmed);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-8 pb-12">
        {/* Header */}
        <PageHeader
          title="Průzkum akcie"
          onRefresh={activeTicker ? () => refetch() : undefined}
          isRefreshing={isFetching}
          dataUpdatedAt={activeTicker ? dataUpdatedAt : undefined}
        />

        {/* Search */}
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Zadejte ticker (AAPL, MSFT, ...)"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="pl-10"
              maxLength={10}
            />
          </div>
          <Button type="submit" disabled={!ticker.trim() || isLoading}>
            Analyzovat
          </Button>
        </form>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-6 w-64" />
            </div>
            <Skeleton className="h-12 w-48" />
            <div className="grid grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
            Nepodařilo se načíst data pro {activeTicker}
          </div>
        )}

        {/* No data */}
        {!isLoading && !error && activeTicker && !data && (
          <div className="p-4 bg-muted rounded-lg text-muted-foreground">
            Ticker {activeTicker} nebyl nalezen
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="space-y-6">
            <StockHeader data={data} />

            {/* Description */}
            {data.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {data.description}
              </p>
            )}

            {/* Tabs */}
            <Tabs defaultValue="fundamentals" className="w-full">
              <TabsList>
                <TabsTrigger value="fundamentals">Fundamenty</TabsTrigger>
                <TabsTrigger value="valuation">Valuace</TabsTrigger>
                <TabsTrigger value="technical">Technika</TabsTrigger>
              </TabsList>

              <TabsContent value="fundamentals" className="mt-6">
                <FundamentalsSection data={data} />
              </TabsContent>

              <TabsContent value="valuation" className="mt-6">
                <ValuationSection data={data} />
              </TabsContent>

              <TabsContent value="technical" className="mt-6">
                <TechnicalSection
                  ticker={data.symbol}
                  currency={data.currency ?? 'USD'}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
