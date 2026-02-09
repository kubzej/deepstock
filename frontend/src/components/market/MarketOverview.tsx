/**
 * MarketOverview - Přehled klíčových tržních indikátorů
 * Jednoduchý, přehledný design s tooltips
 */
import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useQuotes } from '@/hooks/useQuotes';
import { formatPercent, formatPrice } from '@/lib/format';
import { Info } from 'lucide-react';

// Market indicator definitions with descriptions for beginners
const MARKET_INDICATORS = {
  markets: {
    label: 'Trhy',
    description: 'US indexy a globální trhy',
    items: [
      {
        ticker: '^GSPC',
        name: 'S&P 500',
        desc: 'Top 500 největších US firem. Nejdůležitější benchmark trhu.',
      },
      {
        ticker: '^NDX',
        name: 'Nasdaq 100',
        desc: 'Top 100 tech firem. Když tech roste/padá, index to ukáže první.',
      },
      {
        ticker: '^RUT',
        name: 'Russell 2000',
        desc: 'Malé firmy (small caps). Citlivější na ekonomiku než velké firmy.',
      },
      {
        ticker: '^VIX',
        name: 'VIX',
        desc: 'Index strachu. Nad 20 = nervozita, nad 30 = panika. Nízký VIX = klid.',
        inverted: true,
      },
      {
        ticker: 'EEM',
        name: 'Emerging Markets',
        desc: 'Čína, Indie, Brazílie - citlivé na dolar a globální růst.',
      },
      {
        ticker: 'EFA',
        name: 'Vyspělé trhy',
        desc: 'Evropa, Japonsko, Austrálie - mimo USA.',
      },
      {
        ticker: 'FXI',
        name: 'Čína',
        desc: 'Druhá největší ekonomika. Politická rizika.',
      },
    ],
  },
  sectors: {
    label: 'Sektory',
    description: 'Části ekonomiky a klíčové sub-sektory',
    items: [
      { ticker: 'XLK', name: 'Tech', desc: 'Apple, Microsoft, Nvidia...' },
      { ticker: 'XLF', name: 'Finance', desc: 'Banky, pojišťovny, burzy.' },
      { ticker: 'XLE', name: 'Energie', desc: 'Ropa, plyn - Exxon, Chevron.' },
      {
        ticker: 'XLV',
        name: 'Zdravotnictví',
        desc: 'Pharma, nemocnice, biotech.',
      },
      {
        ticker: 'XLRE',
        name: 'Reality',
        desc: 'REITs - citlivé na úrokové sazby.',
      },
      { ticker: 'XLI', name: 'Průmysl', desc: 'Výroba, letectví, doprava.' },
      { ticker: 'XLC', name: 'Komunikace', desc: 'Meta, Google, Netflix.' },
      {
        ticker: 'XLY',
        name: 'Cyklické',
        desc: 'Amazon, Tesla, luxus - závisí na ekonomice.',
      },
      {
        ticker: 'XLP',
        name: 'Spotřební',
        desc: 'Coca-Cola, P&G - stabilní, defenzivní.',
      },
      {
        ticker: 'XLU',
        name: 'Utility',
        desc: 'Elektřina, voda - defenzivní, dividendy.',
      },
      { ticker: 'XLB', name: 'Materiály', desc: 'Těžba, chemie, ocel.' },
      {
        ticker: 'SMH',
        name: 'Čipy',
        desc: 'NVDA, AMD, AVGO - srdce AI boomu.',
      },
      {
        ticker: 'XBI',
        name: 'Biotech',
        desc: 'Vysoce volatilní. Risk-on indikátor.',
      },
      {
        ticker: 'KRE',
        name: 'Regionální banky',
        desc: 'Citlivé na úrokové sazby a ekonomiku.',
      },
      {
        ticker: 'XHB',
        name: 'Stavitelé domů',
        desc: 'Hypotéky, úroky, real estate health.',
      },
    ],
  },
  macro: {
    label: 'Makro',
    description: 'Komodity, dluhopisy, měny',
    items: [
      {
        ticker: 'GLD',
        name: 'Zlato',
        desc: 'Safe haven. Roste při nejistotě a inflaci.',
      },
      {
        ticker: 'TLT',
        name: 'Dluhopisy 20Y',
        desc: 'Dlouhodobé US Treasury. Roste = flight to safety, padá = sazby nahoru.',
      },
      {
        ticker: 'HYG',
        name: 'High Yield',
        desc: 'Junk bonds. Když padá = risk-off, investoři se bojí.',
      },
      {
        ticker: 'UUP',
        name: 'Dolar',
        desc: 'Silný dolar = tlak na emerging markets a komodity.',
      },
      {
        ticker: 'USO',
        name: 'Ropa',
        desc: 'Cena ropy. Ovlivňuje inflaci a energetický sektor.',
      },
    ],
  },
} as const;

