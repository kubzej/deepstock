import { useEffect, useRef, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { JournalEntryCard } from './JournalEntryCard';
import { RichTextEditor } from './RichTextEditor';
import {
  useJournalEntries,
  useCreateJournalEntry,
  useUpdateJournalEntry,
  useDeleteJournalEntry,
} from '@/hooks/useJournal';
import { fetchUrlPreview } from '@/lib/api/journal';
import type { JournalChannel, UrlPreview } from '@/lib/api/journal';

interface JournalFeedProps {
  channel: JournalChannel;
  showChannelHeader?: boolean;
  showForm?: boolean;
  onShowFormChange?: (next: boolean) => void;
}

export function JournalFeed({
  channel,
  showChannelHeader = true,
  showForm: controlledShowForm,
  onShowFormChange,
}: JournalFeedProps) {
  const [internalShowForm, setInternalShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [url, setUrl] = useState('');
  const [urlPreview, setUrlPreview] = useState<UrlPreview | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useJournalEntries(channel.id);
  const createEntry = useCreateJournalEntry(channel.id);
  const updateEntry = useUpdateJournalEntry(channel.id);
  const deleteEntry = useDeleteJournalEntry(channel.id);
  const showForm = controlledShowForm ?? internalShowForm;

  const setShowForm = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(showForm) : next;
    if (onShowFormChange) {
      onShowFormChange(resolved);
      return;
    }
    setInternalShowForm(resolved);
  };

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage(); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isEmptyHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim() === '';

  const resetForm = () => {
    setContent('');
    setEditorKey((k) => k + 1);
    setUrl('');
    setUrlPreview(null);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setShowForm(false);
  };

  const handleUrlChange = (val: string) => {
    setUrl(val);
    setUrlPreview(null);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    const trimmed = val.trim();
    if (!trimmed.startsWith('http')) return;
    if (trimmed.includes('discord.com')) return;
    previewTimerRef.current = setTimeout(async () => {
      setIsFetchingPreview(true);
      try {
        const preview = await fetchUrlPreview(trimmed);
        if (preview.title || preview.description) setUrlPreview(preview);
      } catch { /* ignore */ }
      finally { setIsFetchingPreview(false); }
    }, 800);
  };

  const handleSubmit = async () => {
    const trimmedUrl = url.trim();
    if (trimmedUrl) {
      await createEntry.mutateAsync({
        channel_id: channel.id,
        type: 'ext_ref',
        content,
        metadata: {
          url: trimmedUrl,
          og_title: urlPreview?.title || undefined,
          og_description: urlPreview?.description || undefined,
          og_image: urlPreview?.image || undefined,
        },
      });
    } else {
      if (isEmptyHtml(content)) return;
      await createEntry.mutateAsync({ channel_id: channel.id, type: 'note', content });
    }
    resetForm();
  };

  const canSubmit = url.trim() ? true : !isEmptyHtml(content);
  const entries = data?.pages.flatMap((p) => p) ?? [];

  return (
    <div className="flex flex-col md:h-full">
      {showChannelHeader ? (
        <div className="mb-4 shrink-0 border-b border-border/50 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight">
                {channel.stock_name ?? channel.name}
              </h2>
              {channel.stock_name && channel.ticker && (
                <p className="mt-1 text-xs font-mono text-muted-foreground">
                  {channel.ticker}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant={showForm ? 'secondary' : 'default'}
              className="shrink-0 gap-1.5"
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus className="h-4 w-4" />
              Přidat
            </Button>
          </div>
        </div>
      ) : null}

      {showForm && (
        <div className="mb-4 shrink-0 space-y-3 rounded-xl border border-border/50 bg-background pb-1">
          <RichTextEditor
            key={editorKey}
            placeholder="Napiš poznámku… (Cmd+Enter pro odeslání)"
            onChange={setContent}
            onSubmit={handleSubmit}
            autoFocus
          />

          {/* OG preview */}
          {urlPreview && (urlPreview.title || urlPreview.description) && (
            <div className="mx-3 flex gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
              {urlPreview.image && (
                <img src={urlPreview.image} alt="" className="w-10 h-10 object-cover rounded shrink-0" />
              )}
              <div className="min-w-0">
                {urlPreview.title && <p className="text-sm font-medium truncate">{urlPreview.title}</p>}
                {urlPreview.description && (
                  <p className="text-xs text-muted-foreground line-clamp-1">{urlPreview.description}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 pb-3">
            <div className="relative flex-1">
              <Input
                placeholder="URL odkazu (volitelné)"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
              />
              {isFetchingPreview && (
                <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <Button size="sm" onClick={handleSubmit} disabled={createEntry.isPending || !canSubmit || isFetchingPreview}>
              {createEntry.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Ukládám...</> : 'Přidat'}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>Zrušit</Button>
          </div>
        </div>
      )}

      {/* Entries */}
      <div className="md:flex-1 md:overflow-y-auto">
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
          <div className="rounded-xl border border-dashed border-border/70 px-4 py-12 text-center text-sm text-muted-foreground">
            Žádné záznamy. Přidej první.
          </div>
        )}

        <div className="space-y-3">
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
