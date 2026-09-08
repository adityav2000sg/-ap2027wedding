"use client";

/**
 * The run of show, as a vertical editorial timeline rather than a table.
 *
 * Times run down the left, a spine connects them, and the operational detail
 * (owner, vendor, location, notes) sits with each entry without turning the
 * whole thing into a spreadsheet.
 *
 * It is read-only until an `editing` context is passed — the Timeline page
 * renders several days at once and wants them quiet, while an event's own page
 * hands over the members and vendors that make each row editable in place.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn, toneClasses } from "@/lib/cn";
import {
  formatDuration,
  formatMinute,
  minuteToTimeInput,
  timeInputToMinute,
} from "@/lib/dates";
import { Avatar, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { LockIcon } from "@/components/ui/icons";
import { ConfirmModal, Sheet } from "@/components/ui/overlays";
import { FormField, Input, Select, Switch, Textarea } from "@/components/ui/form";
import {
  archiveTimelineEntry,
  createTimelineEntry,
  updateTimelineEntry,
} from "@/server/actions/timeline";

interface Entry {
  id: string;
  title: string;
  startMinute: number;
  endMinute: number;
  location: string | null;
  status: string;
  isLocked: boolean;
  notes: string | null;
  ownerName: string | null;
  ownerTone: string | null;
  vendorName: string | null;
  /** Only present when the list is editable. */
  ownerId?: string | null;
  vendorId?: string | null;
}

/** Everything needed to write back. Absent means read-only. */
export interface RunOfShowEditing {
  eventId: string | null;
  /** `YYYY-MM-DD` the new entries belong to. */
  date: string;
  members: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  /** Where a new entry starts, when the list is still empty. */
  defaultStartMinute: number;
}

