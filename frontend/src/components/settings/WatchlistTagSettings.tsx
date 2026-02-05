import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { type WatchlistTag } from '@/lib/api';
import {
  useWatchlistTags,
  useCreateWatchlistTag,
  useUpdateWatchlistTag,
  useDeleteWatchlistTag,
} from '@/hooks/useWatchlistTags';

// Predefined colors for tags - expanded palette
const TAG_COLORS = [
  // Neutrals
  '#6b7280', // gray
  '#374151', // dark gray
  // Reds
  '#ef4444', // red
  '#dc2626', // dark red
  '#f87171', // light red
  // Oranges
  '#f97316', // orange
  '#ea580c', // dark orange
  '#fb923c', // light orange
  // Yellows
  '#eab308', // yellow
  '#ca8a04', // dark yellow
  '#fde047', // light yellow
  // Greens
  '#22c55e', // green
  '#16a34a', // dark green
  '#4ade80', // light green
  '#10b981', // emerald
  // Teals/Cyans
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0891b2', // dark cyan
  // Blues
  '#3b82f6', // blue
  '#2563eb', // dark blue
  '#60a5fa', // light blue
  '#0ea5e9', // sky
  // Purples
  '#8b5cf6', // violet
  '#7c3aed', // dark violet
  '#a855f7', // purple
  '#c084fc', // light purple
  // Pinks
  '#ec4899', // pink
  '#db2777', // dark pink
  '#f472b6', // light pink
  // Special
  '#f43f5e', // rose
  '#84cc16', // lime
  '#a3e635', // light lime
];

interface WatchlistTagSettingsProps {
  onBack: () => void;
}

export function WatchlistTagSettings({ onBack }: WatchlistTagSettingsProps) {
  const { data: tags = [], isLoading } = useWatchlistTags();
  const createMutation = useCreateWatchlistTag();
  const updateMutation = useUpdateWatchlistTag();
  const deleteMutation = useDeleteWatchlistTag();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WatchlistTag | null>(null);
  const [deleteData, setDeleteData] = useState<WatchlistTag | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setColor(TAG_COLORS[0]);
    setDialogOpen(true);
  };

  const openEdit = (tag: WatchlistTag) => {
    setEditing(tag);
    setName(tag.name);
    setColor(tag.color || TAG_COLORS[0]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          tagId: editing.id,
          data: { name: name.trim(), color },
        });
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          color,
        });
      }
      setDialogOpen(false);
    } catch (err) {
      console.error('Failed to save tag:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteMutation.mutateAsync(deleteData.id);
      setDeleteData(null);
    } catch (err) {
      console.error('Failed to delete tag:', err);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Zpět
        </Button>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nový tag
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Watchlist tagy</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Tagy pro organizaci položek
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : tags.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            Žádné tagy. Vytvořte první pro organizaci položek ve watchlistech.
          </p>
          <Button onClick={openCreate} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Vytvořit první tag
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center gap-3 px-4 py-2.5 bg-muted/30 rounded-lg"
            >
              <div
                className="h-4 w-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color || TAG_COLORS[0] }}
              />
              <div className="flex-1 text-sm">{tag.name}</div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(tag)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteData(tag)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Upravit tag' : 'Nový tag'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Upravte název nebo barvu tagu.'
                : 'Vytvořte nový tag pro označování položek ve watchlistech.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="tag-name">Název</Label>
              <Input
                id="tag-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. Dividendy"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Barva</Label>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full transition-all ${
                      color === c
                        ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Zrušit
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || saving}>
              {saving ? 'Ukládám...' : editing ? 'Uložit' : 'Vytvořit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={!!deleteData}
        onOpenChange={(open) => !open && setDeleteData(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat tag?</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat tag &quot;{deleteData?.name}&quot;? Tag bude
              odebrán ze všech položek ve watchlistech.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteData(null)}>
              Zrušit
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Smazat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
