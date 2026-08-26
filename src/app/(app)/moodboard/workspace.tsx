"use client";

/**
 * The moodboard workspace.
 *
 * An editorial pinboard rather than a file manager: a masonry gallery, hover
 * controls, drag to reorder, click for the lightbox. Uploads land straight onto
 * the board being viewed.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn, toneClasses } from "@/lib/cn";
import { Button, EmptyState } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Uploader } from "@/components/media/uploader";
import { Lightbox } from "@/components/media/lightbox";
import {
  createMoodboard,
  removeMoodboardItem,
  reorderMoodboardItems,
  updateMediaCaption,
  updateMoodboardItem,
} from "@/server/actions/media";

interface BoardItem {
  id: string;
  mediaId: string;
  thumbUrl: string;
  largeUrl: string;
  caption: string | null;
  filename: string;
  width: number | null;
  height: number | null;
  blurData: string | null;
  isFavourite: boolean;
  createdAt: string;
  contextLabel: string | null;
}

interface Board {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  category: string | null;
  eventName: string | null;
  tone: string;
  itemCount: number;
  coverUrl: string | null;
  items: BoardItem[];
}

const SCOPE_LABEL: Record<string, string> = {
  WEDDING: "Whole wedding",
  EVENT: "By function",
  CATEGORY: "By category",
};

export function MoodboardWorkspace({
  boards,
  activeBoardId,
  events,
  canEdit,
}: {
  boards: Board[];
  activeBoardId: string | null;
  events: { id: string; name: string; accentTone: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [selectedId, setSelectedId] = React.useState<string | null>(activeBoardId);
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [dragId, setDragId] = React.useState<string | null>(null);

  React.useEffect(() => setSelectedId(activeBoardId), [activeBoardId]);

  const board = boards.find((b) => b.id === selectedId) ?? boards[0] ?? null;
  const [items, setItems] = React.useState<BoardItem[]>(board?.items ?? []);

  React.useEffect(() => setItems(board?.items ?? []), [board?.id, board?.items]);

  const grouped = React.useMemo(() => {
    const groups: Record<string, Board[]> = { WEDDING: [], EVENT: [], CATEGORY: [] };
    for (const b of boards) (groups[b.scope] ??= []).push(b);
    return groups;
  }, [boards]);

  const totalImages = boards.reduce((sum, b) => sum + b.itemCount, 0);

  async function onDrop(targetId: string) {
    if (!dragId || dragId === targetId || !board) return;
    const next = [...items];
    const from = next.findIndex((i) => i.id === dragId);
    const to = next.findIndex((i) => i.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    setDragId(null);
    await reorderMoodboardItems(board.id, next.map((i) => i.id));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8">
      <header className="mb-7">
        <div className="eyebrow mb-2">Inspiration</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[34px] leading-tight text-ink">Moodboards</h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">
              {totalImages > 0
                ? `${totalImages} ${totalImages === 1 ? "image" : "images"} across ${boards.length} boards.`
                : "Everything you've been sending each other, in one place."}
            </p>
          </div>
          {canEdit ? (
            <Button variant="secondary" onClick={() => setCreating(true)}>
              <PlusIcon size={14} /> New board
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        {/* Board list */}
        <nav className="lg:sticky lg:top-6 lg:self-start">
          {(["WEDDING", "EVENT", "CATEGORY"] as const).map((scope) =>
            grouped[scope]?.length ? (
              <div key={scope} className="mb-5">
                <div className="eyebrow mb-2">{SCOPE_LABEL[scope]}</div>
                <ul className="space-y-0.5">
                  {grouped[scope].map((b) => {
                    const active = b.id === board?.id;
                    const tone = toneClasses(b.tone);
                    return (
                      <li key={b.id}>
                        <button
                          type="button"
                          onClick={() => { setSelectedId(b.id); setLightboxIndex(null); }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                            active
                              ? "bg-surface text-ink shadow-flat"
                              : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              b.scope === "EVENT" ? tone.dot : "bg-line-strong",
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate text-[13px]">{b.name}</span>
                          <span className="tabular shrink-0 text-[11px] text-ink-faint">
                            {b.itemCount}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null,
          )}
        </nav>

        {/* Active board */}
        {board ? (
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-[24px] leading-tight text-ink">
                  {board.name}
                </h2>
                {board.description ? (
                  <p className="mt-1 text-[13px] text-ink-muted">{board.description}</p>
                ) : null}
              </div>
              <span className="tabular text-[12px] text-ink-muted">
                {items.length} {items.length === 1 ? "image" : "images"}
              </span>
            </div>

            {canEdit ? (
              <Uploader
                className="mb-5"
                moodboardId={board.id}
                label={items.length === 0 ? "Add your first images" : "Add more"}
                compact={items.length > 0}
                onUploaded={() => router.refresh()}
              />
            ) : null}

            {items.length === 0 ? (
              <EmptyState
                title="Nothing pinned here yet"
                description={
                  canEdit
                    ? "Drop in the photographs you keep screenshotting — florals, fabrics, mandaps, table settings. They'll start appearing across the rest of the app as you plan."
                    : "Nothing has been added to this board yet."
                }
              />
            ) : (
              // Masonry via CSS columns — images keep their own aspect ratio.
              <div className="columns-2 gap-3 sm:columns-3 [&>*]:mb-3">
                <AnimatePresence initial={false}>
                  {items.map((item, index) => (
                    <motion.figure
                      key={item.id}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                      animate={{ opacity: dragId === item.id ? 0.4 : 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                      draggable={canEdit}
                      onDragStart={() => setDragId(item.id)}
                      onDragEnd={() => setDragId(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(item.id)}
                      className="group relative block break-inside-avoid overflow-hidden rounded-xl bg-surface-sunken"
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(index)}
                        className="block w-full"
                        aria-label={item.caption ?? `Open ${item.filename}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.thumbUrl}
                          alt={item.caption ?? ""}
                          loading="lazy"
                          className="w-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
                        />
                      </button>

                      {/* Hover controls */}
                      {canEdit ? (
                        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-1 p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <button
                            type="button"
                            aria-label={item.isFavourite ? "Unfavourite" : "Favourite"}
                            onClick={async () => {
                              await updateMoodboardItem({ id: item.id, isFavourite: !item.isFavourite });
                              router.refresh();
                            }}
                            className={cn(
                              "pointer-events-auto flex h-7 w-7 items-center justify-center rounded-lg backdrop-blur transition-colors",
                              item.isFavourite
                                ? "bg-saffron text-white"
                                : "bg-ink/45 text-white hover:bg-ink/65",
                            )}
                          >
                            <Star filled={item.isFavourite} />
                          </button>
                          <button
                            type="button"
                            aria-label="Remove from this board"
                            onClick={async () => {
                              setItems((c) => c.filter((i) => i.id !== item.id));
                              await removeMoodboardItem(item.id);
                              router.refresh();
                            }}
                            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-lg bg-ink/45 text-white backdrop-blur transition-colors hover:bg-critical"
                          >
                            <TrashIcon size={12} />
                          </button>
                        </div>
                      ) : null}

                      {item.isFavourite ? (
                        <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-saffron text-white shadow-flat">
                          <Star filled />
                        </span>
                      ) : null}

                      {item.caption ? (
                        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/75 to-transparent p-2.5 pt-6 text-[11.5px] leading-snug text-canvas opacity-0 transition-opacity group-hover:opacity-100">
                          {item.caption}
                        </figcaption>
                      ) : null}
                    </motion.figure>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        ) : (
          <EmptyState
            title="No moodboards yet"
            description="Create your first board to start collecting inspiration."
            action={
              canEdit ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  New board
                </Button>
              ) : null
            }
          />
        )}
      </div>

      <Lightbox
        images={items.map((item) => ({
          id: item.mediaId,
          url: item.thumbUrl,
          largeUrl: item.largeUrl,
          caption: item.caption,
          filename: item.filename,
          width: item.width,
          height: item.height,
          isFavourite: item.isFavourite,
          createdAt: item.createdAt,
          contextLabel: item.contextLabel,
        }))}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        canEdit={canEdit}
        onCaptionChange={async (mediaId, caption) => {
          await updateMediaCaption(mediaId, caption);
          router.refresh();
        }}
        onToggleFavourite={async (mediaId, next) => {
          const item = items.find((i) => i.mediaId === mediaId);
          if (!item) return;
          await updateMoodboardItem({ id: item.id, isFavourite: next });
          router.refresh();
        }}
      />

      <NewBoardModal
        open={creating}
        onOpenChange={setCreating}
        events={events}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}

function NewBoardModal({
  open,
  onOpenChange,
  events,
  onCreated,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  events: { id: string; name: string }[];
  onCreated(): void;
}) {
  const [scope, setScope] = React.useState("WEDDING");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const result = await createMoodboard({
      name: form.get("name"),
      description: form.get("description"),
      scope,
      eventId: form.get("eventId"),
      category: form.get("category"),
    });
    setPending(false);
    if (!result.ok) { setError(result.error); return; }
    onOpenChange(false);
    onCreated();
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New moodboard"
      description="Group inspiration by function, by category, or just keep one big board."
    >
      <form onSubmit={submit} className="space-y-4 pb-1">
        <FormField label="Name" required htmlFor="mb-name">
          <Input id="mb-name" name="name" autoFocus required placeholder="Shaadi Inspiration" />
        </FormField>

        <FormField label="What is it for?" htmlFor="mb-scope">
          <Select
            id="mb-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="WEDDING">The whole wedding</option>
            <option value="EVENT">A particular function</option>
            <option value="CATEGORY">A category — decor, jewellery, outfits…</option>
          </Select>
        </FormField>

        {scope === "EVENT" ? (
          <FormField label="Which function?" htmlFor="mb-event">
            <Select id="mb-event" name="eventId" defaultValue={events[0]?.id ?? ""}>
              {events.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          </FormField>
        ) : null}

        {scope === "CATEGORY" ? (
          <FormField label="Category" htmlFor="mb-category">
            <Input id="mb-category" name="category" placeholder="Florals" />
          </FormField>
        ) : null}

        <FormField label="Description" htmlFor="mb-desc">
          <Textarea id="mb-desc" name="description" placeholder="What are you collecting here?" />
        </FormField>

        {error ? (
          <p role="alert" className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Creating…" : "Create board"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Star({ filled }: { filled?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.8z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
