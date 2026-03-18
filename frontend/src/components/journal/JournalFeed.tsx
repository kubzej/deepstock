import { useEffect, useRef, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { JournalEntryCard } from './JournalEntryCard';
import { RichTextEditor } from './RichTextEditor';
import {
  useJournalEntries,
  useCreateJournalEntry,
  useUpdateJournalEntry,
  useDeleteJournalEntry,
} from '@/hooks/useJournal';
import type { JournalChannel } from '@/lib/api/journal';

interface JournalFeedProps {
  channel: JournalChannel;
}

export function JournalFeed({ channel }: JournalFeedProps) {
  const [showForm, setShowForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useJournalEntries(channel.id);

  const createEntry = useCreateJournalEntry(channel.id);
  const updateEntry = useUpdateJournalEntry(channel.id);
  const deleteEntry = useDeleteJournalEntry(channel.id);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isEmptyHtml = (html: string) => {
    const text = html.replace(/<[^>]*>/g, '').trim();
    return text === '';
  };

  const handleSubmit = async () => {
    if (isEmptyHtml(newContent)) return;
    await createEntry.mutateAsync({
      channel_id: channel.id,
      type: 'note',
      content: newContent,
    });
    setNewContent('');
    setEditorKey((k) => k + 1); // reset editor
    setShowForm(false);
  };

  const entries = data?.pages.flatMap((p) => p) ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Channel header + add button */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold">{channel.stock_name ?? channel.name}</h2>
          {channel.stock_name && (
            <p className="text-sm text-muted-foreground font-mono">{channel.ticker}</p>
          )}
        </div>
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
        <div className="mb-4 space-y-2 shrink-0">
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
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Ukládám...</>
              ) : 'Přidat'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowForm(false); setNewContent(''); setEditorKey((k) => k + 1); }}
            >
              Zrušit
            </Button>
          </div>
        </div>
      )}

      {/* Entries */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="py-4 border-b border-border">
                <Skeleton className="h-3 w-32 mb-2" />
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && entries.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Žádné poznámky. Přidej první.
          </div>
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
    </div>
  );
}
