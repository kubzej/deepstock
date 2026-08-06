/**
 * Format number as currency (CZK by default)
 * CZK uses 0 decimals (portfolio totals), other currencies use 2 decimals (stock prices)
 */
export function formatCurrency(
  value: number | null | undefined,
  currency: string = 'CZK'
): string {
  if (value === null || value === undefined) return '—';
  
  // CZK is typically used for large portfolio totals — 0 decimals
  // USD/EUR/GBP/CHF stock prices need 2 decimals
  const decimals = currency === 'CZK' ? 0 : 2;
  
  const formatter = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  
  return formatter.format(value);
}

/**
 * Format number as price (with decimals and optional currency symbol)
 */
export function formatPrice(
  value: number | null | undefined,
  currency?: string,
  decimals: number = 2
): string {
  if (value === null || value === undefined) return '—';
  
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  
  if (currency) {
    const symbols: Record<string, string> = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      CZK: 'Kč',
      CHF: 'CHF',
    };
    const symbol = symbols[currency] || currency;
    return currency === 'CZK' ? `${formatted} ${symbol}` : `${symbol}${formatted}`;
  }
  
  return formatted;
}

/**
 * Format as percentage
 */
export function formatPercent(
  value: number | null | undefined,
  decimals: number = 2,
  showSign: boolean = false
): string {
  if (value === null || value === undefined) return '—';
  
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format decimal ratio as percentage (e.g., 0.41 → "41.00%")
 * Use for API data that comes as decimals (margins, yields, etc.)
 */
export function formatRatioAsPercent(
  value: number | null | undefined,
  decimals: number = 2,
  showSign: boolean = false
): string {
  if (value === null || value === undefined) return '—';
  
  const percentValue = value * 100;
  const sign = showSign && percentValue > 0 ? '+' : '';
  return `${sign}${percentValue.toFixed(decimals)}%`;
}

/**
 * Format number with thousands separator
 */
export function formatNumber(
  value: number | null | undefined,
  decimals: number = 0
): string {
  if (value === null || value === undefined) return '—';
  
  return new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format shares/quantity smartly:
 * - Whole numbers: no decimals (31 ks)
 * - Fractional: up to 4 decimals, trimmed (0.1683 ks)
 */
export function formatShares(
  value: number | null | undefined
): string {
  if (value === null || value === undefined) return '—';
  
  // Check if it's effectively a whole number
  if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 0.0001) {
    return Math.round(value).toString();
  }
  
  // For fractional, use up to 4 decimals and trim trailing zeros
  const formatted = value.toFixed(4).replace(/\.?0+$/, '');
  return formatted;
}

/**
 * Format date to Czech locale
 */
export function formatDate(
  date: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '—';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  return d.toLocaleDateString('cs-CZ', options || {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format volume ratio (daily/avg)
 */
export function formatVolumeRatio(
  daily: number | null | undefined,
  avg: number | null | undefined
): string {
  if (daily === null || daily === undefined || avg === null || avg === undefined || avg === 0) {
    return '—';
  }
  const ratio = daily / avg;
  return ratio.toFixed(2) + '×';
}

/**
 * Format large numbers with K/M/B suffixes
 */
export function formatLargeNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(2)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(2)}M`;
  }
  if (absValue >= 1_000) {
    return `${sign}${(absValue / 1_000).toFixed(2)}K`;
  }
  return `${sign}${absValue.toFixed(0)}`;
}

/**
 * Convert amount to CZK using exchange rate
 */
export function toCZK(
  amount: number,
  currency: string,
  rates: { [key: string]: number }
): number {
  if (currency === 'CZK') return amount;
  const rate = rates[currency] || 1;
  return amount * rate;
}

/**
 * Convert amount from CZK to target currency using exchange rate
 */
export function fromCZK(
  amountCzk: number,
  currency: string,
  rates: { [key: string]: number }
): number {
  if (currency === 'CZK') return amountCzk;
  const rate = rates[currency] || 1;
  return rate > 0 ? amountCzk / rate : amountCzk;
}

/**
 * Format ratio value with specified decimals
 */
export function formatRatio(
  value: number | null | undefined,
  decimals: number = 2
): string {
  if (value === null || value === undefined) return '—';
  return value.toFixed(decimals);
}

/**
 * Determine smart number of decimal places for price axis/display
 * based on min/max range. Ensures we always show meaningful precision.
 */
export function getSmartDecimals(prices: number[]): number {
  if (prices.length === 0) return 2;
  
  const validPrices = prices.filter((p) => p != null && isFinite(p));
  if (validPrices.length === 0) return 2;
  
  const min = Math.min(...validPrices);
  const max = Math.max(...validPrices);
  const range = max - min;
  
  // Very tight range — show more decimals
  if (range < 0.1) return 4;
  if (range < 1) return 3;
  if (range < 10) return 2;
  if (range < 100) return 1;
  return 0;
}

/**
 * Calculate days until earnings (negative = past)
 */
function parseCalendarDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

export function getDaysUntilEarnings(dateStr: string | null | undefined): number | null {
  const earningsDay = parseCalendarDate(dateStr);
  if (!earningsDay) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  earningsDay.setHours(0, 0, 0, 0);
  return Math.round((earningsDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Check if earnings should show badge (within -7 to +14 days)
 */
export function shouldShowEarningsBadge(daysUntil: number | null): boolean {
  if (daysUntil === null) return false;
  return daysUntil >= -7 && daysUntil <= 14;
}

/**
 * Whether to show a clock time (release/call) next to the earnings date.
 * Tighter than the badge window on purpose — yfinance's call-time field is
 * only reliable within a couple of days of the actual event; further out it
 * returns a generic placeholder unrelated to the real time.
 */
const EARNINGS_TIME_WINDOW_DAYS = 2;

export function shouldShowEarningsTime(daysUntil: number | null): boolean {
  if (daysUntil === null) return false;
  return Math.abs(daysUntil) <= EARNINGS_TIME_WINDOW_DAYS;
}

/**
 * Whether a call timestamp actually belongs to the same earnings event as
 * the release timestamp. yfinance leaves the call field pointing at the
 * PREVIOUS quarter's call until the upcoming one is confirmed, so a call
 * date far from the release date is stale data, not "call is days away" —
 * only trust it when it falls on the release day or the day after (covers
 * same-day calls and next-morning calls after an after-close release).
 */
export function shouldShowEarningsCallTime(
  earningsTimestamp: string | null | undefined,
  callTimestamp: string | null | undefined
): boolean {
  if (!earningsTimestamp || !callTimestamp) return false;
  const release = new Date(earningsTimestamp);
  const call = new Date(callTimestamp);
  if (isNaN(release.getTime()) || isNaN(call.getTime())) return false;
  const releaseDay = Date.UTC(release.getUTCFullYear(), release.getUTCMonth(), release.getUTCDate());
  const callDay = Date.UTC(call.getUTCFullYear(), call.getUTCMonth(), call.getUTCDate());
  const diffDays = Math.round((callDay - releaseDay) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 1;
}

/**
 * Format an ISO timestamp as HH:mm in Europe/Prague local time.
 */
export function formatTimePrague(isoString: string | null | undefined): string | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Format earnings badge label for mobile/highlights
 * Only for earnings within -7 to +14 days
 */
export function formatEarningsBadge(daysUntil: number | null): string | null {
  if (daysUntil === null) return null;
  if (!shouldShowEarningsBadge(daysUntil)) return null;
  
  if (daysUntil < 0) {
    const absDays = Math.abs(daysUntil);
    if (absDays === 1) return 'Včera';
    // Czech grammar - instrumental case: always "dny" for plural
    return `Před ${absDays} dny`;
  }
  if (daysUntil === 0) return 'Dnes';
  if (daysUntil === 1) return 'Zítra';
  // Czech grammar - accusative case: 2-4 = dny, 5+ = dní
  const dayWord = daysUntil >= 5 ? 'dní' : 'dny';
  return `Za ${daysUntil} ${dayWord}`;
}

/**
 * Check if earnings is in the past
 */
export function isEarningsPast(daysUntil: number | null): boolean {
  return daysUntil !== null && daysUntil < 0;
}

/**
 * Format date in Czech short format (e.g., "11. 2.")
 */
export function formatDateCzechShort(dateStr: string | null | undefined): string {
  const date = parseCalendarDate(dateStr);
  if (!date) return dateStr || '—';
  return `${date.getDate()}. ${date.getMonth() + 1}.`;
}

/**
 * Format date in Czech format (e.g., "11. 2. 2026")
 */
export function formatDateCzech(dateStr: string | null | undefined): string {
  const date = parseCalendarDate(dateStr);
  if (!date) return dateStr || '—';

  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}. ${month}. ${year}`;
}

export function getDateSortValue(dateStr: string | null | undefined): number | null {
  const date = parseCalendarDate(dateStr);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
