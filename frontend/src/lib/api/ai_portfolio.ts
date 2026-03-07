/**
 * AI Portfolio Advisor API — generate portfolio analysis and recommendations
 */
import { API_URL, getAuthHeader } from './client';

export interface PortfolioAdvisorResponse {
  markdown: string;
  cached: boolean;
  generated_at: string;
  model_used: string;
}

export async function generatePortfolioAdvisor(portfolioId?: string): Promise<PortfolioAdvisorResponse> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${API_URL}/api/ai/portfolio-advisor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ portfolio_id: portfolioId ?? null }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}
