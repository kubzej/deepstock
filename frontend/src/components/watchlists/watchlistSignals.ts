import type { Quote, WatchlistItem } from '@/lib/api';
import { formatPercent, formatPrice } from '@/lib/format';

export type WatchlistSignalTone = 'buy' | 'sell' | 'neutral';

export interface WatchlistSignalSummary {
  tone: WatchlistSignalTone;
  label: string;
  detail: string;
}

export interface WatchlistTargetSummary {
  key: 'buy' | 'sell';
  label: string;
  value: string;
  detail: string;
  active: boolean;
}

export function isAtBuyTarget(item: WatchlistItem, quote?: Quote | null): boolean {
  if (!item.target_buy_price || !quote) return false;
  return quote.price <= item.target_buy_price;
}

export function isAtSellTarget(item: WatchlistItem, quote?: Quote | null): boolean {
  if (!item.target_sell_price || !quote) return false;
  return quote.price >= item.target_sell_price;
}

export function getWatchlistActiveTarget(
  item: WatchlistItem,
  quote?: Quote | null,
): 'buy' | 'sell' | null {
  const sellActive = isAtSellTarget(item, quote);
  if (sellActive) return 'sell';

  const buyActive = isAtBuyTarget(item, quote);
  if (buyActive) return 'buy';

  return null;
}

function getDistancePercent(price: number, target: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(target) || target === 0) {
    return null;
  }

  return Math.abs(((price - target) / target) * 100);
}

function describeTargetDistance(
  target: number | null,
  quote: Quote | null | undefined,
): string {
  if (!target) return 'Nenastaveno';
  if (!quote) return 'Bez kurzu';

  const distance = getDistancePercent(quote.price, target);
  if (distance === null) return 'Bez kurzu';
  if (distance < 0.05) return 'Na ceně';

  return `${formatPercent(distance, 1)} ${quote.price > target ? 'nad' : 'pod'}`;
}

function getSignalDistanceLabel(
  target: number | null,
  quote: Quote | null | undefined,
  targetLabel: string,
): string | null {
  if (!target || !quote) return null;

  const distance = getDistancePercent(quote.price, target);
  if (distance === null) return null;
  if (distance < 0.05) return `na úrovni ${targetLabel.toLowerCase()}`;

  return `${formatPercent(distance, 1)} ${quote.price > target ? 'nad' : 'pod'} ${targetLabel.toLowerCase()}`;
}

export function getWatchlistSignalSummary(
  item: WatchlistItem,
  quote: Quote | null | undefined,
): WatchlistSignalSummary {
  const activeTarget = getWatchlistActiveTarget(item, quote);

  if (activeTarget === 'sell') {
    return {
      tone: 'sell',
      label: 'U prodeje',
      detail:
        getSignalDistanceLabel(item.target_sell_price, quote, 'prodejním cíli') ??
        'na úrovni prodejního cíle',
    };
  }

  if (activeTarget === 'buy') {
    return {
      tone: 'buy',
      label: 'U nákupu',
      detail:
        getSignalDistanceLabel(item.target_buy_price, quote, 'nákupním cíli') ??
        'na úrovni nákupního cíle',
    };
  }

  if (item.target_buy_price && item.target_sell_price && quote) {
    const buyDistance = getDistancePercent(quote.price, item.target_buy_price);
    const sellDistance = getDistancePercent(quote.price, item.target_sell_price);

    if (buyDistance !== null && sellDistance !== null) {
      if (buyDistance <= sellDistance) {
        return {
          tone: 'neutral',
          label: 'Blíže nákupu',
          detail: `${formatPercent(buyDistance, 1)} od nákupního cíle`,
        };
      }

      return {
          tone: 'neutral',
          label: 'Blíže prodeji',
          detail: `${formatPercent(sellDistance, 1)} od prodejního cíle`,
      };
    }
  }

  if (item.target_buy_price) {
    return {
      tone: 'neutral',
      label: 'Sledovat nákup',
      detail:
        getSignalDistanceLabel(item.target_buy_price, quote, 'nákupním cílem') ??
        'sledovat nákupní cíl',
    };
  }

  if (item.target_sell_price) {
    return {
      tone: 'neutral',
      label: 'Sledovat prodej',
      detail:
        getSignalDistanceLabel(item.target_sell_price, quote, 'prodejním cílem') ??
        'sledovat prodejní cíl',
    };
  }

  return {
    tone: 'neutral',
    label: 'Bez cíle',
    detail: '',
  };
}

export function getWatchlistTargetSummaries(
  item: WatchlistItem,
  quote: Quote | null | undefined,
): WatchlistTargetSummary[] {
  const activeTarget = getWatchlistActiveTarget(item, quote);

  return [
    {
      key: 'buy',
      label: 'Nákup',
      value: item.target_buy_price
        ? formatPrice(item.target_buy_price, item.stocks.currency)
        : '—',
      detail: describeTargetDistance(item.target_buy_price, quote),
      active: activeTarget === 'buy',
    },
    {
      key: 'sell',
      label: 'Prodej',
      value: item.target_sell_price
        ? formatPrice(item.target_sell_price, item.stocks.currency)
        : '—',
      detail: describeTargetDistance(item.target_sell_price, quote),
      active: activeTarget === 'sell',
    },
  ];
}
