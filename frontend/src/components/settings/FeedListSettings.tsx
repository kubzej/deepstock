/**
 * FeedListSettings — manage X.com feed lists and their accounts
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Rss, Trash2, X, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  PageBackButton,
  PageIntro,
  PageShell,
} from '@/components/shared/PageShell';
import {
  UtilityActionButton,
  UtilityEmptyState,
  UtilityList,
  UtilityListItem,
  UtilityListSkeleton,
  UtilitySection,
} from './UtilityScreen';
import {
  fetchFeedLists,
  createFeedList,
  updateFeedList,
  deleteFeedList,
  addFeedAccount,
  removeFeedAccount,
  type FeedList,
} from '@/lib/api/feed';

export function FeedListSettings() {
  const navigate = useNavigate();
  const onBack = () => navigate({ to: '/settings' });
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeedList | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FeedList | null>(null);
  const [newUsername, setNewUsername] = useState<Record<string, string>>({});
  const [addingAccount, setAddingAccount] = useState<string | null>(null);

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['feed-lists'],
    queryFn: fetchFeedLists,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['feed-lists'] });

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setDialogOpen(true);
  };

  const openEdit = (list: FeedList) => {
    setEditing(list);
    setName(list.name);
    setDescription(list.description || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateFeedList(
          editing.id,
          name.trim(),
          description.trim() || undefined,
        );
      } else {
        await createFeedList(name.trim(), description.trim() || undefined);
      }
      setDialogOpen(false);
      refresh();
    } catch (err) {
      console.error('Failed to save list:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFeedList(deleteTarget.id);
      if (expandedId === deleteTarget.id) setExpandedId(null);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      console.error('Failed to delete list:', err);
    }
  };

  const handleAddAccount = async (listId: string) => {
    const username = (newUsername[listId] || '').trim().replace(/^@/, '');
    if (!username) return;
    setAddingAccount(listId);
    try {
      await addFeedAccount(listId, username);
      setNewUsername((prev) => ({ ...prev, [listId]: '' }));
      refresh();
    } catch (err) {
      console.error('Failed to add account:', err);
    } finally {
      setAddingAccount(null);
    }
  };

  const handleRemoveAccount = async (listId: string, username: string) => {
    try {
      await removeFeedAccount(listId, username);
      refresh();
    } catch (err) {
      console.error('Failed to remove account:', err);
    }
  };

  return (
    <PageShell width="full">
      <PageIntro
        title="X.com Feed listy"
        leading={<PageBackButton onClick={onBack} />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: '/feed' })}
            >
              Otevřít Feed
            </Button>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nový seznam
            </Button>
          </div>
        }
      />

      <UtilitySection title="Feed listy">
        {isLoading ? (
          <UtilityListSkeleton items={2} height="h-16" />
        ) : lists.length === 0 ? (
          <UtilityEmptyState
            icon={Rss}
            title="Žádné feed listy"
            description="Vytvoř první seznam účtů, ze kterého bude Feed generovat AI souhrny."
            action={{
              label: 'Vytvořit první seznam',
              onClick: openCreate,
            }}
          />
        ) : (
          <UtilityList>
            {lists.map((list) => {
              const isExpanded = expandedId === list.id;
              const accounts = list.feed_list_accounts ?? [];
              return (
                <UtilityListItem
                  key={list.id}
                  className="overflow-hidden px-0 py-0"
                >
                  <div
                    className="flex cursor-pointer items-center gap-3 px-4 py-3"
                    onClick={() => setExpandedId(isExpanded ? null : list.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{list.name}</div>
                      {list.description && (
                        <div className="text-sm text-muted-foreground truncate">
                          {list.description}
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                      {accounts.length} účtů
                    </div>
                    <div className="flex gap-1">
                      <UtilityActionButton
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(list);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </UtilityActionButton>
                      <UtilityActionButton
                        destructive
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(list);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </UtilityActionButton>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 border-t border-border/50 px-4 py-3">
                      {accounts.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {accounts.map((a) => (
                            <div
                              key={a.username}
                              className="flex items-center gap-1 bg-background rounded-full px-3 py-1 text-sm border border-border"
                            >
                              <span className="text-muted-foreground">@</span>
                              <span>{a.username}</span>
                              <button
                                onClick={() =>
                                  handleRemoveAccount(list.id, a.username)
                                }
                                className="ml-1 text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input
                          placeholder="@username"
                          value={newUsername[list.id] || ''}
                          onChange={(e) =>
                            setNewUsername((prev) => ({
                              ...prev,
                              [list.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) =>
                            e.key === 'Enter' && handleAddAccount(list.id)
                          }
                          className="h-9 text-sm"
                        />
                        <Button
                          size="sm"
                          className="h-9 shrink-0"
                          onClick={() => handleAddAccount(list.id)}
                          disabled={addingAccount === list.id}
                        >
                          {addingAccount === list.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </UtilityListItem>
              );
            })}
          </UtilityList>
        )}
      </UtilitySection>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Upravit seznam' : 'Nový seznam'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Upravte název nebo prompt seznamu.'
                : 'Vytvořte nový X.com feed seznam.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="feed-name">Název</Label>
              <Input
                id="feed-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. Earnings watchers"
                className="mt-1.5"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>
            <div>
              <Label htmlFor="feed-desc">Prompt (volitelný)</Label>
              <Textarea
                id="feed-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Co má AI sledovat a jak analyzovat tweety z tohoto seznamu..."
                className="mt-1.5"
                rows={4}
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

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Smazat seznam?"
        description={`Opravdu chcete smazat seznam "${deleteTarget?.name}"? Tato akce je nevratná.`}
        confirmLabel="Smazat"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </PageShell>
  );
}
