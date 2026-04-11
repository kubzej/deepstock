/**
 * AI Research Section — generates and displays AI research reports.
 * Requires: npm install react-markdown
 */
import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Bot, RefreshCw, Download, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { generateReport, getCachedReport, downloadPDF, type AIResearchReport, type ReportType } from '@/lib/api/ai_research';
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
          <div className="flex items-center gap-3">
            <TabsList>
              <TabsTrigger value="full_analysis">Plná analýza</TabsTrigger>
              <TabsTrigger value="technical_analysis">Technická analýza</TabsTrigger>
              <TabsTrigger value="briefing">Kvartální briefing</TabsTrigger>
            </TabsList>

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
                    ? 'Analyzuji technické indikátory. Může to trvat 10 až 20 sekund.'
                    : 'Vyhledávám zprávy a skládám AI analýzu. Může to trvat 30 až 60 sekund.'
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
