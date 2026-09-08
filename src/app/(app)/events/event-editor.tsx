"use client";

/**
 * The event editor.
 *
 * Adding a function to a wedding has a lot of edges: it can be a two-hour puja
 * three months early, a Sangeet that ends at 1 AM, a second Mehendi at a
 * different hotel, a private family lunch nobody else should see. The form is
 * built so all of those are three fields and a switch — not a wall of inputs —
 * while the app quietly reads the plan back to you as you type.
 *
 * Two rules it follows:
 *   - Presets, never rules. Choosing "Sangeet" fills in an evening start and a
 *     six-hour run; every one of them stays editable.
 *   - Warnings inform, they don't block. Only genuine impossibilities — an
 *     event ending before it starts — stop the save.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  checkEventDraft,
  EVENT_KIND_LABEL,
  EVENT_KIND_PRESETS,
  hasBlockingError,
  resolveEndMinute,
  runsPastMidnight,
  type EventCheck,
  type EventLike,
  type VenueLike,
} from "@/domain/events";
import type { EventKind } from "@/domain/types";
import {
  civilDate,
  formatDuration,
  formatLongDate,
  formatMinute,
  minuteToTimeInput,
  timeInputToMinute,
} from "@/lib/dates";
import { cn, TONES, toneClasses } from "@/lib/cn";
import { Sheet, ConfirmModal } from "@/components/ui/overlays";
import { Button } from "@/components/ui/primitives";
import { FormField, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { archiveEvent, createEvent, eventRemovalImpact, updateEvent } from "@/server/actions/events";

const KIND_ORDER: EventKind[] = [
  "HALDI", "MEHENDI", "SANGEET", "SHAADI", "RECEPTION",
  "WELCOME", "PUJA", "COCKTAIL", "AFTERPARTY", "BRUNCH", "CUSTOM",
];

/** Serialisable slice of the wedding the checks need. Dates travel as ISO. */
export interface EventEditorContext {
  weddingStart: string;
  weddingEnd: string;
  events: {
    id: string;
    name: string;
    kind: EventKind;
    date: string;
    startMinute: number;
    endMinute: number;
    venueId: string | null;
  }[];
  venues: {
    id: string;
    name: string;
    city: string | null;
    capacity: number | null;
    curfewMinute: number | null;
    alcoholAllowed: boolean;
    hasRainBackup: boolean;
  }[];
  /** How many people are on the list, so "everyone" can say how many that is. */
  guestCount: number;
}

export interface EditableEvent {
  id: string;
  name: string;
  kind: EventKind;
  date: string;
  startMinute: number;
  endMinute: number;
  venueId: string | null;
  dressCode: string | null;
  description: string | null;
  notes: string | null;
  estimatedGuests: number;
  accentTone: string;
  isPrivate: boolean;
}

interface DraftState {
  name: string;
  kind: EventKind;
  date: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  venueId: string;
  newVenueName: string;
  newVenueCity: string;
  dressCode: string;
  description: string;
  notes: string;
  estimatedGuests: string;
  accentTone: string;
  isPrivate: boolean;
  inviteMode: string;
  copyFromEventId: string;
  generateTasks: boolean;
  createMoodboard: boolean;
  shiftRunOfShow: boolean;
}

function blankDraft(context: EventEditorContext): DraftState {
  const preset = EVENT_KIND_PRESETS.CUSTOM;
  return {
    name: "",
    kind: "CUSTOM",
    // Defaults to the first day of the wedding — the commonest answer by far.
    date: context.weddingStart,
    startTime: minuteToTimeInput(preset.startMinute),
    endTime: minuteToTimeInput(preset.startMinute + preset.durationMinutes),
    endsNextDay: false,
    venueId: "",
    newVenueName: "",
    newVenueCity: "",
    dressCode: "",
    description: "",
    notes: "",
    estimatedGuests: "",
    accentTone: preset.tone,
    isPrivate: false,
    inviteMode: "none",
    copyFromEventId: "",
    generateTasks: true,
    createMoodboard: true,
    shiftRunOfShow: true,
  };
}

function draftFromEvent(event: EditableEvent): DraftState {
  return {
    name: event.name,
    kind: event.kind,
    date: event.date,
    startTime: minuteToTimeInput(event.startMinute),
    endTime: minuteToTimeInput(event.endMinute),
    endsNextDay: runsPastMidnight(event),
    venueId: event.venueId ?? "",
    newVenueName: "",
    newVenueCity: "",
    dressCode: event.dressCode ?? "",
    description: event.description ?? "",
    notes: event.notes ?? "",
    estimatedGuests: event.estimatedGuests ? String(event.estimatedGuests) : "",
    accentTone: event.accentTone,
    isPrivate: event.isPrivate,
    inviteMode: "none",
    copyFromEventId: "",
    generateTasks: false,
    createMoodboard: false,
    shiftRunOfShow: true,
  };
}