type CategoryKey = keyof typeof MARKET_INDICATORS;

interface MarketOverviewProps {
  /** Visible categories - default all */
  categories?: CategoryKey[];
}

interface IndicatorItemProps {
  ticker: string;
  name: string;
  desc: string;
  price?: number;
  changePercent?: number;
  isLoading?: boolean;
  inverted?: boolean;
}

function IndicatorCard({
  ticker,
  name,
  desc,
  price,
  changePercent,
  isLoading,
  inverted,
}: IndicatorItemProps) {
  if (isLoading) {
    return (
      <div className="bg-muted/30 rounded-xl px-3 py-2.5">
        <Skeleton className="h-4 w-12 mb-1" />
        <Skeleton className="h-5 w-16" />
      </div>
    );
  }

  const change = changePercent ?? 0;
  // VIX/inverted: positive = bad (red), negative = good (green)
  const colorClass = inverted
    ? change > 0
      ? 'text-negative'
      : change < 0
        ? 'text-positive'
        : 'text-muted-foreground'
    : change > 0
      ? 'text-positive'
      : change < 0
        ? 'text-negative'
        : 'text-muted-foreground';

  return (
    <div className="bg-muted/30 rounded-xl px-3 py-2.5">
      {/* Name with info icon */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {name}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[250px]">
            <p className="font-medium text-xs mb-1">
              {name} ({ticker})
            </p>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Values */}
      <div className="flex items-baseline gap-2">
        <span className="font-mono-price text-sm font-semibold">
          {price !== undefined ? formatPrice(price, 'USD') : '—'}
        </span>
        <span className={`font-mono-price text-xs font-medium ${colorClass}`}>
          {changePercent !== undefined
            ? formatPercent(changePercent, 1, true)
            : '—'}
        </span>
      </div>
    </div>
  );
}

export function MarketOverview({
  categories = ['markets', 'sectors', 'macro'],
}: MarketOverviewProps) {
  // Collect all tickers from visible categories
  const allTickers = useMemo(() => {
    return categories.flatMap((cat) =>
      MARKET_INDICATORS[cat].items.map((i) => i.ticker),
    );
  }, [categories]);

  const { data: quotes = {}, isLoading } = useQuotes(allTickers);

  return (
    <div className="space-y-6">
      {categories.map((categoryKey) => {
        const category = MARKET_INDICATORS[categoryKey];
        return (
          <div key={categoryKey}>
            {/* Category header */}
            <div className="mb-3">
              <h3 className="text-sm font-semibold">{category.label}</h3>
              <p className="text-xs text-muted-foreground">
                {category.description}
              </p>
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {category.items.map((item) => {
                const quote = quotes[item.ticker];
                return (
                  <IndicatorCard
                    key={item.ticker}
                    ticker={item.ticker}
                    name={item.name}
                    desc={item.desc}
                    price={quote?.price}
                    changePercent={quote?.changePercent}
                    isLoading={isLoading && !quote}
                    inverted={'inverted' in item ? item.inverted : false}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact inline market bar - just main indices in one row
 */
export function MarketBar() {
  const tickers = ['^GSPC', '^NDX', '^RUT', '^VIX'];
  const { data: quotes = {}, isLoading } = useQuotes(tickers);

  const items = [
    { ticker: '^GSPC', label: 'S&P' },
    { ticker: '^NDX', label: 'NDX' },
    { ticker: '^RUT', label: 'R2K' },
    { ticker: '^VIX', label: 'VIX', inverted: true },
  ];

  return (
    <div className="flex items-center gap-4 text-xs">
      {items.map(({ ticker, label, inverted }) => {
        const quote = quotes[ticker];
        const change = quote?.changePercent ?? 0;
        const colorClass = inverted
          ? change > 0
            ? 'text-negative'
            : change < 0
              ? 'text-positive'
              : 'text-muted-foreground'
          : change > 0
            ? 'text-positive'
            : change < 0
              ? 'text-negative'
              : 'text-muted-foreground';

        if (isLoading && !quote) {
          return <Skeleton key={ticker} className="h-4 w-12" />;
        }

        return (
          <div key={ticker} className="flex items-center gap-1">
            <span className="text-muted-foreground">{label}</span>
            <span className={`font-mono-price font-medium ${colorClass}`}>
              {formatPercent(change, 1, true)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
