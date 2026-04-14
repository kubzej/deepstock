import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface QuickJournalWorkspaceProps {
  channel: JournalChannel;
  draftHtml: string;
  editorKey: number;
  onDraftChange: (html: string) => void;
  onResetDraft: () => void;
  autoFocus?: boolean;
}

const isEmptyHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim() === '';

export function QuickJournalWorkspace({
  channel,
  draftHtml,
  editorKey,
  onDraftChange,
  onResetDraft,
  autoFocus = false,
}: QuickJournalWorkspaceProps) {
  const { data, isLoading } = useJournalEntries(channel.id);
  const createEntry = useCreateJournalEntry(channel.id);
  const updateEntry = useUpdateJournalEntry(channel.id);
  const deleteEntry = useDeleteJournalEntry(channel.id);

  const entries = data?.pages.flatMap((page) => page) ?? [];

  const handleSubmit = async () => {
    if (isEmptyHtml(draftHtml)) return;

    await createEntry.mutateAsync({
      channel_id: channel.id,
      type: 'note',
      content: draftHtml,
    });

    onResetDraft();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border/50 px-4 py-4">
        <RichTextEditor
          key={editorKey}
          content={draftHtml}
          placeholder="Zapiš poznámku k analýze… (⌘↵ pro uložení)"
          onChange={onDraftChange}
          onSubmit={handleSubmit}
          autoFocus={autoFocus}
        />
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={createEntry.isPending || isEmptyHtml(draftHtml)}
          >
            {createEntry.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Ukládám...
              </>
            ) : (
              'Přidat'
            )}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border-b border-border py-4">
                <Skeleton className="mb-2 h-3 w-32" />
                <Skeleton className="mb-1 h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground/40">
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
  );
}
