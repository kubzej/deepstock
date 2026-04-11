import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PageBackButton, PageIntro, PageShell } from '@/components/shared/PageShell';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { type JournalChannel } from '@/lib/api/journal';
import {
  useJournalChannels,
  useJournalSections,
  useCreateJournalChannel,
  useUpdateJournalChannel,
  useDeleteJournalChannel,
} from '@/hooks/useJournal';

export function JournalChannelSettings() {
  const navigate = useNavigate();
  const onBack = () => navigate({ to: '/settings' });
  const { data: allChannels = [], isLoading } = useJournalChannels();
  const { data: sections = [] } = useJournalSections();
  const createMutation = useCreateJournalChannel();
  const updateMutation = useUpdateJournalChannel();
  const deleteMutation = useDeleteJournalChannel();

  const customChannels = allChannels.filter((c) => c.type === 'custom');
  const assignableSections = sections.filter((s) => !s.is_system);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JournalChannel | null>(null);
  const [deleteData, setDeleteData] = useState<JournalChannel | null>(null);
  const [name, setName] = useState('');
  const [sectionId, setSectionId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSectionId(assignableSections[0]?.id ?? '');
    setDialogOpen(true);
  };

  const openEdit = (channel: JournalChannel) => {
    setEditing(channel);
    setName(channel.name);
    setSectionId(channel.section_id ?? assignableSections[0]?.id ?? '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !sectionId) return;
    setSaving(true);
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          data: { name: name.trim(), section_id: sectionId },
        });
      } else {
        await createMutation.mutateAsync({ name: name.trim(), section_id: sectionId });
      }
      setDialogOpen(false);
    } catch (err) {
      console.error('Failed to save channel:', err);
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
      console.error('Failed to delete channel:', err);
    }
  };

  const getSectionName = (sectionId: string | null) => {
    if (!sectionId) return '—';
    return sections.find((s) => s.id === sectionId)?.name ?? '—';
  };

  return (
    <PageShell width="full">
      <PageIntro
        title="Vlastní kanály deníku"
        subtitle="Vlastní kanály pro osobní poznámky"
        leading={<PageBackButton onClick={onBack} />}
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nový kanál
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : customChannels.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Žádné vlastní kanály.</p>
          <Button onClick={openCreate} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Vytvořit první kanál
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {customChannels.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center gap-3 px-4 py-2.5 bg-muted/30 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{channel.name}</div>
                <div className="text-xs text-muted-foreground">
                  {getSectionName(channel.section_id)} · {channel.entry_count} poznámek
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(channel)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteData(channel)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Upravit kanál' : 'Nový kanál'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Upravte název nebo sekci kanálu.'
                : 'Vytvořte nový vlastní kanál v deníku.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="channel-name">Název</Label>
              <Input
                id="channel-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. Daily deník"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="channel-section">Sekce</Label>
              <Select value={sectionId} onValueChange={setSectionId}>
                <SelectTrigger id="channel-section" className="mt-1.5">
                  <SelectValue placeholder="Bez sekce" />
                </SelectTrigger>
                <SelectContent>
                  {assignableSections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Zrušit
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || !sectionId || saving}>
              {saving ? 'Ukládám...' : editing ? 'Uložit' : 'Vytvořit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteData}
        onOpenChange={(open) => !open && setDeleteData(null)}
        title="Smazat kanál?"
        description={`Opravdu chcete smazat kanál "${deleteData?.name}"? Tato akce je nevratná a smaže i všechny poznámky v něm.`}
        confirmLabel="Smazat"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </PageShell>
  );
}
