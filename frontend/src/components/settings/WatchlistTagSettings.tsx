import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { type WatchlistTag } from '@/lib/api';
import {
  useWatchlistTags,
  useCreateWatchlistTag,
  useUpdateWatchlistTag,
  useDeleteWatchlistTag,
} from '@/hooks/useWatchlistTags';

// Predefined colors for tags
const TAG_COLORS = [
  '#6b7280', // gray
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

interface WatchlistTagSettingsProps {
  onBack: () => void;
}

export function WatchlistTagSettings({ onBack }: WatchlistTagSettingsProps) {
  const queryClient = useQueryClient();

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

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['watchlistTags'] });
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Watchlist tagy"
        onRefresh={handleRefresh}
        isRefreshing={isLoading}
        actions={
          <>
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nový tag
            </Button>
          </>
        }
      />

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Barva</TableHead>
              <TableHead>Název</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.map((tag) => (
              <TableRow key={tag.id}>
                <TableCell>
                  <div
                    className="h-5 w-5 rounded-full"
                    style={{ backgroundColor: tag.color || TAG_COLORS[0] }}
                  />
                </TableCell>
                <TableCell className="font-medium">{tag.name}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
