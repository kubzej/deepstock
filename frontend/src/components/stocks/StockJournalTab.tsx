import { useEffect, useRef, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingState } from '@/components/shared';
import { JournalEntryCard } from '@/components/journal/JournalEntryCard';
import { RichTextEditor } from '@/components/journal/RichTextEditor';
import {
  useJournalChannels,
  useJournalEntries,
  useCreateJournalEntry,
  useUpdateJournalEntry,
  useDeleteJournalEntry,
} from '@/hooks/useJournal';

interface StockJournalTabProps {
  ticker: string;
}

export function StockJournalTab({ ticker }: StockJournalTabProps) {
  const { data: channels = [], isLoading: channelsLoading } = useJournalChannels();
  const channel = channels.find((c) => c.ticker === ticker);
  const channelId = channel?.id ?? null;

  const [showForm, setShowForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useJournalEntries(channelId);

  const createEntry = useCreateJournalEntry(channelId ?? '');
  const updateEntry = useUpdateJournalEntry(channelId ?? '');
  const deleteEntry = useDeleteJournalEntry(channelId ?? '');

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isEmptyHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim() === '';

  const handleSubmit = async () => {
    if (!channelId || isEmptyHtml(newContent)) return;
    await createEntry.mutateAsync({
      channel_id: channelId,
      type: 'note',
      content: newContent,
    });
    setNewContent('');
    setEditorKey((k) => k + 1);
    setShowForm(false);
  };

  const entries = data?.pages.flatMap((p) => p) ?? [];

  if (channelsLoading) {
    return (
      <LoadingState
        title="Načítám journal..."
        description="Připravuji poznámky a historii k této akcii."
        lines={3}
      />
    );
  }

  if (!channel) {
    return (
      <EmptyState
        icon={Plus}
        title="Journal kanál nebyl nalezen"
        description="Pro tuhle akcii zatím není dostupný propojený journal kanál."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Add button */}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant={showForm ? 'secondary' : 'default'}
          className="gap-1.5"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="h-4 w-4" />
          Poznámka
        </Button>
      </div>

      {/* New entry form */}
      {showForm && (
        <div className="space-y-2">
          <RichTextEditor
            key={editorKey}
            placeholder="Napiš poznámku… (Cmd+Enter pro odeslání)"
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setNewContent('');
                setEditorKey((k) => k + 1);
              }}
            >
              Zrušit
            </Button>
          </div>
        </div>
      )}

      {/* Entries */}
      {isLoading && (
        <LoadingState
          title="Načítám poznámky..."
          description="Chvilku strpení, připravuji poslední journal entries."
          lines={3}
        />
      )}

      {!isLoading && entries.length === 0 && (
        <EmptyState
          icon={Plus}
          title="Žádné poznámky"
          description="Přidej první poznámku a začni si budovat investiční kontext přímo u akcie."
          action={{ label: 'Přidat poznámku', onClick: () => setShowForm(true) }}
        />
      )}

      <div className="space-y-2">
        {entries.map((entry) => (
          <JournalEntryCard
            key={entry.id}
            entry={entry}
            onDelete={(id) => deleteEntry.mutate(id)}
            onUpdate={(id, content) => updateEntry.mutate({ id, content })}
            isDeleting={deleteEntry.isPending}
            isUpdating={updateEntry.isPending}
          />
        ))}
      </div>

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="py-2">
        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
