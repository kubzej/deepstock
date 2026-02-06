/**
 * Shared constants for the frontend application
 */

// Exchange options for stock forms
export const EXCHANGE_OPTIONS = [
  { value: '', label: 'Bez burzy' },
  { value: 'NYSE', label: 'NYSE (USA)' },
  { value: 'NASDAQ', label: 'Nasdaq (USA)' },
  { value: 'LSE', label: 'London Stock Exchange (UK)' },
  { value: 'XETRA', label: 'Xetra / Deutsche Börse (DE)' },
  { value: 'SIX', label: 'SIX Swiss Exchange (CH)' },
  { value: 'TSX', label: 'Toronto Stock Exchange (CA)' },
  { value: 'ASX', label: 'Australian Securities Exchange (AU)' },
  { value: 'JPX', label: 'Japan Exchange Group (JP)' },
  { value: 'SSE', label: 'Shanghai Stock Exchange (CN)' },
  { value: 'HKEX', label: 'Hong Kong Exchanges (HK)' },
  { value: 'PSE', label: 'Philippine Stock Exchange (PH)' },
  { value: 'OMX-STO', label: 'Nasdaq Stockholm (SE)' },
  { value: 'VIE', label: 'Vienna Stock Exchange (AT)' },
  { value: 'WSE', label: 'Warsaw Stock Exchange (PL)' },
  { value: 'PSE-PRA', label: 'Prague Stock Exchange (CZ)' },
  { value: 'EURONEXT-PARIS', label: 'Euronext Paris (FR)' },
  { value: 'Other', label: 'Jiná' },
] as const;

// Currency options with label (for Select components)
export const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'JPY', label: 'JPY' },
  { value: 'CHF', label: 'CHF' },
  { value: 'CAD', label: 'CAD' },
  { value: 'AUD', label: 'AUD' },
  { value: 'CNY', label: 'CNY' },
  { value: 'CZK', label: 'CZK' },
  { value: 'HKD', label: 'HKD' },
  { value: 'SEK', label: 'SEK' },
  { value: 'DKK', label: 'DKK' },
  { value: 'NOK', label: 'NOK' },
  { value: 'PLN', label: 'PLN' },
  { value: 'HUF', label: 'HUF' },
] as const;

// Simple currency list (for backwards compatibility)
export const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CZK',
  'CHF',
  'CAD',
  'AUD',
  'JPY',
  'SEK',
  'DKK',
  'NOK',
  'PLN',
  'HUF',
  'HKD',
  'CNY',
] as const;

export type Currency = (typeof CURRENCIES)[number];
export type ExchangeValue = (typeof EXCHANGE_OPTIONS)[number]['value'];
