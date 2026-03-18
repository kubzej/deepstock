import { API_URL, getAuthHeader } from './client';

// ============================================
// Types
// ============================================

export interface JournalSection {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_system: boolean;
  created_at: string;
}

export interface JournalChannel {
  id: string;
  type: 'stock' | 'custom';
  name: string;
  stock_id: string | null;
  ticker: string | null;
  section_id: string | null;
  sort_order: number;
  created_at: string;
  entry_count: number;
  stock_name: string | null;
}

export type JournalEntryType = 'note' | 'ai_report' | 'ext_ref' | 'transaction' | 'option_trade';

export interface TransactionEntryMetadata {
  action: 'BUY' | 'SELL';
  shares: number;
  price: number;
  currency: string;
  fees: number;
  ticker: string;
}

export interface OptionTradeEntryMetadata {
  action: 'BTO' | 'STC' | 'STO' | 'BTC' | 'EXPIRATION' | 'ASSIGNMENT' | 'EXERCISE';
  option_type: 'call' | 'put';
  strike: number;
  expiration: string;
  contracts: number;
  premium: number | null;
  option_symbol: string;
  ticker: string;
}

export interface JournalEntry {
  id: string;
  channel_id: string;
  type: JournalEntryType;
  content: string;
  metadata: {
    // note
    price_at_creation?: number;
    // ai_report
    report_type?: 'research' | 'technical' | 'full_analysis';
    ticker?: string;
    model?: string;
    // ext_ref
    url?: string;
    label?: string;
    og_title?: string;
    og_description?: string;
    og_image?: string;
    discord_content?: string;
    discord_author?: string;
    // transaction / option_trade shared
    action?: string;
    portfolio_id?: string;
    // transaction
    shares?: number;
    price?: number;
    currency?: string;
    fees?: number;
    // option_trade
    option_type?: 'call' | 'put';
    strike?: number;
    expiration?: string;
    contracts?: number;
    premium?: number | null;
    option_symbol?: string;
  };
  created_at: string;
  updated_at: string | null;
}

export interface EntryCreateData {
  channel_id: string;
  type: JournalEntryType;
  content: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Sections
// ============================================

export async function fetchJournalSections(): Promise<JournalSection[]> {
  const res = await fetch(`${API_URL}/api/journal/sections`, {
    headers: await getAuthHeader(),
  });
  if (!res.ok) throw new Error('Chyba při načítání sekcí');
  return res.json();
}

export async function createJournalSection(data: { name: string; color?: string }): Promise<JournalSection> {
  const res = await fetch(`${API_URL}/api/journal/sections`, {
    method: 'POST',
    headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Chyba při vytváření sekce');
  return res.json();
}

export async function updateJournalSection(id: string, data: Partial<JournalSection>): Promise<JournalSection> {
  const res = await fetch(`${API_URL}/api/journal/sections/${id}`, {
    method: 'PATCH',
    headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Chyba při úpravě sekce');
  return res.json();
}

export async function deleteJournalSection(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/journal/sections/${id}`, {
    method: 'DELETE',
    headers: await getAuthHeader(),
  });
  if (!res.ok) throw new Error('Chyba při mazání sekce');
}

// ============================================
// Channels
// ============================================

export async function fetchJournalChannels(): Promise<JournalChannel[]> {
  const res = await fetch(`${API_URL}/api/journal/channels`, {
    headers: await getAuthHeader(),
  });
  if (!res.ok) throw new Error('Chyba při načítání kanálů');
  return res.json();
}

export async function createJournalChannel(data: { name: string; section_id?: string }): Promise<JournalChannel> {
  const res = await fetch(`${API_URL}/api/journal/channels`, {
    method: 'POST',
    headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Chyba při vytváření kanálu');
  return res.json();
}

export async function updateJournalChannel(id: string, data: Partial<JournalChannel>): Promise<JournalChannel> {
  const res = await fetch(`${API_URL}/api/journal/channels/${id}`, {
    method: 'PATCH',
    headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Chyba při úpravě kanálu');
  return res.json();
}

export async function deleteJournalChannel(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/journal/channels/${id}`, {
    method: 'DELETE',
    headers: await getAuthHeader(),
  });
  if (!res.ok) throw new Error('Chyba při mazání kanálu');
}

// ============================================
// Entries
// ============================================

export interface FetchEntriesParams {
  channel_id?: string;
  ticker?: string;
  cursor?: string;
  limit?: number;
}

export async function fetchJournalEntries(params: FetchEntriesParams): Promise<JournalEntry[]> {
  const query = new URLSearchParams();
  if (params.channel_id) query.set('channel_id', params.channel_id);
  if (params.ticker) query.set('ticker', params.ticker);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));

  const res = await fetch(`${API_URL}/api/journal/entries?${query}`, {
    headers: await getAuthHeader(),
  });
  if (!res.ok) throw new Error('Chyba při načítání poznámek');
  return res.json();
}

export async function createJournalEntry(data: EntryCreateData): Promise<JournalEntry> {
  const res = await fetch(`${API_URL}/api/journal/entries`, {
    method: 'POST',
    headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Chyba při přidávání poznámky');
  return res.json();
}

export async function updateJournalEntry(id: string, content: string): Promise<JournalEntry> {
  const res = await fetch(`${API_URL}/api/journal/entries/${id}`, {
    method: 'PATCH',
    headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Chyba při úpravě poznámky');
  return res.json();
}

export async function uploadJournalImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_URL}/api/journal/upload-image`, {
    method: 'POST',
    headers: await getAuthHeader(),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? 'Chyba při nahrávání obrázku');
  }
  const data = await res.json();
  return data.url;
}

export interface UrlPreview {
  title: string;
  description: string;
  image: string;
}

export async function fetchUrlPreview(url: string): Promise<UrlPreview> {
  const res = await fetch(
    `${API_URL}/api/journal/url-preview?url=${encodeURIComponent(url)}`,
    { headers: await getAuthHeader() }
  );
  if (!res.ok) throw new Error('Nepodařilo se načíst preview');
  return res.json();
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/journal/entries/${id}`, {
    method: 'DELETE',
    headers: await getAuthHeader(),
  });
  if (!res.ok) throw new Error('Chyba při mazání poznámky');
}

