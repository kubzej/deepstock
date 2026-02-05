/**
 * Options Greeks Guide
 *
 * Clean, modern design for Greeks education.
 * Single row of pills: Delta | Theta | Gamma | Vega | Strategie
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';

type SectionType = 'delta' | 'theta' | 'gamma' | 'vega' | 'strategies';

interface GreekData {
  symbol: string;
  name: string;
  color: string;
  tagline: string;
  description: string;
  range: string;
  buyerImpact: string;
  sellerImpact: string;
  tip: string;
}

const greeksData: Record<Exclude<SectionType, 'strategies'>, GreekData> = {
  delta: {
    symbol: 'Δ',
    name: 'Delta',
    color: 'from-blue-500/20 to-blue-600/5',
    tagline: 'Směrová citlivost',
    description:
      'O kolik se změní cena opce, když se podkladová akcie pohne o $1.',
    range: '0 až 1 (call) nebo -1 až 0 (put)',
    buyerImpact: 'Vyšší delta = větší zisk při pohybu ve tvůj směr',
    sellerImpact: 'Nižší delta = menší riziko přiřazení',
    tip: 'ATM opce mají deltu ~0.50, ITM blíže k 1, OTM blíže k 0',
  },
  theta: {
    symbol: 'Θ',
    name: 'Theta',
    color: 'from-amber-500/20 to-amber-600/5',
    tagline: 'Časový rozklad',
    description: 'Kolik hodnoty opce ztratí každý den jen kvůli plynutí času.',
    range: 'Vždy záporná (opce ztrácí hodnotu)',
    buyerImpact: 'Čas pracuje proti tobě – opce každý den ztrácí',
    sellerImpact: 'Čas pracuje pro tebe – vyděláváš každý den',
    tip: 'Theta se zrychluje posledních 30 dní před expirací',
  },
  gamma: {
    symbol: 'Γ',
    name: 'Gamma',
    color: 'from-purple-500/20 to-purple-600/5',
    tagline: 'Akcelerace delty',
    description: 'Jak rychle se mění delta, když se pohne cena akcie.',
    range: 'Vždy kladná, nejvyšší u ATM opcí',
    buyerImpact: 'Vysoká gamma = velké zisky při rychlém pohybu',
    sellerImpact: 'Vysoká gamma = velké riziko při rychlém pohybu',
    tip: 'Gamma je nejvyšší těsně před expirací u ATM opcí',
  },
  vega: {
    symbol: 'ν',
    name: 'Vega',
    color: 'from-emerald-500/20 to-emerald-600/5',
    tagline: 'Citlivost na volatilitu',
    description:
      'O kolik se změní cena opce, když se implied volatilita změní o 1%.',
    range: 'Vždy kladná pro long pozice',
    buyerImpact: 'Růst IV = tvoje opce zdražuje',
    sellerImpact: 'Pokles IV = vyděláváš na "IV crush"',
    tip: 'IV často padá po earnings – pozor na IV crush',
  },
};

// Strategy data
interface StrategyData {
  name: string;
  subtitle: string;
  greeks: {
    delta: { value: string; sentiment: 'positive' | 'negative' | 'neutral' };
    theta: { value: string; sentiment: 'positive' | 'negative' | 'neutral' };
    gamma: { value: string; sentiment: 'positive' | 'negative' | 'neutral' };
    vega: { value: string; sentiment: 'positive' | 'negative' | 'neutral' };
  };
  focus: string;
  avoid: string;
}

const strategies: StrategyData[] = [
  {
    name: 'Sell Put (CSP)',
    subtitle: 'Cash-Secured Put',
    greeks: {
      delta: { value: '+', sentiment: 'positive' },
      theta: { value: '+++', sentiment: 'positive' },
      gamma: { value: '−', sentiment: 'neutral' },
      vega: { value: '+', sentiment: 'positive' },
    },
    focus:
      'Theta je tvůj nejlepší přítel – každý den vyděláváš na časovém rozpadu',
    avoid: 'Vysoká gamma blízko expirace může rychle změnit delta',
  },
  {
    name: 'Sell Call (CC)',
    subtitle: 'Covered Call',
    greeks: {
      delta: { value: '−', sentiment: 'negative' },
      theta: { value: '+++', sentiment: 'positive' },
      gamma: { value: '−', sentiment: 'neutral' },
      vega: { value: '+', sentiment: 'positive' },
    },
    focus: 'Theta pracuje pro tebe, ideální při stagnaci nebo mírném růstu',
    avoid: 'Záporná delta omezuje zisky když akcie rychle roste',
  },
  {
    name: 'Buy Call',
    subtitle: 'Long Call',
    greeks: {
      delta: { value: '+++', sentiment: 'positive' },
      theta: { value: '−−−', sentiment: 'negative' },
      gamma: { value: '+', sentiment: 'positive' },
      vega: { value: '+', sentiment: 'positive' },
    },
    focus: 'Delta ti dává páku na růst, gamma zrychluje zisky při pohybu',
    avoid:
      'Theta tě zabíjí každý den – nekupuj s dlouhou expirací pokud očekáváš rychlý pohyb',
  },
  {
    name: 'Buy Put',
    subtitle: 'Long Put',
    greeks: {
      delta: { value: '−−−', sentiment: 'negative' },
      theta: { value: '−−−', sentiment: 'negative' },
      gamma: { value: '+', sentiment: 'positive' },
      vega: { value: '+', sentiment: 'positive' },
    },
    focus: 'Záporná delta = profit při poklesu, vega pomáhá při panice na trhu',
    avoid: 'Dvojitý nepřítel: theta + nesprávný směr = rychlá ztráta',
  },
];

const sections: { key: SectionType; label: string; symbol?: string }[] = [
  { key: 'delta', label: 'Delta', symbol: 'Δ' },
  { key: 'theta', label: 'Theta', symbol: 'Θ' },
  { key: 'gamma', label: 'Gamma', symbol: 'Γ' },
  { key: 'vega', label: 'Vega', symbol: 'ν' },
  { key: 'strategies', label: 'Strategie' },
];

export function OptionsGreeksGuide() {
  const [activeSection, setActiveSection] = useState<SectionType>('delta');

  const isGreek = activeSection !== 'strategies';
  const greek = isGreek
    ? greeksData[activeSection as Exclude<SectionType, 'strategies'>]
    : null;

  return (
    <div className="space-y-4">
      {/* Section Selector - Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {sections.map((section) => {
          const isActive = activeSection === section.key;
          return (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-full transition-all shrink-0',
                'text-sm font-medium',
                isActive
                  ? 'bg-foreground text-background'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {section.symbol && <span>{section.symbol}</span>}
              <span>{section.label}</span>
            </button>
          );
        })}
      </div>

      {/* Greek Content */}
      {greek && (
        <div
          className={cn(
            'rounded-xl p-5 bg-gradient-to-br',
            greek.color,
            'border border-border/50',
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="text-3xl font-light text-foreground/80">
              {greek.symbol}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {greek.name}
              </h2>
              <p className="text-sm text-muted-foreground">{greek.tagline}</p>
            </div>
          </div>

          {/* Description */}
          <p className="text-foreground/90 text-sm leading-relaxed mb-4">
            {greek.description}
          </p>

          {/* Range */}
          <div className="mb-4 p-2.5 rounded-lg bg-background/50 border border-border/30">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Rozsah hodnot
            </span>
            <p className="text-foreground text-sm mt-0.5">{greek.range}</p>
          </div>

          {/* Impact Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-background/40">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pro kupující
                </span>
              </div>
              <p className="text-foreground text-sm">{greek.buyerImpact}</p>
            </div>
            <div className="p-3 rounded-lg bg-background/40">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pro prodávající
                </span>
              </div>
              <p className="text-foreground text-sm">{greek.sellerImpact}</p>
            </div>
          </div>

          {/* Tip */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-foreground/5 border border-foreground/10">
            <span>💡</span>
            <p className="text-foreground text-sm">{greek.tip}</p>
          </div>
        </div>
      )}

      {/* Strategies Content */}
      {activeSection === 'strategies' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Každá strategie má jiný vztah ke Greeks. Na co se zaměřit a čeho se
            vyvarovat.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {strategies.map((strategy) => (
              <div
                key={strategy.name}
                className="rounded-xl border border-border/50 p-4 bg-muted/10"
              >
                {/* Strategy Header */}
                <div className="mb-3">
                  <h3 className="font-semibold text-foreground">
                    {strategy.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {strategy.subtitle}
                  </p>
                </div>

                {/* Greeks Row */}
                <div className="flex gap-2 mb-4">
                  {(['delta', 'theta', 'gamma', 'vega'] as const).map((g) => {
                    const data = strategy.greeks[g];
                    const symbol =
                      g === 'delta'
                        ? 'Δ'
                        : g === 'theta'
                          ? 'Θ'
                          : g === 'gamma'
                            ? 'Γ'
                            : 'ν';
                    return (
                      <div
                        key={g}
                        className="flex-1 text-center p-1.5 rounded bg-background/50"
                      >
                        <div className="text-xs text-muted-foreground">
                          {symbol}
                        </div>
                        <div
                          className={cn(
                            'text-sm font-medium',
                            data.sentiment === 'positive' && 'text-emerald-500',
                            data.sentiment === 'negative' && 'text-rose-500',
                            data.sentiment === 'neutral' && 'text-amber-500',
                          )}
                        >
                          {data.value}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Focus & Avoid */}
                <div className="space-y-2 text-sm">
                  <div className="flex gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <p className="text-foreground">{strategy.focus}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                    <p className="text-foreground">{strategy.avoid}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex gap-4 justify-center text-xs text-muted-foreground">
            <span>
              <span className="text-emerald-500">+++</span> silně +
            </span>
            <span>
              <span className="text-emerald-500">+</span> mírně +
            </span>
            <span>
              <span className="text-amber-500">−</span> mírně −
            </span>
            <span>
              <span className="text-rose-500">−−−</span> silně −
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
