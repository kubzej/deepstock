/**
 * Distribution List Component
 * Shows portfolio breakdown with visual bar chart
 * Supports click-to-expand to show holdings in each category
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatPrice, formatPercent } from '@/lib/format';
import type { DistributionItem } from './utils';
import type { Holding } from '@/lib/api';

type GroupByField = 'sector' | 'country' | 'exchange';

interface DistributionListProps {
  title: string;
  items: DistributionItem[];
  /** Holdings to show when expanding items */
  holdings?: Holding[];
  /** Which field to group holdings by (must match the distribution) */
  groupBy?: GroupByField;
  /** Stock lookup for country/exchange fields */
  stockLookup?: Record<string, { country?: string; exchange?: string }>;
}

export function DistributionList({
  title,
  items,
  holdings,
  groupBy,
  stockLookup,
}: DistributionListProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  if (items.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-medium mb-3">{title}</h3>
        <p className="text-sm text-muted-foreground">Žádná data</p>
      </div>
    );
  }

  const maxPercent = Math.max(...items.map((i) => i.percent));
  const isInteractive = holdings && holdings.length > 0 && groupBy;

  const toggleExpand = (label: string) => {
    if (!isInteractive) return;
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(label)) {
        newSet.delete(label);
      } else {
        newSet.add(label);
      }
      return newSet;
    });
  };

  const getHoldingsForCategory = (categoryLabel: string): Holding[] => {
    if (!holdings || !groupBy) return [];

    return holdings.filter((h) => {
      if (groupBy === 'sector') {
        return (h.sector || 'Other') === categoryLabel;
      }
      if (groupBy === 'country' && stockLookup) {
        const stock = stockLookup[h.ticker];
        return (stock?.country || 'Ostatní') === categoryLabel;
      }
      if (groupBy === 'exchange' && stockLookup) {
        const stock = stockLookup[h.ticker];
        return (stock?.exchange || 'Ostatní') === categoryLabel;
      }
      return false;
    });
  };

  return (
    <div>
      <h3 className="text-sm font-medium mb-4">{title}</h3>
      <div className="space-y-3">
        {items.map((item) => {
          const isExpanded = expandedItems.has(item.label);
          const categoryHoldings = isInteractive
            ? getHoldingsForCategory(item.label)
            : [];

          return (
            <div key={item.label} className="space-y-1">
              <div
                className={`flex items-center justify-between text-sm ${
                  isInteractive
                    ? 'cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded'
                    : ''
                }`}
                onClick={() => toggleExpand(item.label)}
              >
                <span className="flex items-center gap-1.5 text-foreground">
                  {isInteractive && (
                    <span className="text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </span>
                  )}
                  {item.label}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground tabular-nums text-xs">
                    {formatPercent(item.percent, 1)}
                  </span>
                  <span className="font-mono-price text-xs w-20 text-right">
                    {formatPrice(item.value, 'CZK')}
                  </span>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-zinc-500"
                  style={{
                    width: `${(item.percent / maxPercent) * 100}%`,
                  }}
                />
              </div>

              {/* Expanded holdings list */}
              {isExpanded && categoryHoldings.length > 0 && (
                <div className="ml-5 mt-2 space-y-1 border-l border-border pl-3">
                  {categoryHoldings.map((h) => (
                    <div
                      key={h.ticker}
                      className="flex items-center justify-between text-xs text-muted-foreground"
                    >
                      <span>
                        <span className="font-medium text-foreground">
                          {h.ticker}
                        </span>{' '}
                        <span className="hidden sm:inline">· {h.name}</span>
                      </span>
                      <span className="font-mono-price">
                        {formatPrice(h.current_value || 0, 'CZK')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
