/**
 * Format number as currency (CZK by default)
 */
export function formatCurrency(
  value: number | null | undefined,
  currency: string = 'CZK'
): string {
  if (value === null || value === undefined) return '—';
  
  const formatter = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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
