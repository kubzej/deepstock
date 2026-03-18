import { useState } from 'react';
import { Pencil, Trash2, ExternalLink, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RichTextEditor } from './RichTextEditor';
import { RichTextContent } from './RichTextContent';
import type { JournalEntry } from '@/lib/api/journal';
import { MarkdownReport } from '@/components/shared/AIReportComponents';
import { usePortfolio } from '@/contexts/PortfolioContext';

interface JournalEntryCardProps {
  entry: JournalEntry;
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  isDeleting?: boolean;
  isUpdating?: boolean;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatDateOnly(iso: string) {
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(price);
}

export function JournalEntryCard({
  entry,
  onDelete,
  onUpdate,
  isDeleting,
  isUpdating,
}: JournalEntryCardProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(entry.content);
  const [reportExpanded, setReportExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { portfolios } = usePortfolio();
  const portfolioName = entry.metadata.portfolio_id
    ? (portfolios.find(p => p.id === entry.metadata.portfolio_id)?.name ?? null)
    : null;

  const handleSaveEdit = () => {
    if (editContent.trim() === entry.content.trim()) {
      setEditing(false);
      return;
    }
    onUpdate(entry.id, editContent);
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(entry.content);
    setEditing(false);
  };

  // ── note ──────────────────────────────────────────
  if (entry.type === 'note') {
    return (
      <div className="rounded-lg bg-muted/30 px-4 py-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
            {entry.updated_at && (
              <span className="text-xs text-muted-foreground/60">(upraveno)</span>
            )}
            {entry.metadata.price_at_creation !== undefined && (
              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {formatPrice(entry.metadata.price_at_creation)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => { setEditing(true); setEditContent(entry.content); }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-2">
            <RichTextEditor
              content={editContent}
              onChange={setEditContent}
              onSubmit={handleSaveEdit}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit} disabled={isUpdating}>
                {isUpdating ? 'Ukládám...' : 'Uložit'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                Zrušit
              </Button>
            </div>
          </div>
        ) : (
          <RichTextContent html={entry.content} />
        )}

        {/* Delete confirm */}
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Smazat poznámku?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Tuto akci nelze vrátit.</p>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                Zrušit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isDeleting}
                onClick={() => { setConfirmDelete(false); onDelete(entry.id); }}
              >
                Smazat
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── ai_report ─────────────────────────────────────
  if (entry.type === 'ai_report') {
    const reportTypeLabel: Record<string, string> = {
      briefing: 'Kvartální briefing',
      full_analysis: 'Plná analýza',
      technical_analysis: 'Technická analýza',
    };
    const label = entry.metadata.report_type
      ? reportTypeLabel[entry.metadata.report_type] ?? 'AI přehled'
      : 'AI přehled';

    return (
      <div className="rounded-lg bg-muted/30 overflow-hidden">
        {/* Clickable header */}
        <div
          className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none"
          onClick={() => setReportExpanded(v => !v)}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
              AI
            </span>
            <span className="text-sm font-medium">{label}</span>
            {entry.metadata.ticker && (
              <span className="text-xs text-muted-foreground">{entry.metadata.ticker}</span>
            )}
            <span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${reportExpanded ? 'rotate-180' : ''}`} />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Expanded report */}
        {reportExpanded && (
          <div className="px-4 pb-3">
            <MarkdownReport content={entry.content} />
          </div>
        )}

        {/* Delete confirm */}
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Smazat přehled?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Tuto akci nelze vrátit.</p>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                Zrušit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isDeleting}
                onClick={() => { setConfirmDelete(false); onDelete(entry.id); }}
              >
                Smazat
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── ext_ref ───────────────────────────────────────
  if (entry.type === 'ext_ref') {
    return (
      <div className="rounded-lg bg-muted/30 px-4 py-3">
        {/* Header: date + actions */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
            {entry.updated_at && (
              <span className="text-xs text-muted-foreground/60">(upraveno)</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => { setEditing(true); setEditContent(entry.content); }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Link — always at top */}
        {entry.metadata.url && (
          <a
            href={entry.metadata.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline mb-3"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            {entry.metadata.label || entry.metadata.og_title || entry.metadata.url}
          </a>
        )}

        {/* OG preview image + description */}
        {(entry.metadata.og_image || entry.metadata.og_description) && (
          <div className="rounded-md border border-border overflow-hidden mb-3">
            {entry.metadata.og_image && (
              <img src={entry.metadata.og_image} alt="" className="w-full h-32 object-cover" />
            )}
            {entry.metadata.og_description && (
              <p className="px-3 py-2 text-xs text-muted-foreground line-clamp-2">
                {entry.metadata.og_description}
              </p>
            )}
          </div>
        )}

        {/* Quoted message (manual or Twitter text) */}
        {entry.metadata.discord_content && (
          <blockquote className="mb-3 pl-3 border-l-2 border-muted-foreground/30 text-sm text-muted-foreground whitespace-pre-wrap italic">
            {entry.metadata.discord_author && (
              <span className="block text-xs font-medium not-italic mb-0.5">{entry.metadata.discord_author}</span>
            )}
            {entry.metadata.discord_content}
          </blockquote>
        )}

        {editing ? (
          <div className="space-y-2">
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              rows={3}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Komentář (volitelné)…"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit} disabled={isUpdating}>
                {isUpdating ? 'Ukládám...' : 'Uložit'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                Zrušit
              </Button>
            </div>
          </div>
        ) : (
          entry.content && (
            <p className="text-sm whitespace-pre-wrap">{entry.content}</p>
          )
        )}

        {/* Delete confirm */}
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Smazat odkaz?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Tuto akci nelze vrátit.</p>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                Zrušit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isDeleting}
                onClick={() => { setConfirmDelete(false); onDelete(entry.id); }}
              >
                Smazat
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── transaction ───────────────────────────────────
  if (entry.type === 'transaction') {
    const isBuy = entry.metadata.action === 'BUY';
    const shares = entry.metadata.shares ?? 0;
    const price = entry.metadata.price ?? 0;
    const currency = entry.metadata.currency ?? 'USD';

    return (
      <div className="rounded-lg bg-muted/30 px-4 py-3 group">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-xs font-semibold tracking-widest uppercase ${isBuy ? 'text-emerald-500' : 'text-rose-500'}`}>
                {isBuy ? 'Nákup' : 'Prodej'}
              </span>
              <span className="text-sm font-semibold">{entry.metadata.ticker}</span>
              <span className="text-sm font-mono">
                {shares} ks × {formatPrice(price)}{currency !== 'USD' ? ` ${currency}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{formatDateOnly(entry.created_at)}</span>
              {portfolioName && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-xs text-muted-foreground/60">{portfolioName}</span>
                </>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/0 group-hover:text-muted-foreground hover:text-destructive shrink-0 transition-colors"
            onClick={() => setConfirmDelete(true)}
            disabled={isDeleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {entry.content && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2 pt-2 border-t border-border/40">
            {entry.content}
          </p>
        )}

        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Smazat záznam transakce?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Tuto akci nelze vrátit.</p>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Zrušit</Button>
              <Button variant="destructive" size="sm" disabled={isDeleting}
                onClick={() => { setConfirmDelete(false); onDelete(entry.id); }}>Smazat</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── option_trade ──────────────────────────────────
  if (entry.type === 'option_trade') {
    const action = entry.metadata.action ?? '';
    const contracts = entry.metadata.contracts ?? 0;
    const premium = entry.metadata.premium;
    const strike = entry.metadata.strike ?? 0;
    const expiration = entry.metadata.expiration
      ? new Date(entry.metadata.expiration).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })
      : '';

    return (
      <div className="rounded-lg bg-muted/30 px-4 py-3 group">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                {action}
              </span>
              <span className="text-sm font-semibold">{entry.metadata.ticker}</span>
              <span className="text-xs font-mono text-muted-foreground uppercase">
                {entry.metadata.option_type}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">
                ${strike} · exp {expiration} · {contracts} kontr.{premium != null ? ` @ ${formatPrice(premium)}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{formatDateOnly(entry.created_at)}</span>
              {portfolioName && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-xs text-muted-foreground/60">{portfolioName}</span>
                </>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/0 group-hover:text-muted-foreground hover:text-destructive shrink-0 transition-colors"
            onClick={() => setConfirmDelete(true)}
            disabled={isDeleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {entry.content && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2 pt-2 border-t border-border/40">
            {entry.content}
          </p>
        )}

        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Smazat záznam opce?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Tuto akci nelze vrátit.</p>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Zrušit</Button>
              <Button variant="destructive" size="sm" disabled={isDeleting}
                onClick={() => { setConfirmDelete(false); onDelete(entry.id); }}>Smazat</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}
