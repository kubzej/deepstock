import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Plus, Pencil, Trash2, ArrowLeft, GripVertical } from 'lucide-react';
import { type Watchlist } from '@/lib/api';
import {
  useWatchlists,
  useCreateWatchlist,
  useUpdateWatchlist,
  useDeleteWatchlist,
  useReorderWatchlists,
} from '@/hooks/useWatchlists';

interface WatchlistSettingsProps {
  onBack: () => void;
}

// Sortable row component
interface SortableRowProps {
  watchlist: Watchlist;
  onEdit: (w: Watchlist) => void;
  onDelete: (w: Watchlist) => void;
}

function SortableRow({ watchlist, onEdit, onDelete }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: watchlist.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-3 border-b last:border-b-0 ${
        isDragging ? 'opacity-50 bg-muted' : ''
      }`}
    >
      <button
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{watchlist.name}</div>
        {watchlist.description && (
          <div className="text-sm text-muted-foreground truncate">
            {watchlist.description}
          </div>
        )}
      </div>
      <div className="text-sm text-muted-foreground whitespace-nowrap">
        {watchlist.item_count || 0} položek
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" onClick={() => onEdit(watchlist)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(watchlist)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function WatchlistSettings({ onBack }: WatchlistSettingsProps) {
  const queryClient = useQueryClient();

  const { data: watchlists = [], isLoading } = useWatchlists();
  const createMutation = useCreateWatchlist();
  const updateMutation = useUpdateWatchlist();
  const deleteMutation = useDeleteWatchlist();
  const reorderMutation = useReorderWatchlists();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Watchlist | null>(null);
  const [deleteData, setDeleteData] = useState<Watchlist | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setDialogOpen(true);
  };

  const openEdit = (w: Watchlist) => {
    setEditing(w);
    setName(w.name);
    setDescription(w.description || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          name: name.trim(),
          description: description.trim() || undefined,
        });
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
        });
      }
      setDialogOpen(false);
    } catch (err) {
      console.error('Failed to save watchlist:', err);
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
      console.error('Failed to delete watchlist:', err);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = watchlists.findIndex((w) => w.id === active.id);
      const newIndex = watchlists.findIndex((w) => w.id === over.id);
      const newOrder = arrayMove(watchlists, oldIndex, newIndex).map(
        (w) => w.id,
      );
      reorderMutation.mutate(newOrder);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['watchlists'] });
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Watchlisty"
        subtitle="Přetažením změníte pořadí"
        onRefresh={handleRefresh}
        isRefreshing={isLoading}
        actions={
          <>
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nový watchlist
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : watchlists.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Žádné watchlisty.</p>
          <Button onClick={openCreate} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Vytvořit první watchlist
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={watchlists.map((w) => w.id)}
              strategy={verticalListSortingStrategy}
            >
              {watchlists.map((w) => (
                <SortableRow
                  key={w.id}
                  watchlist={w}
                  onEdit={openEdit}
                  onDelete={setDeleteData}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Upravit watchlist' : 'Nový watchlist'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Upravte název nebo popis watchlistu.'
                : 'Vytvořte nový watchlist pro sledování akcií.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="watchlist-name">Název</Label>
              <Input
                id="watchlist-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. Tech akcie"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="watchlist-description">Popis (volitelný)</Label>
              <Textarea
                id="watchlist-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Popis watchlistu..."
                className="mt-1.5"
                rows={3}
              />
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
            <DialogTitle>Smazat watchlist?</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat watchlist &quot;{deleteData?.name}&quot;?
              Tato akce je nevratná a smaže i všechny položky v něm.
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