export function EventEditor({
  open,
  onOpenChange,
  context,
  event,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  context: EventEditorContext;
  /** Absent for a new function. */
  event?: EditableEvent | null;
}) {
  const editing = Boolean(event);
  const router = useRouter();
  const reduce = useReducedMotion();

  const [draft, setDraft] = React.useState<DraftState>(() =>
    event ? draftFromEvent(event) : blankDraft(context),
  );
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [removal, setRemoval] = React.useState<{ lines: string[] } | null>(null);
  const [advanced, setAdvanced] = React.useState(false);

  // Reset whenever the sheet is reopened, so a cancelled edit leaves nothing
  // behind. Deliberately keyed on `open` alone: a background refresh handing
  // down a new context object must not wipe what someone is halfway through
  // typing.
  React.useEffect(() => {
    if (!open) return;
    setDraft(event ? draftFromEvent(event) : blankDraft(context));
    setError(null);
    setAdvanced(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = React.useCallback(
    <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
      setDraft((current) => ({ ...current, [key]: value })),
    [],
  );

  /**
   * Applying a preset must never silently overwrite something the family typed,
   * so it only fills fields that are still untouched or still hold the previous
   * preset's suggestion.
   */
  function chooseKind(kind: EventKind) {
    const preset = EVENT_KIND_PRESETS[kind];
    setDraft((current) => {
      const previous = EVENT_KIND_PRESETS[current.kind];
      const nameIsPreset = current.name === "" || current.name === previous.name;
      const dressIsPreset =
        current.dressCode === "" || current.dressCode === previous.dressCode;
      const toneIsPreset = current.accentTone === previous.tone;
      const timesArePreset =
        current.startTime === minuteToTimeInput(previous.startMinute) &&
        current.endTime ===
          minuteToTimeInput(
            (previous.startMinute + previous.durationMinutes) % 1440,
          );

      const end = preset.startMinute + preset.durationMinutes;
      return {
        ...current,
        kind,
        name: nameIsPreset ? preset.name : current.name,
        dressCode: dressIsPreset ? preset.dressCode : current.dressCode,
        accentTone: toneIsPreset ? preset.tone : current.accentTone,
        startTime: timesArePreset
          ? minuteToTimeInput(preset.startMinute)
          : current.startTime,
        endTime: timesArePreset ? minuteToTimeInput(end % 1440) : current.endTime,
        endsNextDay: timesArePreset ? end >= 1440 : current.endsNextDay,
      };
    });
  }

  // ── Live reading of the plan ─────────────────────────────────────────────
  const startMinute = timeInputToMinute(draft.startTime);
  const endMinute = resolveEndMinute(
    startMinute,
    timeInputToMinute(draft.endTime),
    draft.endsNextDay,
  );
  const duration = endMinute - startMinute;
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.date)
    ? civilDate(draft.date)
    : null;
  const guests = Number(draft.estimatedGuests || 0);

  const checks: EventCheck[] = React.useMemo(() => {
    if (!parsedDate) return [];
    return checkEventDraft(
      {
        weddingStart: civilDate(context.weddingStart),
        weddingEnd: civilDate(context.weddingEnd),
        events: context.events.map(
          (e): EventLike => ({ ...e, date: civilDate(e.date) }),
        ),
        venues: context.venues as VenueLike[],
      },
      {
        id: event?.id ?? null,
        name: draft.name,
        kind: draft.kind,
        date: parsedDate,
        startMinute,
        endMinute,
        venueId: draft.venueId || null,
        estimatedGuests: Number.isFinite(guests) ? guests : 0,
        isPrivate: draft.isPrivate,
      },
    );
    // `parsedDate` is derived from draft.date, which is in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    context, event?.id, draft.name, draft.kind, draft.date, draft.venueId,
    draft.isPrivate, startMinute, endMinute, guests,
  ]);

  const blocked = hasBlockingError(checks);
  const errors = checks.filter((c) => c.severity === "error");
  const advisories = checks.filter((c) => c.severity !== "error");

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (blocked) return;
    setError(null);
    setPending(true);

    const payload = {
      name: draft.name.trim(),
      kind: draft.kind,
      date: draft.date,
      startMinute,
      endMinute,
      venueId: draft.venueId,
      newVenueName: draft.venueId ? "" : draft.newVenueName.trim(),
      newVenueCity: draft.venueId ? "" : draft.newVenueCity.trim(),
      dressCode: draft.dressCode.trim(),
      description: draft.description.trim(),
      notes: draft.notes.trim(),
      estimatedGuests: Number(draft.estimatedGuests || 0),
      accentTone: draft.accentTone,
      isPrivate: draft.isPrivate,
    };

    try {
      const result = event
        ? await updateEvent({
            ...payload,
            id: event.id,
            shiftRunOfShow: draft.shiftRunOfShow,
          })
        : await createEvent({
            ...payload,
            inviteMode: draft.inviteMode,
            copyFromEventId: draft.copyFromEventId,
            generateTasks: draft.generateTasks,
            createMoodboard: draft.createMoodboard,
          });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      router.refresh();
      if (!event && "slug" in result.data) {
        router.push(`/events/${result.data.slug}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  async function openRemoval() {
    if (!event) return;
    const result = await eventRemovalImpact({ id: event.id });
    setRemoval(result.ok ? { lines: result.data.lines } : { lines: [] });
    setConfirmRemove(true);
  }

  async function remove() {
    if (!event) return;
    setPending(true);
    try {
      const result = await archiveEvent({ id: event.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmRemove(false);
      onOpenChange(false);
      router.push("/events");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const venue = context.venues.find((v) => v.id === draft.venueId) ?? null;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? `Edit ${event!.name}` : "Add a function"}
        description={
          editing
            ? "Anything scheduled inside it moves with it."
            : "A haldi, a puja, a boat day — anything the family is doing."
        }
        width="lg"
        footer={
          <div className="flex items-center justify-between gap-3">
            {editing ? (
              <Button
                type="button"
                variant="dangerGhost"
                size="sm"
                onClick={openRemoval}
                disabled={pending}
              >
                Remove this function
              </Button>
            ) : (
              <span className="text-[12px] text-ink-muted">
                {parsedDate ? formatLongDate(parsedDate) : "Pick a date"}
                {duration > 0 ? ` · ${formatDuration(duration)}` : ""}
              </span>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="event-editor-form"
                variant="primary"
                disabled={pending || blocked}
              >
                {pending
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Add it to the wedding"}
              </Button>
            </div>
          </div>
        }
      >
        <form id="event-editor-form" onSubmit={submit} className="space-y-6">
          {/* ── What kind of function ─────────────────────────────────────── */}
          <fieldset>
            <legend className="mb-2 text-[12.5px] font-medium text-ink-soft">
              What kind of function?
            </legend>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {KIND_ORDER.map((kind) => {
                const active = draft.kind === kind;
                const tone = toneClasses(EVENT_KIND_PRESETS[kind].tone);
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => chooseKind(kind)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left",
                      "transition-all duration-400 transition-natural",
                      active
                        ? "border-saffron/40 bg-saffron-soft shadow-flat"
                        : "border-line bg-surface hover:border-line-strong hover:bg-surface-sunken",
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full transition-transform duration-400 transition-natural",
                        tone.dot,
                        active ? "scale-125" : "scale-100",
                      )}
                    />
                    <span
                      className={cn(
                        "truncate text-[12.5px]",
                        active ? "font-medium text-ink" : "text-ink-soft",
                      )}
                    >
                      {EVENT_KIND_LABEL[kind]}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
              {EVENT_KIND_PRESETS[draft.kind].hint}
            </p>
          </fieldset>

          <FormField label="What's it called?" required htmlFor="ev-name">
            <Input
              id="ev-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={EVENT_KIND_PRESETS[draft.kind].name || "Mata ki Chowki"}
              required
              autoFocus
            />
          </FormField>

          {/* ── When ──────────────────────────────────────────────────────── */}
          <div className="space-y-3 rounded-xl border border-line bg-surface-soft p-3.5">
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Date" required htmlFor="ev-date">
                <Input
                  id="ev-date"
                  type="date"
                  value={draft.date}
                  onChange={(e) => set("date", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Starts" required htmlFor="ev-start">
                <Input
                  id="ev-start"
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => set("startTime", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Ends" required htmlFor="ev-end">
                <Input
                  id="ev-end"
                  type="time"
                  value={draft.endTime}
                  onChange={(e) => set("endTime", e.target.value)}
                  required
                />
              </FormField>
            </div>

            <Switch
              checked={draft.endsNextDay}
              onCheckedChange={(value) => set("endsNextDay", value)}
              label="Runs past midnight"
              description="For a sangeet that finishes at 1 AM or an afterparty that doesn't."
            />

            <p className="text-[12px] text-ink-muted">
              {parsedDate ? (
                <>
                  {formatLongDate(parsedDate)} ·{" "}
                  <span className="tabular text-ink-soft">
                    {formatMinute(startMinute)}–{formatMinute(endMinute)}
                  </span>
                  {duration > 0 ? ` · ${formatDuration(duration)}` : null}
                  {endMinute >= 1440 ? " · ends the next morning" : null}
                </>
              ) : (
                "Choose a date."
              )}
            </p>
          </div>

          {/* ── Where ─────────────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Where?"
              hint={
                venue?.capacity
                  ? `Holds ${venue.capacity}${
                      venue.curfewMinute !== null
                        ? `, closes ${formatMinute(venue.curfewMinute)}`
                        : ""
                    }.`
                  : "Nothing chosen is a valid answer."
              }
              htmlFor="ev-venue"
            >
              <Select
                id="ev-venue"
                value={draft.venueId}
                onChange={(e) => set("venueId", e.target.value)}
              >
                <option value="">Not decided yet</option>
                {context.venues.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                    {option.city ? ` — ${option.city}` : ""}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Expected guests" htmlFor="ev-guests">
              <Input
                id="ev-guests"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={draft.estimatedGuests}
                onChange={(e) => set("estimatedGuests", e.target.value)}
                placeholder="Leave blank to use the RSVP count"
              />
            </FormField>
          </div>

          {!draft.venueId ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Or add the venue now"
                hint="Creates it here so you don't have to leave this form."
                htmlFor="ev-newvenue"
              >
                <Input
                  id="ev-newvenue"
                  value={draft.newVenueName}
                  onChange={(e) => set("newVenueName", e.target.value)}
                  placeholder="The Ritz-Carlton, Bali"
                />
              </FormField>
              <FormField label="City" htmlFor="ev-newvenue-city">
                <Input
                  id="ev-newvenue-city"
                  value={draft.newVenueCity}
                  onChange={(e) => set("newVenueCity", e.target.value)}
                  placeholder="Nusa Dua"
                />
              </FormField>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Dress code" htmlFor="ev-dress">
              <Input
                id="ev-dress"
                value={draft.dressCode}
                onChange={(e) => set("dressCode", e.target.value)}
                placeholder={EVENT_KIND_PRESETS[draft.kind].dressCode || "Anything goes"}
              />
            </FormField>

            <FormField label="Colour" hint="How it's marked everywhere else.">
              <div className="flex flex-wrap gap-1.5 pt-1">
                {TONES.map((tone) => {
                  const classes = toneClasses(tone);
                  const active = draft.accentTone === tone;
                  return (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => set("accentTone", tone)}
                      aria-label={tone}
                      aria-pressed={active}
                      className={cn(
                        "h-5 w-5 rounded-full transition-all duration-400 transition-natural",
                        classes.dot,
                        active
                          ? "scale-110 ring-2 ring-ink/25 ring-offset-2 ring-offset-surface"
                          : "opacity-55 hover:scale-105 hover:opacity-100",
                      )}
                    />
                  );
                })}
              </div>
            </FormField>
          </div>

          <FormField
            label="What happens at it?"
            hint="One line. It shows on the event's own page."
            htmlFor="ev-desc"
          >
            <Textarea
              id="ev-desc"
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Turmeric, marigolds and far too much laughing."
            />
          </FormField>

          {/* ── What it should set up ─────────────────────────────────────── */}
          {!editing ? (
            <div className="space-y-3.5 rounded-xl border border-line bg-surface-soft p-3.5">
              <h3 className="text-[12.5px] font-medium text-ink-soft">
                And once it exists…
              </h3>

              <FormField label="Who's invited?" htmlFor="ev-invite">
                <Select
                  id="ev-invite"
                  value={draft.inviteMode}
                  onChange={(e) => set("inviteMode", e.target.value)}
                >
                  <option value="none">Nobody yet — I'll pick later</option>
                  <option value="everyone">
                    Everyone on the list ({context.guestCount})
                  </option>
                  <option value="copy">The same people as another function</option>
                  <option value="bride">The bride's side</option>
                  <option value="groom">The groom's side</option>
                  <option value="vip">VIPs only</option>
                </Select>
              </FormField>

              {draft.inviteMode === "copy" ? (
                <FormField label="Copy the list from" htmlFor="ev-copy">
                  <Select
                    id="ev-copy"
                    value={draft.copyFromEventId}
                    onChange={(e) => set("copyFromEventId", e.target.value)}
                  >
                    <option value="">Choose a function</option>
                    {context.events.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : null}

              <Switch
                checked={draft.generateTasks}
                onCheckedChange={(value) => set("generateTasks", value)}
                label="Generate the planning tasks for it"
                description="The vendors, deadlines and dependencies this kind of function needs. Nothing already on your list is touched."
              />
              <Switch
                checked={draft.createMoodboard}
                onCheckedChange={(value) => set("createMoodboard", value)}
                label="Open a moodboard for it"
                description="Somewhere to put the first picture."
              />
            </div>
          ) : (
            <Switch
              checked={draft.shiftRunOfShow}
              onCheckedChange={(value) => set("shiftRunOfShow", value)}
              label="Move the run of show with it"
              description="If the date or start time changes, everything scheduled inside it shifts by the same amount. Locked entries stay put."
            />
          )}

          {/* ── The quieter fields ────────────────────────────────────────── */}
          <div>
            <button
              type="button"
              onClick={() => setAdvanced((value) => !value)}
              className="text-[12.5px] text-ink-muted transition-colors duration-300 hover:text-ink"
            >
              {advanced ? "Fewer options" : "More options"}
            </button>

            <div
              className={cn(
                "grid transition-all duration-500 transition-natural",
                advanced ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <div className="space-y-4">
                  <FormField
                    label="Private notes"
                    hint="Visible to the family, never on a guest-facing view."
                    htmlFor="ev-notes"
                  >
                    <Textarea
                      id="ev-notes"
                      value={draft.notes}
                      onChange={(e) => set("notes", e.target.value)}
                    />
                  </FormField>
                  <Switch
                    checked={draft.isPrivate}
                    onCheckedChange={(value) => set("isPrivate", value)}
                    label="Keep this off guest-facing views"
                    description="For family-only pujas, planning meetings and anything guests shouldn't see."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── What the app noticed ──────────────────────────────────────── */}
          <AnimatePresence initial={false}>
            {checks.length > 0 ? (
              <motion.div
                key="checks"
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduce ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <ul className="space-y-1.5 pt-1">
                  <AnimatePresence initial={false}>
                    {[...errors, ...advisories].map((check, index) => (
                      <motion.li
                        key={check.key}
                        layout={!reduce}
                        initial={reduce ? false : { opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? undefined : { opacity: 0, y: -4 }}
                        transition={{
                          duration: 0.45,
                          delay: reduce ? 0 : Math.min(index * 0.05, 0.25),
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className={cn(
                          "rounded-lg border px-3 py-2",
                          check.severity === "error"
                            ? "border-critical/20 bg-critical-soft"
                            : check.severity === "warning"
                              ? "border-attention/20 bg-attention-soft"
                              : "border-line bg-surface-sunken",
                        )}
                      >
                        <p
                          className={cn(
                            "text-[12.5px] font-medium",
                            check.severity === "error"
                              ? "text-critical"
                              : check.severity === "warning"
                                ? "text-attention"
                                : "text-ink-soft",
                          )}
                        >
                          {check.message}
                        </p>
                        {check.detail ? (
                          <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
                            {check.detail}
                          </p>
                        ) : null}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </motion.div>
            ) : null}
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
        title={`Remove ${event?.name ?? "this function"}?`}
        description={
          <>
            It stops appearing everywhere in the app. Nothing is deleted — the
            history stays in the activity feed.
            {removal && removal.lines.length > 0 ? (
              <span className="mt-2 block space-y-0.5">
                {removal.lines.map((line) => (
                  <span key={line} className="block text-ink-soft">
                    · {line}
                  </span>
                ))}
              </span>
            ) : null}
          </>
        }
        confirmLabel="Remove it"
        destructive
        onConfirm={remove}
        pending={pending}
      />
    </>
  );
}

/** The button that opens it, so pages only mount one component. */
export function AddEventButton({
  context,
  label = "Add a function",
  variant = "primary",
  size = "md",
}: {
  context: EventEditorContext;
  label?: string;
  variant?: "primary" | "secondary" | "accent" | "ghost";
  size?: "sm" | "md";
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <EventEditor open={open} onOpenChange={setOpen} context={context} />
    </>
  );
}

/** The same editor, opened against an existing function. */
export function EditEventButton({
  context,
  event,
  label = "Edit",
}: {
  context: EventEditorContext;
  event: EditableEvent;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <EventEditor open={open} onOpenChange={setOpen} context={context} event={event} />
    </>
  );
}

