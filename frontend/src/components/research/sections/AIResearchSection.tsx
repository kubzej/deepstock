/**
 * AI Research Section — generates and displays AI research reports.
 * Requires: npm install react-markdown
 */
import { useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Bot, RefreshCw, Download, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { generateReport, getCachedReport, downloadPDF, type AIResearchReport, type ReportType } from '@/lib/api/ai_research';
import { queryKeys } from '@/lib/queryClient';
import {
  EmptyState,
  ErrorState,
  GenerationState,
} from '@/components/shared';
import { ReportMeta, MarkdownReport } from '@/components/shared/AIReportComponents';

const REPORT_TYPES: ReportType[] = ['full_analysis', 'technical_analysis', 'briefing'];

interface AIResearchSectionProps {
  ticker: string;
  currentPrice: number | null | undefined;
}

export function AIResearchSection({ ticker, currentPrice }: AIResearchSectionProps) {
  const queryClient = useQueryClient();
  const [activeReportType, setActiveReportType] = useState<ReportType>('full_analysis');
  const [generated, setGenerated] = useState<Partial<Record<ReportType, AIResearchReport>>>({});
  const [loading, setLoading] = useState<ReportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const cachedQueries = useQueries({
    queries: REPORT_TYPES.map((type) => ({
      queryKey: ['ai-research-cache', ticker, type],
      queryFn: () => getCachedReport(ticker, type),
      retry: false,
      staleTime: Infinity,
    })),
  });

  const cached = Object.fromEntries(
    REPORT_TYPES.map((type, i) => [type, cachedQueries[i].data ?? null])
  ) as Partial<Record<ReportType, AIResearchReport>>;

  const currentReport = generated[activeReportType] ?? cached[activeReportType] ?? null;

  async function handleGenerate(forceRefresh = false) {
    if (!currentPrice) return;
    setLoading(activeReportType);
    setError(null);

    try {
      const period = '3mo';
      const report = await generateReport(ticker, currentPrice, activeReportType, forceRefresh, period);
      setGenerated((prev) => ({ ...prev, [activeReportType]: report }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.journalChannels() }),
        queryClient.invalidateQueries({ queryKey: ['journalEntries'] }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.journalEntriesByTicker(ticker),
        }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Neznámá chyba');
    } finally {
      setLoading(null);
    }
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      await downloadPDF(ticker, activeReportType, currentPrice ?? undefined, '3mo');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba při stahování PDF');
    } finally {
      setDownloadingPdf(false);
    }
  }

  const isLoading = loading === activeReportType;

  return (
    <div className="space-y-4">
      <Tabs value={activeReportType} onValueChange={(v) => setActiveReportType(v as ReportType)}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <TabsList className="inline-flex min-w-max">
                <TabsTrigger value="full_analysis">
                  <span className="sm:hidden">Plná</span>
                  <span className="hidden sm:inline">Plná analýza</span>
                </TabsTrigger>
                <TabsTrigger value="technical_analysis">
                  <span className="sm:hidden">Technická</span>
                  <span className="hidden sm:inline">Technická analýza</span>
                </TabsTrigger>
                <TabsTrigger value="briefing">
                  <span className="sm:hidden">Briefing</span>
                  <span className="hidden sm:inline">Kvartální briefing</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          {currentReport && (
            <div className="flex items-center gap-2">
              <ReportMeta generated_at={currentReport.generated_at} cached={currentReport.cached} model_used={currentReport.model_used} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleGenerate(true)}
                disabled={isLoading}
                title="Obnovit (ignorovat cache)"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
              >
                {downloadingPdf ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-1" />
                )}
                PDF
              </Button>
            </div>
          )}
        </div>

        {/* Report content area */}
        {REPORT_TYPES.map((type) => (
          <TabsContent key={type} value={type} className="mt-6">
            {isLoading && (
              <GenerationState
                title="Generuji AI report..."
                description={
                  type === 'technical_analysis'
                    ? 'Analyzuji technické indikátory.'
                    : 'Vyhledávám zprávy a skládám AI analýzu.'
                }
              />
            )}
            {error && !isLoading && (
              <ErrorState
                title="Nepodařilo se vygenerovat AI report"
                description={error}
                retryAction={{ label: 'Zkusit znovu', onClick: () => handleGenerate(true) }}
              />
            )}
            {!isLoading && !error && !currentReport && (
              <EmptyState
                icon={type === 'technical_analysis' ? Search : Bot}
                title="AI analýza ještě není připravená"
                description="Spusť generování a připravím report pro aktuální ticker a zvolený typ analýzy."
                action={{ label: 'Vygenerovat report', onClick: () => handleGenerate() }}
              />
            )}
            {!isLoading && currentReport && <MarkdownReport content={currentReport.markdown} />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
