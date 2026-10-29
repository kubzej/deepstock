/**
 * AI Portfolio Advisor Section — generates and displays a portfolio analysis report.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { generatePortfolioAdvisor, getCachedPortfolioAdvisor } from '@/lib/api/ai_portfolio';
import { queryKeys } from '@/lib/queryClient';
import { invalidateJournal } from '@/hooks/useJournal';
import { ReportMeta, MarkdownReport } from '@/components/shared/AIReportComponents';

export function AIPortfolioAdvisorSection() {
  const { activePortfolio } = usePortfolio();
  const portfolioId = activePortfolio?.id;

  // Keyed by portfolio so loading and error state never carry over to another one
  return (
    <PortfolioAdvisorReport
      key={portfolioId ?? 'all'}
      portfolioId={portfolioId}
      portfolioName={activePortfolio?.name}
    />
  );
}

interface PortfolioAdvisorReportProps {
  portfolioId: string | undefined;
  portfolioName: string | undefined;
}

function PortfolioAdvisorReport({ portfolioId, portfolioName }: PortfolioAdvisorReportProps) {
  const queryClient = useQueryClient();
  const reportKey = queryKeys.aiPortfolioReport(portfolioId);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A generated report is written into this query, so it belongs to the portfolio it was made for
  const { data: report = null } = useQuery({
    queryKey: reportKey,
    queryFn: () => getCachedPortfolioAdvisor(portfolioId),
    retry: false,
    staleTime: Infinity,
  });

  async function handleGenerate(force = false) {
    setLoading(true);
    setError(null);
    try {
      const result = await generatePortfolioAdvisor(portfolioId, force);
      queryClient.setQueryData(reportKey, result);
      // The server saves the report as a journal entry
      invalidateJournal(queryClient);
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
              {portfolioName && (
                <> Analyzuje portfolio <strong>{portfolioName}</strong>.</>
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
