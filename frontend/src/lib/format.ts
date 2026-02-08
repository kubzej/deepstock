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
export function getDaysUntilEarnings(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const earningsDay = new Date(dateStr);
  earningsDay.setHours(0, 0, 0, 0);
  return Math.ceil((earningsDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Check if earnings should show badge (within -7 to +14 days)
 */
export function shouldShowEarningsBadge(daysUntil: number | null): boolean {
  if (daysUntil === null) return false;
  return daysUntil >= -7 && daysUntil <= 14;
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
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return `${date.getDate()}. ${date.getMonth() + 1}.`;
}

/**
 * Format date in Czech format (e.g., "11. 2. 2026")
 */
export function formatDateCzech(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}. ${month}. ${year}`;
}
