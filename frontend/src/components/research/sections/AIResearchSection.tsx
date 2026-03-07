/**
 * AI Research Section — generates and displays AI research reports.
 * Requires: npm install react-markdown
 */
import { useState } from 'react';
import { Bot, RefreshCw, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { generateReport, downloadPDF, type AIResearchReport, type ReportType } from '@/lib/api/ai_research';
import { ReportMeta, MarkdownReport } from '@/components/shared/AIReportComponents';

interface AIResearchSectionProps {
  ticker: string;
  currentPrice: number | null | undefined;
}

function LoadingState({ isTechnical = false }: { isTechnical?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
      <Loader2 className="w-8 h-8 animate-spin" />
      <div className="text-center space-y-1">
        <p className="font-medium">Generuji report...</p>
        <p className="text-sm">
          {isTechnical
            ? 'Analyzuji technické indikátory. Může trvat 10–20 sekund.'
            : 'Vyhledávám zprávy a analyzuji data. Může trvat 30–60 sekund.'}
        </p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
      <Bot className="w-12 h-12 opacity-30" />
      <div className="text-center space-y-1">
        <p className="font-medium text-foreground">AI analýza ještě nebyla vygenerována</p>
        <p className="text-sm">Klikni na tlačítko níže pro spuštění analýzy.</p>
      </div>
      <Button onClick={onGenerate} className="mt-2">
        <Bot className="w-4 h-4 mr-2" />
        Vygenerovat report
      </Button>
    </div>
  );
}


export function AIResearchSection({ ticker, currentPrice }: AIResearchSectionProps) {
  const [activeReportType, setActiveReportType] = useState<ReportType>('full_analysis');
  const [reports, setReports] = useState<Partial<Record<ReportType, AIResearchReport>>>({});
  const [loading, setLoading] = useState<ReportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const currentReport = reports[activeReportType];

  async function handleGenerate(forceRefresh = false) {
    if (!currentPrice) return;
    setLoading(activeReportType);
    setError(null);

    try {
      const period = '3mo';
      const report = await generateReport(ticker, currentPrice, activeReportType, forceRefresh, period);
      setReports((prev) => ({ ...prev, [activeReportType]: report }));
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
        {(['full_analysis', 'technical_analysis', 'briefing'] as ReportType[]).map((type) => (
          <TabsContent key={type} value={type} className="mt-6">
            {isLoading && <LoadingState isTechnical={type === 'technical_analysis'} />}
            {error && !isLoading && <ErrorState message={error} />}
            {!isLoading && !error && !currentReport && (
              <EmptyState onGenerate={() => handleGenerate()} />
            )}
            {!isLoading && currentReport && <MarkdownReport content={currentReport.markdown} />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
