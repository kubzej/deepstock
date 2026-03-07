/**
 * Shared components for AI report display (used by AIResearchSection and AIPortfolioAdvisorSection).
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'právě teď';
  if (diffMins < 60) return `před ${diffMins} min`;
  if (diffHours < 24) return `před ${diffHours} h`;
  return date.toLocaleDateString('cs-CZ');
}

interface ReportMetaProps {
  generated_at: string;
  cached: boolean;
  model_used: string;
}

export function ReportMeta({ generated_at, cached, model_used }: ReportMetaProps) {
  const generatedAt = new Date(generated_at);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Clock className="w-3 h-3" />
      <span>{formatTimeAgo(generatedAt)}</span>
      {cached ? (
        <Badge variant="outline" className="text-xs py-0">
          cache
        </Badge>
      ) : (
        <Badge variant="outline" className="text-xs py-0 border-green-500/40 text-green-600 dark:text-green-400">
          nový
        </Badge>
      )}
      <span className="opacity-50">·</span>
      <span className="opacity-70">{model_used}</span>
    </div>
  );
}

export function MarkdownReport({ content }: { content: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed bg-muted rounded-lg p-5">
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
          ul: ({ children }) => <ul className="space-y-1.5 mb-4">{children}</ul>,
          ol: ({ children }) => (
            <ol className="space-y-1 mb-4 list-decimal list-inside text-sm text-foreground/90 leading-relaxed">
              {children}
            </ol>
          ),
          li: ({ ordered, children }) => {
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
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
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
            <a
              href={href}
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
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
