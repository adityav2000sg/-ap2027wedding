"use client";

/**
 * Who's handling what.
 *
 * This was a read-only board with an alert above it saying jobs had nobody's
 * name against them — a complaint with no way to answer it. Assigning someone
 * is now a dropdown on the row, the same shape as assigning a task, and jobs
 * can be added and removed.
 *
 * Assigning is deliberately not behind an edit sheet. The whole activity here
 * is going down a list handing things out, and a sheet per row would make that
 * twenty clicks instead of five.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlays";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import {
  createResponsibility,
  deleteResponsibility,
  updateResponsibility,
} from "@/server/actions/logistics";

export interface ResponsibilityRow {
  id: string;
  title: string;
  area: string;
  ownerId: string | null;
  backupId: string | null;
  eventId: string | null;
  importance: number;
  status: string;
  notes: string | null;
}

export interface Member {
  id: string;
  name: string;
}

export function Responsibilities({
  rows,
  members,
  events,
  canEdit,
}: {
  rows: ResponsibilityRow[];
  members: Member[];
  events: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [composing, setComposing] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState<string | null>(null);

  /**
   * Unowned first — the list exists to be emptied of them — but the order is
   * fixed when the page loads and doesn't move again.
   *
   * Re-sorting on every change meant assigning somebody made the row leap to
   * the bottom of a thirty-item list the instant you picked a name. It looked
   * like the job had been deleted, and you lost your place. The new order
   * applies next time the page is opened.
   */
  const initialOrder = React.useRef<string[] | null>(null);

  const sorted = React.useMemo(() => {
    const ranked = rows
      .slice()
      .sort(
        (a, b) =>
          Number(Boolean(a.ownerId)) - Number(Boolean(b.ownerId)) ||
          b.importance - a.importance ||
          a.area.localeCompare(b.area),
      );

    if (initialOrder.current === null) {
      initialOrder.current = ranked.map((row) => row.id);
      return ranked;
    }

    const position = new Map(initialOrder.current.map((id, index) => [id, index]));
    return rows
      .slice()
      .sort(
        (a, b) =>
          // Anything added since load goes to the end rather than nowhere.
          (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (position.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
  }, [rows]);

  const unowned = sorted.filter((row) => !row.ownerId).length;

  async function assign(id: string, ownerId: string) {
    setBusy(id);
    await updateResponsibility({ id, ownerId: ownerId || null });
    setBusy(null);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    await deleteResponsibility(id);
    setBusy(null);
    setConfirmingDelete(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {unowned > 0 ? (
          <p className="rounded-lg border border-attention/25 bg-attention-soft px-3.5 py-2 text-[12.5px] text-attention">
            {unowned} {unowned === 1 ? "job has" : "jobs have"} nobody's name
            against {unowned === 1 ? "it" : "them"}. These are the ones that get
            forgotten.
          </p>
        ) : (
          <p className="text-[12.5px] text-positive">
            Everything here has somebody's name on it.
          </p>
        )}

        {canEdit ? (
          <Button
            variant="primary"
            size="sm"
            className="h-9 shrink-0 gap-1.5"
            onClick={() => setComposing(true)}
          >
            <PlusIcon size={14} />
            Add a job
          </Button>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="Nothing on the board yet"
          description="Add the jobs that need a name against them — collecting the pandit, minding the gifts, running the sound check."
        />
      ) : (
        <ul>
          <AnimatePresence initial={false}>
            {sorted.map((row) => (
              <motion.li
                key={row.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-2.5",
                  busy === row.id && "opacity-50",
                )}
              >
                <span className="w-[96px] shrink-0 text-[11.5px] text-ink-muted">
                  {row.area}
                </span>

                <span className="min-w-0 flex-1 text-[13.5px] text-ink">
                  {row.title}
                  {row.eventId ? (
                    <span className="ml-2 text-[11.5px] text-ink-faint">
                      {events.find((e) => e.id === row.eventId)?.name}
                    </span>
                  ) : null}
                </span>

                {canEdit ? (
                  <Select
                    value={row.ownerId ?? ""}
                    disabled={busy === row.id}
                    onChange={(e) => assign(row.id, e.target.value)}
                    className={cn(
                      "h-8 w-auto min-w-[150px] shrink-0 text-[12.5px]",
                      !row.ownerId && "border-attention/40 text-attention",
                    )}
                  >
                    <option value="">Nobody yet</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </Select>
                ) : row.ownerId ? (
                  <span className="shrink-0 text-[12.5px] text-ink">
                    {members.find((m) => m.id === row.ownerId)?.name}
                  </span>
                ) : (
                  <Badge size="xs" variant="attention" className="shrink-0">
                    Nobody yet
                  </Badge>
                )}

                {canEdit ? (
                  confirmingDelete === row.id ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(null)}
                        className="text-[12px] text-ink-muted hover:text-ink"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(row.id)}
                        className="text-[12px] font-medium text-critical"
                      >
                        Remove
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(row.id)}
                      aria-label={`Remove ${row.title}`}
                      className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-critical"
                    >
                      <TrashIcon size={13} />
                    </button>
                  )
                ) : null}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <ResponsibilityComposer
        open={composing}
        onOpenChange={setComposing}
        members={members}
        events={events}
        knownAreas={[...new Set(rows.map((r) => r.area))].sort()}
      />
    </>
  );
}

function ResponsibilityComposer({
  open,
  onOpenChange,
  members,
  events,
  knownAreas,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  members: Member[];
  events: { id: string; name: string }[];
  knownAreas: string[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    title: "",
    area: knownAreas[0] ?? "On the day",
    ownerId: "",
    backupId: "",
    eventId: "",
    importance: "3",
    notes: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!form.title.trim()) {
      setError("Say what needs handling.");
      return;
    }
    setPending(true);
    setError(null);

    const result = await createResponsibility({
      ...form,
      ownerId: form.ownerId || undefined,
      backupId: form.backupId || undefined,
      eventId: form.eventId || undefined,
    });

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setForm((f) => ({ ...f, title: "", ownerId: "", backupId: "", notes: "" }));
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add a job"
      description="Something that needs a name against it, rather than a task with a deadline."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? "Adding…" : "Add it"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField label="What needs handling?" htmlFor="r-title" required>
          <Input
            id="r-title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Collect the pandit from the airport"
            autoFocus
          />
        </FormField>

        <FormField
          label="Which area?"
          htmlFor="r-area"
          hint="Groups it on the board — transport, gifts, on the day."
        >
          <Input
            id="r-area"
            list="known-areas"
            value={form.area}
            onChange={(e) => set("area", e.target.value)}
          />
          <datalist id="known-areas">
            {knownAreas.map((area) => (
              <option key={area} value={area} />
            ))}
          </datalist>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Who's handling it?" htmlFor="r-owner">
            <Select
              id="r-owner"
              value={form.ownerId}
              onChange={(e) => set("ownerId", e.target.value)}
            >
              <option value="">Nobody yet</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Backup" htmlFor="r-backup" hint="If the first person can't.">
            <Select
              id="r-backup"
              value={form.backupId}
              onChange={(e) => set("backupId", e.target.value)}
            >
              <option value="">Nobody</option>
              {members
                .filter((m) => m.id !== form.ownerId)
                .map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Which function?" htmlFor="r-event">
            <Select
              id="r-event"
              value={form.eventId}
              onChange={(e) => set("eventId", e.target.value)}
            >
              <option value="">Not tied to one</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="How much does it matter?" htmlFor="r-importance">
            <Select
              id="r-importance"
              value={form.importance}
              onChange={(e) => set("importance", e.target.value)}
            >
              <option value="5">Critical</option>
              <option value="4">High</option>
              <option value="3">Normal</option>
              <option value="2">Low</option>
              <option value="1">Nice to have</option>
            </Select>
          </FormField>
        </div>

        <FormField label="Anything else?" htmlFor="r-notes">
          <Textarea
            id="r-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </FormField>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
