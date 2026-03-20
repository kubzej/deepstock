import { useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { RichTextEditor } from '@/components/journal/RichTextEditor';
import { JournalEntryCard } from '@/components/journal/JournalEntryCard';
import {
  useJournalEntries,
  useCreateJournalEntry,
  useUpdateJournalEntry,
  useDeleteJournalEntry,
} from '@/hooks/useJournal';
import type { JournalChannel } from '@/lib/api/journal';

interface QuickJournalSheetProps {
  channel: JournalChannel;
  open: boolean;
  onClose: () => void;
}

export function QuickJournalSheet({ channel, open, onClose }: QuickJournalSheetProps) {
  const [newContent, setNewContent] = useState('');
  const [editorKey, setEditorKey] = useState(0);

  const { data, isLoading } = useJournalEntries(channel.id);
  const createEntry = useCreateJournalEntry(channel.id);
  const updateEntry = useUpdateJournalEntry(channel.id);
  const deleteEntry = useDeleteJournalEntry(channel.id);

  const entries = data?.pages.flatMap((p) => p) ?? [];

  const isEmptyHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim() === '';

  const handleSubmit = async () => {
    if (isEmptyHtml(newContent)) return;
    await createEntry.mutateAsync({
      channel_id: channel.id,
      type: 'note',
      content: newContent,
    });
    setNewContent('');
    setEditorKey((k) => k + 1);
  };

  const handleClose = () => {
    setNewContent('');
    setEditorKey((k) => k + 1);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[420px] flex flex-col gap-0 p-0 sm:rounded-l-lg overflow-hidden">
        {/* Header */}
        <SheetHeader className="px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            <SheetTitle className="text-sm font-semibold tracking-normal">
              Deník{' '}
              <span className="text-muted-foreground font-mono font-normal">
                {channel.ticker}
              </span>
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Note composer */}
          <div className="px-4 py-4 shrink-0 space-y-2">
            <RichTextEditor
              key={editorKey}
              placeholder="Zapiš poznámku k analýze… (⌘↵ pro uložení)"
              onChange={setNewContent}
              onSubmit={handleSubmit}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={createEntry.isPending || isEmptyHtml(newContent)}
              >
                {createEntry.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Ukládám...
                  </>
                ) : (
                  'Přidat'
                )}
              </Button>
            </div>
          </div>

          {/* Entries */}
          <div className="flex-1 px-4 py-4 space-y-2">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="py-4 border-b border-border">
                    <Skeleton className="h-3 w-32 mb-2" />
                    <Skeleton className="h-4 w-full mb-1" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ))}
              </div>
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground/40 py-4">
                Zatím žádné záznamy.
              </p>
            ) : (
              entries.map((entry) => (
                <JournalEntryCard
                  key={entry.id}
                  entry={entry}
                  onDelete={(id) => deleteEntry.mutate(id)}
                  onUpdate={(id, content) => updateEntry.mutate({ id, content })}
                  isDeleting={deleteEntry.isPending}
                  isUpdating={updateEntry.isPending}
                />
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
