import { useState } from 'react';
import { Pencil, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RichTextEditor } from './RichTextEditor';
import { RichTextContent } from './RichTextContent';
import type { JournalEntry } from '@/lib/api/journal';

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

      research: 'Průzkum akcie',
      technical: 'Technická analýza',
      full_analysis: 'Plná analýza',
    };
    const label = entry.metadata.report_type
      ? reportTypeLabel[entry.metadata.report_type] ?? 'AI přehled'
      : 'AI přehled';

    return (
      <div className="rounded-lg bg-muted/30 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
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
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setReportExpanded(true)}
            >
              Zobrazit
              <ChevronDown className="h-3 w-3" />
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

        {/* Full report dialog */}
        <Dialog open={reportExpanded} onOpenChange={setReportExpanded}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{label}{entry.metadata.ticker ? ` — ${entry.metadata.ticker}` : ''}</DialogTitle>
            </DialogHeader>
            <div className="text-sm whitespace-pre-wrap font-mono leading-relaxed">
              {entry.content}
            </div>
          </DialogContent>
        </Dialog>

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
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
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

        {entry.metadata.url && (
          <a
            href={entry.metadata.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-1"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            {entry.metadata.label || entry.metadata.url}
          </a>
        )}
        {entry.content && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{entry.content}</p>
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

  return null;
}
