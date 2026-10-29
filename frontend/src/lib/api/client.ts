/**
 * API Client - Core setup for all API calls
 */
import { supabase } from '../supabase';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Get authorization header with current session token
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

/** One page of a newest-first list; `next_cursor` is null on the last page. */
export interface CursorPage<T> {
  data: T[];
  next_cursor: string | null;
}

/** Page size used when a screen needs the whole history. */
export const FULL_HISTORY_PAGE_SIZE = 500;

/** Walk every page of a cursor-paginated list and return all rows, newest first. */
export async function collectPages<T>(
  fetchPage: (cursor: string | null) => Promise<CursorPage<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  do {
    const page: CursorPage<T> = await fetchPage(cursor);
    rows.push(...page.data);
    cursor = page.next_cursor;
  } while (cursor);
  return rows;
}