const STATUS_OPTIONS = [
  { value: "PLANNED", label: "Planned" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "IN_PROGRESS", label: "Happening now" },
  { value: "DONE", label: "Done" },
  { value: "DELAYED", label: "Running late" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function EventRunOfShow({
  entries,
  tone,
  editing,
}: {
  entries: Entry[];
  tone: string;
  editing?: RunOfShowEditing;
}) {
  const reduce = useReducedMotion();
  const accent = toneClasses(tone);
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState<Entry | null>(null);

  function add() {
    setTarget(null);
    setOpen(true);
  }

  function edit(entry: Entry) {
    setTarget(entry);
    setOpen(true);
  }

  if (entries.length === 0) {
    return (
      <>
        <EmptyState
          title="No run of show yet"
          description="Build the minute-by-minute schedule once the venue is confirmed — hair and makeup, photography, the ceremony, dinner service. Everything downstream shifts together when one thing moves."
          action={
            editing ? (
              <Button variant="secondary" size="sm" onClick={add}>
                Add the first moment
              </Button>
            ) : undefined
          }
        />
        {editing ? (
          <EntrySheet
            open={open}
            onOpenChange={setOpen}
            editing={editing}
            entry={null}
            lastEnd={editing.defaultStartMinute}
          />
        ) : null}
      </>
    );
  }

  const lastEnd = entries.reduce((max, e) => Math.max(max, e.endMinute), 0);

  return (
    <>
      <ol className="relative">
        {/* The spine */}
        <div
          aria-hidden
          className="absolute bottom-4 left-[70px] top-4 w-px bg-line"
        />

        {entries.map((entry, index) => (
          <motion.li
            key={entry.id}
            layout={!reduce}
            initial={reduce ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.65,
              ease: [0.22, 1, 0.36, 1],
              delay: reduce ? 0 : Math.min(index * 0.06, 0.45),
            }}
            className="group relative flex gap-5 py-3"
          >
            {/* Time */}
            <div className="w-[58px] shrink-0 pt-0.5 text-right">
              <div className="tabular text-[13px] font-medium text-ink">
                {formatMinute(entry.startMinute)}
              </div>
              <div className="tabular text-[10.5px] text-ink-faint">
                {formatDuration(entry.endMinute - entry.startMinute)}
              </div>
            </div>

            {/* Node */}
            <div className="relative flex w-[3px] justify-center pt-[7px]">
              <span
                className={cn(
                  "relative z-10 h-[9px] w-[9px] rounded-full border-2 border-canvas",
                  "transition-colors duration-500",
                  entry.status === "DONE"
                    ? "bg-positive"
                    : entry.isLocked
                      ? accent.dot
                      : "bg-line-strong group-hover:bg-saffron",
                )}
              />
            </div>

            {/* Entry */}
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="text-[14.5px] leading-snug text-ink">{entry.title}</h3>
                {entry.isLocked ? (
                  <span
                    title="Fixed time — this can't be shifted"
                    className={cn("inline-flex items-center gap-1 text-[11px]", accent.text)}
                  >
                    <LockIcon size={10} /> Fixed
                  </span>
                ) : null}
                {entry.status === "DONE" ? (
                  <Badge variant="positive" size="xs">Done</Badge>
                ) : entry.status === "CONFIRMED" ? (
                  <Badge variant="info" size="xs">Confirmed</Badge>
                ) : entry.status === "DELAYED" ? (
                  <Badge variant="attention" size="xs">Running late</Badge>
                ) : entry.status === "CANCELLED" ? (
                  <Badge variant="outline" size="xs">Cancelled</Badge>
                ) : null}
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-ink-muted">
                {entry.location ? <span>{entry.location}</span> : null}
                {entry.vendorName ? (
                  <>
                    {entry.location ? <span className="text-ink-faint">·</span> : null}
                    <span>{entry.vendorName}</span>
                  </>
                ) : null}
              </div>

              {entry.notes ? (
                <p className="mt-1 max-w-lg text-[12px] leading-snug text-ink-muted">
                  {entry.notes}
                </p>
              ) : null}
            </div>

            {editing ? (
              <button
                type="button"
                onClick={() => edit(entry)}
                className={cn(
                  "shrink-0 self-start rounded-md px-2 py-1 text-[12px] text-ink-muted",
                  "opacity-0 transition-all duration-500 transition-natural",
                  "hover:bg-surface-sunken hover:text-ink focus-visible:opacity-100 group-hover:opacity-100",
                )}
              >
                Edit
              </button>
            ) : null}

            {entry.ownerName ? (
              <Avatar
                name={entry.ownerName}
                tone={entry.ownerTone}
                size="sm"
                className="mt-0.5 shrink-0"
              />
            ) : null}
          </motion.li>
        ))}
      </ol>

      {editing ? (
        <>
          <div className="mt-4 pl-[83px]">
            <Button variant="secondary" size="sm" onClick={add}>
              Add a moment
            </Button>
          </div>
          <EntrySheet
            open={open}
            onOpenChange={setOpen}
            editing={editing}
            entry={target}
            lastEnd={lastEnd}
          />
        </>
      ) : null}
    </>
  );
}

/**
 * One entry, added or amended.
 *
 * New entries start where the last one ended, because that is what a run of
 * show is — a queue, not a calendar.
 */
function EntrySheet({
  open,
  onOpenChange,
  editing,
  entry,
  lastEnd,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  editing: RunOfShowEditing;
  entry: Entry | null;
  lastEnd: number;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [warnings, setWarnings] = React.useState<{ key: string; title: string; detail: string }[]>([]);

  const initial = React.useMemo(
    () => ({
      title: entry?.title ?? "",
      startTime: minuteToTimeInput(entry?.startMinute ?? lastEnd),
      endTime: minuteToTimeInput((entry?.endMinute ?? lastEnd + 30) % 1440),
      location: entry?.location ?? "",
      ownerId: entry?.ownerId ?? "",
      vendorId: entry?.vendorId ?? "",
      status: entry?.status ?? "PLANNED",
      notes: entry?.notes ?? "",
      isLocked: entry?.isLocked ?? false,
    }),
    [entry, lastEnd],
  );

  const [form, setForm] = React.useState(initial);
  React.useEffect(() => {
    if (open) {
      setForm(initial);
      setError(null);
      setWarnings([]);
    }
  }, [open, initial]);

  const set = <K extends keyof typeof initial>(key: K, value: (typeof initial)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const startMinute = timeInputToMinute(form.startTime);
  let endMinute = timeInputToMinute(form.endTime);
  // A moment that ends "before" it starts is one that crosses midnight.
  if (endMinute <= startMinute) endMinute += 1440;

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setError(null);
    setPending(true);

    const payload = {
      title: form.title.trim(),
      startMinute,
      endMinute,
      location: form.location.trim(),
      ownerId: form.ownerId,
      vendorId: form.vendorId,
      status: form.status,
      notes: form.notes.trim(),
      isLocked: form.isLocked,
    };

    try {
      const result = entry
        ? await updateTimelineEntry({ ...payload, id: entry.id })
        : await createTimelineEntry({
            ...payload,
            eventId: editing.eventId,
            date: editing.date,
          });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Conflicts don't stop the save — they're reported so the next decision
      // is an informed one.
      if (result.data.conflicts.length > 0) {
        setWarnings(result.data.conflicts);
        router.refresh();
        return;
      }

      onOpenChange(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!entry) return;
    setPending(true);
    try {
      const result = await archiveTimelineEntry({ id: entry.id });
      if (!result.ok) {
        setError(result.error);
        setConfirmRemove(false);
        return;
      }
      setConfirmRemove(false);
      onOpenChange(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={entry ? "Edit this moment" : "Add a moment"}
        description={
          entry
            ? "Everything that depends on it moves when it moves."
            : "Hair and makeup, the baraat, dinner service — the minute-by-minute."
        }
        width="md"
        footer={
          <div className="flex items-center justify-between gap-3">
            {entry ? (
              <Button
                type="button"
                variant="dangerGhost"
                size="sm"
                onClick={() => setConfirmRemove(true)}
                disabled={pending}
              >
                Remove
              </Button>
            ) : (
              <span className="tabular text-[12px] text-ink-muted">
                {formatMinute(startMinute)}–{formatMinute(endMinute)} ·{" "}
                {formatDuration(endMinute - startMinute)}
              </span>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {warnings.length > 0 ? "Done" : "Cancel"}
              </Button>
              <Button
                type="submit"
                form="run-of-show-form"
                variant="primary"
                disabled={pending}
              >
                {pending ? "Saving…" : entry ? "Save" : "Add it"}
              </Button>
            </div>
          </div>
        }
      >
        <form id="run-of-show-form" onSubmit={submit} className="space-y-4">
          <FormField label="What happens?" required htmlFor="ros-title">
            <Input
              id="ros-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Bridal hair and makeup"
              autoFocus
              required
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Starts" required htmlFor="ros-start">
              <Input
                id="ros-start"
                type="time"
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                required
              />
            </FormField>
            <FormField
              label="Ends"
              hint={`${formatDuration(endMinute - startMinute)}${
                endMinute >= 1440 ? " · past midnight" : ""
              }`}
              htmlFor="ros-end"
            >
              <Input
                id="ros-end"
                type="time"
                value={form.endTime}
                onChange={(e) => set("endTime", e.target.value)}
                required
              />
            </FormField>
          </div>

          <FormField label="Where?" htmlFor="ros-location">
            <Input
              id="ros-location"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Bridal suite, 4th floor"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Who's responsible?" htmlFor="ros-owner">
              <Select
                id="ros-owner"
                value={form.ownerId}
                onChange={(e) => set("ownerId", e.target.value)}
              >
                <option value="">Nobody yet</option>
                {editing.members.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Which vendor?" htmlFor="ros-vendor">
              <Select
                id="ros-vendor"
                value={form.vendorId}
                onChange={(e) => set("vendorId", e.target.value)}
              >
                <option value="">Not a vendor's job</option>
                {editing.vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Where's it up to?" htmlFor="ros-status">
            <Select
              id="ros-status"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Notes" htmlFor="ros-notes">
            <Textarea
              id="ros-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything whoever's running the day needs to know."
            />
          </FormField>

          <Switch
            checked={form.isLocked}
            onCheckedChange={(value) => set("isLocked", value)}
            label="Fixed time"
            description="Muhurat timings, flight arrivals — locked entries stay put when everything else shifts."
          />

          {/* Conflicts the save left behind. */}
          <AnimatePresence initial={false}>
            {warnings.map((warning, index) => (
              <motion.div
                key={warning.key}
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -4 }}
                transition={{
                  duration: 0.5,
                  delay: reduce ? 0 : index * 0.06,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="rounded-lg border border-attention/20 bg-attention-soft px-3 py-2"
              >
                <p className="text-[12.5px] font-medium text-attention">
                  Saved — {warning.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
                  {warning.detail}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical"
            >
              {error}
            </p>
          ) : null}
        </form>
      </Sheet>

      <ConfirmModal
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove “${entry?.title ?? ""}”?`}
        description="It comes off the run of show. Anything scheduled to follow it keeps its own time."
        confirmLabel="Remove it"
        destructive
        onConfirm={remove}
        pending={pending}
      />
    </>
  );
}
