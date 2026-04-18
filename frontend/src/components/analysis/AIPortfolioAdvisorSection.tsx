/**
 * AI Portfolio Advisor Section — generates and displays a portfolio analysis report.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { generatePortfolioAdvisor, getCachedPortfolioAdvisor, type PortfolioAdvisorResponse } from '@/lib/api/ai_portfolio';
import { ReportMeta, MarkdownReport } from '@/components/shared/AIReportComponents';

export function AIPortfolioAdvisorSection() {
  const queryClient = useQueryClient();
  const { activePortfolio } = usePortfolio();
  const portfolioId = activePortfolio?.id;

  const [generated, setGenerated] = useState<PortfolioAdvisorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: cached } = useQuery({
    queryKey: ['ai-portfolio-cache', portfolioId ?? 'all'],
    queryFn: () => getCachedPortfolioAdvisor(portfolioId),
    retry: false,
    staleTime: Infinity,
  });

  const report = generated ?? cached ?? null;

  async function handleGenerate(force = false) {
    setLoading(true);
    setError(null);
    try {
      const result = await generatePortfolioAdvisor(portfolioId, force);
      setGenerated(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['journalChannels'] }),
        queryClient.invalidateQueries({ queryKey: ['journalEntries'] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Neznámá chyba');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {report && (
        <div className="flex items-center justify-end gap-2">
          <ReportMeta
            generated_at={report.generated_at}
            cached={report.cached}
            model_used={report.model_used}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleGenerate(true)}
            disabled={loading}
            title="Obnovit (ignorovat cache)"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <div className="text-center space-y-1">
            <p className="font-medium">Analyzuji portfolio...</p>
            <p className="text-sm">Načítám holdingy, technické signály a transakce.</p>
          </div>
        </div>
      )}

      {!loading && !error && !report && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
          <Bot className="w-12 h-12 opacity-30" />
          <div className="text-center space-y-1">
            <p className="font-medium text-foreground">AI přehled portfolia</p>
            <p className="text-sm">
              Získej souhrn portfolia a konkrétní doporučení na základě holdingů,
              technických signálů a nedávných transakcí.
              {activePortfolio && (
                <> Analyzuje portfolio <strong>{activePortfolio.name}</strong>.</>
              )}
            </p>
          </div>
          <Button onClick={() => handleGenerate()} className="mt-2">
            <Bot className="w-4 h-4 mr-2" />
            Vytvořit AI přehled
          </Button>
        </div>
      )}

      {!loading && report && <MarkdownReport content={report.markdown} />}
    </div>
  );
}
