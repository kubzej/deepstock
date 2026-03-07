/**
 * AI Research API — generate and download AI-powered research reports
 */
import { API_URL } from './client';

export type ReportType = 'briefing' | 'full_analysis';

export interface AIResearchReport {
  markdown: string;
  ticker: string;
  company_name: string;
  report_type: ReportType;
  current_price: number;
  generated_at: string;
  model_used: string;
  cached: boolean;
}

export async function generateReport(
  ticker: string,
  currentPrice: number,
  reportType: ReportType,
  forceRefresh = false,
): Promise<AIResearchReport> {
  const response = await fetch(`${API_URL}/api/ai/research/${ticker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_price: currentPrice,
      report_type: reportType,
      force_refresh: forceRefresh,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function downloadPDF(
  ticker: string,
  reportType: ReportType,
  currentPrice?: number,
): Promise<void> {
  const params = new URLSearchParams({ report_type: reportType });
  if (currentPrice !== undefined) {
    params.set('current_price', String(currentPrice));
  }

  const response = await fetch(`${API_URL}/api/ai/research/${ticker}/pdf?${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  const label = reportType === 'briefing' ? 'briefing' : 'analyza';
  a.href = url;
  a.download = `${ticker}_${label}_${today}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
