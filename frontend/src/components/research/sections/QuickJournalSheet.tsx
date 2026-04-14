import { BookOpen, Pin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { JournalChannel } from '@/lib/api/journal';
import { QuickJournalWorkspace } from './QuickJournalWorkspace';

interface QuickJournalSheetProps {
  channel: JournalChannel;
  open: boolean;
  onClose: () => void;
  onPin?: () => void;
  draftHtml: string;
  editorKey: number;
  onDraftChange: (html: string) => void;
  onResetDraft: () => void;
}

export function QuickJournalSheet({
  channel,
  open,
  onClose,
  onPin,
  draftHtml,
  editorKey,
  onDraftChange,
  onResetDraft,
}: QuickJournalSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="z-[60] flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden border-l-0 p-0 sm:max-w-[420px] sm:border-l sm:rounded-l-lg"
      >
        {/* Header */}
        <SheetHeader className="shrink-0 border-b border-border/60 bg-background/95 px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-5 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5 pr-2">
              <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <SheetTitle className="truncate text-sm font-semibold tracking-normal">
                Deník{' '}
                <span className="font-mono font-normal text-muted-foreground">
                  {channel.ticker}
                </span>
              </SheetTitle>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {onPin && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="hidden h-9 w-9 rounded-full text-muted-foreground hover:text-foreground xl:inline-flex"
                  onClick={onPin}
                  aria-label="Připnout poznámky"
                  title="Připnout"
                >
                  <Pin className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={onClose}
                aria-label="Zavřít poznámky"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <QuickJournalWorkspace
          channel={channel}
          draftHtml={draftHtml}
          editorKey={editorKey}
          onDraftChange={onDraftChange}
          onResetDraft={onResetDraft}
          autoFocus
        />
      </SheetContent>
    </Sheet>
  );
}
