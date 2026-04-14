import { BookOpen, PanelRightClose, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { JournalChannel } from '@/lib/api/journal';
import { QuickJournalWorkspace } from './QuickJournalWorkspace';

interface QuickJournalPanelProps {
  channel: JournalChannel;
  draftHtml: string;
  editorKey: number;
  onDraftChange: (html: string) => void;
  onResetDraft: () => void;
  onClose: () => void;
  onUnpin: () => void;
}

export function QuickJournalPanel({
  channel,
  draftHtml,
  editorKey,
  onDraftChange,
  onResetDraft,
  onClose,
  onUnpin,
}: QuickJournalPanelProps) {
  return (
    <aside className="sticky top-6 hidden h-[calc(100vh-7rem)] min-h-[36rem] min-w-0 overflow-hidden rounded-xl border border-border/70 bg-background xl:flex xl:flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              Deník{' '}
              <span className="font-mono font-normal text-muted-foreground">
                {channel.ticker}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Poznámky po ruce během celého průzkumu.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onUnpin}
            aria-label="Odepnout poznámky"
            title="Odepnout"
          >
            <PinOff className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label="Zavřít poznámky"
            title="Zavřít"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <QuickJournalWorkspace
        channel={channel}
        draftHtml={draftHtml}
        editorKey={editorKey}
        onDraftChange={onDraftChange}
        onResetDraft={onResetDraft}
      />
    </aside>
  );
}
