/**
 * AI Research Section — generates and displays AI research reports.
 * Requires: npm install react-markdown
 */
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, RefreshCw, Download, Loader2, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { generateReport, downloadPDF, type AIResearchReport, type ReportType } from '@/lib/api/ai_research';

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
    <div className="flex items-start gap-3 p-4 bg-destructive/10 text-destructive rounded-lg">
      <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">Chyba při generování reportu</p>
        <p className="text-sm opacity-80">{message}</p>
      </div>
    </div>
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

function ReportMeta({ report }: { report: AIResearchReport }) {
  const generatedAt = new Date(report.generated_at);
  const timeAgo = formatTimeAgo(generatedAt);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Clock className="w-3 h-3" />
      <span>{timeAgo}</span>
      {report.cached && <Badge variant="outline" className="text-xs py-0">cache</Badge>}
      <span className="opacity-50">·</span>
      <span className="opacity-70">{report.model_used}</span>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'právě teď';
  if (diffMins < 60) return `před ${diffMins} min`;
  if (diffHours < 24) return `před ${diffHours} h`;
  return date.toLocaleDateString('cs-CZ');
}

function MarkdownReport({ content }: { content: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold tracking-tight text-foreground mt-8 mb-4 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold tracking-tight text-foreground mt-8 mb-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-foreground/80 mt-5 mb-1.5 italic">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-sm text-foreground/90 leading-relaxed mb-3">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="space-y-1.5 mb-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-1 mb-4 list-decimal list-inside text-sm text-foreground/90 leading-relaxed">{children}</ol>
          ),
          li: ({ children, ordered }) => {
            if (ordered) {
              return <li className="text-sm text-foreground/90 leading-relaxed">{children}</li>;
            }
            return (
              <li className="text-sm text-foreground/90 leading-relaxed flex items-start gap-2 list-none">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                <span>{children}</span>
              </li>
            );
          },
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-4 my-4 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/60">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2.5 text-sm border-b border-border/50">{children}</td>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
          ),
          hr: () => null,
          a: ({ href, children }) => (
            <a href={href} className="text-primary underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const TA_PERIODS = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1R' },
] as const;

export function AIResearchSection({ ticker, currentPrice }: AIResearchSectionProps) {
  const [activeReportType, setActiveReportType] = useState<ReportType>('full_analysis');
  const [taPeriod, setTaPeriod] = useState('3mo');
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
      const period = activeReportType === 'technical_analysis' ? taPeriod : '3mo';
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
      await downloadPDF(ticker, activeReportType, currentPrice ?? undefined, taPeriod);
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

            {/* Period selector — only for technical_analysis */}
            {activeReportType === 'technical_analysis' && (
              <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                {TA_PERIODS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setTaPeriod(value)}
                    className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                      taPeriod === value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {currentReport && (
            <div className="flex items-center gap-2">
              <ReportMeta report={currentReport} />
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
