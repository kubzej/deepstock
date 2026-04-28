type MarketStatus = 'OPEN' | 'CLOSED';

interface Session {
  open: [number, number];
  close: [number, number];
}

interface ExchangeSchedule {
  timezone: string;
  sessions: Session[];
}

const SCHEDULES: Record<string, ExchangeSchedule> = {
  HKEX: {
    timezone: 'Asia/Hong_Kong',
    sessions: [
      { open: [9, 30], close: [12, 0] },
      { open: [13, 0], close: [16, 0] },
    ],
  },
  LSE: {
    timezone: 'Europe/London',
    sessions: [{ open: [8, 0], close: [16, 30] }],
  },
  EU: {
    timezone: 'Europe/Berlin',
    sessions: [{ open: [9, 0], close: [17, 30] }],
  },
  US: {
    timezone: 'America/New_York',
    sessions: [{ open: [9, 30], close: [16, 0] }],
  },
};

const SUFFIX_TO_EXCHANGE: Record<string, string> = {
  HK: 'HKEX',
  L: 'LSE',
  DE: 'EU',
  PA: 'EU',
  AS: 'EU',
  MI: 'EU',
  BR: 'EU',
  MC: 'EU',
  VI: 'EU',
  SW: 'EU',
};

export function getMarketStatus(ticker: string, now = new Date()): MarketStatus {
  const suffix = ticker.includes('.') ? ticker.split('.').pop()!.toUpperCase() : '';
  const exchangeKey = SUFFIX_TO_EXCHANGE[suffix] ?? 'US';
  const { timezone, sessions } = SCHEDULES[exchangeKey];

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  if (weekday === 'Sat' || weekday === 'Sun') return 'CLOSED';

  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const currentMinutes = hour * 60 + minute;

  for (const { open, close } of sessions) {
    const openMinutes = open[0] * 60 + open[1];
    const closeMinutes = close[0] * 60 + close[1];
    if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
      return 'OPEN';
    }
  }

  return 'CLOSED';
}
