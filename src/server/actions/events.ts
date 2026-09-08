"use server";

/**
 * Event mutations.
 *
 * A function is the unit everything else hangs off — tasks, guests, vendors,
 * budget lines, the run of show, outfits, moodboards. So adding one does more
 * than write a row:
 *
 *   - it can create the venue it's at, in the same breath
 *   - it can invite a set of guests, or copy another function's list
 *   - it generates the planning tasks that kind of function actually needs
 *   - it opens a moodboard so there's somewhere to put the first picture
 *
 * And moving one carries its run of show with it, because a Sangeet that slips
 * a day takes the hair and makeup call with it or the schedule is a lie.
 */

import { z } from "zod";

import {
  checkEventDraft,
  describeRemoval,
  EVENT_KIND_PRESETS,
  hasBlockingError,
  nextSortOrder,
  uniqueEventSlug,
} from "@/domain/events";
import { formatLongDate, formatMinute, toISODate } from "@/lib/dates";
import { TONES } from "@/lib/cn";
import { logViewerActivity } from "@/server/activity";
import { db } from "@/server/db";
import { generateMasterPlan } from "@/server/plan-generator";
import { fetchSnapshot } from "@/server/snapshot-query";
import {
  civilDate,
  optionalId,
  optionalString,
  revalidateWedding,
  withAction,
} from "./shared";

const KINDS = [
  "HALDI", "MEHENDI", "SANGEET", "SHAADI", "RECEPTION",
  "WELCOME", "PUJA", "COCKTAIL", "AFTERPARTY", "BRUNCH", "CUSTOM",
] as const;

/** Who gets invited when the function is created. */
const INVITE_MODES = ["none", "everyone", "copy", "bride", "groom", "vip"] as const;
type InviteMode = (typeof INVITE_MODES)[number];

const toneSchema = z
  .string()
  .refine((value) => (TONES as readonly string[]).includes(value), "Pick a colour.");

/**
 * End times are stored as minutes from midnight *of the event's own date* and
 * may exceed 1440 — an afterparty ending at 2 AM is 1560. The form sends the
 * already-resolved figure so the domain check and the write agree.
 */
const minuteSchema = z.coerce
  .number()
  .int("Choose a valid time.")
  .min(0, "Choose a valid time.")
  .max(2879, "Choose a valid time.");

const baseFields = {
  name: z.string().trim().min(1, "Give the function a name.").max(120),
  kind: z.enum(KINDS).default("CUSTOM"),
  date: civilDate,
  startMinute: minuteSchema,
  endMinute: minuteSchema,
  venueId: optionalId.optional(),
  /** Create the venue inline rather than making someone leave the form. */
  newVenueName: optionalString.optional(),
  newVenueCity: optionalString.optional(),
  dressCode: optionalString.optional(),
  description: optionalString.optional(),
  notes: optionalString.optional(),
  estimatedGuests: z.coerce
    .number()
    .int()
    .min(0, "Guest numbers can't be negative.")
    .max(100_000)
    .default(0),
  accentTone: toneSchema.default("saffron"),
  isPrivate: z.coerce.boolean().default(false),
};

const createSchema = z.object({
  ...baseFields,
  inviteMode: z.enum(INVITE_MODES).default("none"),
  /** Which event's list to copy, when `inviteMode` is "copy". */
  copyFromEventId: optionalId.optional(),
  /** Generate the planning tasks this kind of function needs. */
  generateTasks: z.coerce.boolean().default(true),
  /** Open a moodboard so there's somewhere for the first picture to go. */
  createMoodboard: z.coerce.boolean().default(true),
  /** Set once the family has read the warnings and meant it anyway. */
  acknowledged: z.coerce.boolean().default(false),
});

export async function createEvent(input: unknown) {
  return withAction("events.edit", async (viewer) => {
    const data = createSchema.parse(input);
    const snapshot = await fetchSnapshot(viewer.weddingId);

    // Resolve the venue first — a brand-new one has to exist before the checks
    // can say anything about its curfew or capacity.
    let venueId = data.venueId ?? null;
    let createdVenueName: string | null = null;
    if (!venueId && data.newVenueName) {
      const venue = await db.venue.create({
        data: {
          weddingId: viewer.weddingId,
          name: data.newVenueName,
          city: data.newVenueCity ?? null,
        },
        select: { id: true, name: true },
      });
      venueId = venue.id;
      createdVenueName = venue.name;
      snapshot.venues.push({
        id: venue.id, name: venue.name, city: data.newVenueCity ?? null,
        address: null, capacity: null, contactName: null, contactPhone: null,
        curfewMinute: null, alcoholAllowed: true, outsideCatering: true,
        hasRainBackup: false, hasPowerBackup: false, hasBridalRoom: false,
        parkingSpaces: null, notes: null,
      });
    }

    const draft = {
      name: data.name,
      kind: data.kind,
      date: data.date,
      startMinute: data.startMinute,
      endMinute: data.endMinute,
      venueId,
      estimatedGuests: data.estimatedGuests,
      isPrivate: data.isPrivate,
    };

    const checks = checkEventDraft(
      {
        weddingStart: snapshot.wedding.startDate,
        weddingEnd: snapshot.wedding.endDate,
        events: snapshot.events,
        venues: snapshot.venues,
      },
      draft,
    );
    if (hasBlockingError(checks)) {
      const blocker = checks.find((c) => c.severity === "error")!;
      throw new Error(
        blocker.detail ? `${blocker.message} ${blocker.detail}` : blocker.message,
      );
    }

    const slug = uniqueEventSlug(data.name, snapshot.events.map((e) => e.slug));

    const event = await db.event.create({
      data: {
        weddingId: viewer.weddingId,
        name: data.name,
        slug,
        kind: data.kind,
        date: data.date,
        startMinute: data.startMinute,
        endMinute: data.endMinute,
        venueId,
        sortOrder: nextSortOrder(snapshot.events),
        isPrivate: data.isPrivate,
        description: data.description ?? null,
        dressCode:
          data.dressCode ?? (EVENT_KIND_PRESETS[data.kind].dressCode || null),
        notes: data.notes ?? null,
        estimatedGuests: data.estimatedGuests,
        accentTone: data.accentTone,
      },
      select: { id: true, name: true, slug: true },
    });

    // ── Invitations ────────────────────────────────────────────────────────
    const invited = await inviteGuests(
      viewer.weddingId,
      event.id,
      data.inviteMode,
      data.copyFromEventId ?? null,
    );

    // ── The plan for this function ─────────────────────────────────────────
    let tasksCreated = 0;
    if (data.generateTasks) {
      const result = await generateMasterPlan(viewer.weddingId, {
        clampPastTo: snapshot.today,
      });
      tasksCreated = result.created;
    }

    if (data.createMoodboard) {
      await db.moodboard.create({
        data: {
          weddingId: viewer.weddingId,
          name: event.name,
          scope: "EVENT",
          eventId: event.id,
          sortOrder: nextSortOrder(snapshot.events),
        },
      });
    }

    const extras = [
      invited > 0 ? `${invited} guests invited` : null,
      tasksCreated > 0 ? `${tasksCreated} tasks generated` : null,
      createdVenueName ? `venue ${createdVenueName} added` : null,
    ].filter(Boolean);

    await logViewerActivity(viewer, {
      entityType: "event",
      entityId: event.id,
      entityLabel: event.name,
      action: "created",
      summary:
        `${viewer.name} added ${event.name} on ${formatLongDate(data.date)}, ` +
        `${formatMinute(data.startMinute)}–${formatMinute(data.endMinute)}` +
        (extras.length ? ` — ${extras.join(", ")}.` : "."),
      after: {
        name: event.name,
        kind: data.kind,
        date: toISODate(data.date),
        startMinute: data.startMinute,
        endMinute: data.endMinute,
        venueId,
      },
    });

    revalidateWedding();
    return {
      id: event.id,
      slug: event.slug,
      invited,
      tasksCreated,
      warnings: checks.filter((c) => c.severity !== "error"),
    };
  });
}

// ────────────────────────────────────────────────────────────────────── Update

const updateSchema = z.object({
  id: z.string().min(1),
  ...baseFields,
  name: baseFields.name.optional(),
  kind: z.enum(KINDS).optional(),
  date: civilDate.optional(),
  startMinute: minuteSchema.optional(),
  endMinute: minuteSchema.optional(),
  estimatedGuests: baseFields.estimatedGuests.optional(),
  accentTone: toneSchema.optional(),
  isPrivate: z.coerce.boolean().optional(),
  /** Carry the run of show with the event when its date or start time moves. */
  shiftRunOfShow: z.coerce.boolean().default(true),
});

export async function updateEvent(input: unknown) {
  return withAction("events.edit", async (viewer) => {
    const { id, shiftRunOfShow, newVenueName, newVenueCity, ...patch } =
      updateSchema.parse(input);

    const snapshot = await fetchSnapshot(viewer.weddingId);
    const existing = snapshot.events.find((e) => e.id === id);
    if (!existing) throw new Error("That function no longer exists.");

    let venueId = patch.venueId === undefined ? existing.venueId : patch.venueId;
    if (!venueId && newVenueName) {
      const venue = await db.venue.create({
        data: {
          weddingId: viewer.weddingId,
          name: newVenueName,
          city: newVenueCity ?? null,
        },
        select: { id: true },
      });
      venueId = venue.id;
    }

    const draft = {
      id,
      name: patch.name ?? existing.name,
      kind: patch.kind ?? existing.kind,
      date: patch.date ?? existing.date,
      startMinute: patch.startMinute ?? existing.startMinute,
      endMinute: patch.endMinute ?? existing.endMinute,
      venueId,
      estimatedGuests: patch.estimatedGuests ?? existing.estimatedGuests,
      isPrivate: patch.isPrivate ?? existing.isPrivate,
    };

    const checks = checkEventDraft(
      {
        weddingStart: snapshot.wedding.startDate,
        weddingEnd: snapshot.wedding.endDate,
        events: snapshot.events,
        venues: snapshot.venues,
      },
      draft,
    );
    if (hasBlockingError(checks)) {
      const blocker = checks.find((c) => c.severity === "error")!;
      throw new Error(
        blocker.detail ? `${blocker.message} ${blocker.detail}` : blocker.message,
      );
    }

    // Renaming re-slugs, but only when the slug would still be readable —
    // links people have already shared keep working otherwise.
    const nameChanged = draft.name !== existing.name;
    const slug = nameChanged
      ? uniqueEventSlug(
          draft.name,
          snapshot.events.filter((e) => e.id !== id).map((e) => e.slug),
        )
      : existing.slug;

    const dayDelta = Math.round(
      (draft.date.getTime() - existing.date.getTime()) / 86_400_000,
    );
    const minuteDelta = draft.startMinute - existing.startMinute;

    await db.event.update({
      where: { id },
      data: {
        name: draft.name,
        slug,
        kind: draft.kind,
        date: draft.date,
        startMinute: draft.startMinute,
        endMinute: draft.endMinute,
        venueId,
        isPrivate: draft.isPrivate,
        estimatedGuests: draft.estimatedGuests,
        accentTone: patch.accentTone ?? existing.accentTone,
        description:
          patch.description === undefined ? undefined : patch.description,
        dressCode: patch.dressCode === undefined ? undefined : patch.dressCode,
        notes: patch.notes === undefined ? undefined : patch.notes,
      },
    });

    // ── Carry the run of show ──────────────────────────────────────────────
    let moved = 0;
    if (shiftRunOfShow && (dayDelta !== 0 || minuteDelta !== 0)) {
      const entries = await db.timelineEntry.findMany({
        where: { eventId: id, archivedAt: null },
        select: { id: true, date: true, startMinute: true, endMinute: true, isLocked: true },
      });
      for (const entry of entries) {
        // Locked entries are locked for a reason — muhurat times, flights.
        if (entry.isLocked) continue;
        await db.timelineEntry.update({
          where: { id: entry.id },
          data: {
            date: new Date(entry.date.getTime() + dayDelta * 86_400_000),
            startMinute: entry.startMinute + minuteDelta,
            endMinute: entry.endMinute + minuteDelta,
          },
        });
        moved += 1;
      }
    }

    const changes: string[] = [];
    if (nameChanged) changes.push(`renamed it to ${draft.name}`);
    if (dayDelta !== 0) changes.push(`moved it to ${formatLongDate(draft.date)}`);
    if (minuteDelta !== 0 || draft.endMinute !== existing.endMinute) {
      changes.push(
        `re-timed it to ${formatMinute(draft.startMinute)}–${formatMinute(draft.endMinute)}`,
      );
    }
    if (venueId !== existing.venueId) {
      const venue = snapshot.venues.find((v) => v.id === venueId);
      changes.push(venue ? `moved it to ${venue.name}` : "removed its venue");
    }
    if (moved > 0) changes.push(`carrying ${moved} run-of-show entries with it`);

    await logViewerActivity(viewer, {
      entityType: "event",
      entityId: id,
      entityLabel: draft.name,
      action: "updated",
      summary: changes.length
        ? `${viewer.name} ${changes.join(", ")}.`
        : `${viewer.name} updated ${draft.name}.`,
      before: {
        name: existing.name,
        date: toISODate(existing.date),
        startMinute: existing.startMinute,
        endMinute: existing.endMinute,
        venueId: existing.venueId,
      },
      after: {
        name: draft.name,
        date: toISODate(draft.date),
        startMinute: draft.startMinute,
        endMinute: draft.endMinute,
        venueId,
      },
      undoable: true,
    });

    revalidateWedding();
    return {
      id,
      slug,
      entriesMoved: moved,
      warnings: checks.filter((c) => c.severity !== "error"),
    };
  });
}

// ───────────────────────────────────────────────────────────────────── Removal

/** What comes off with it — read before the confirmation is shown. */
export async function eventRemovalImpact(input: unknown) {
  return withAction("events.edit", async (viewer) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(input);

    const event = await db.event.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, name: true },
    });
    if (!event) throw new Error("That function no longer exists.");

    const [tasks, invitations, budgetItems, vendors, timelineEntries, outfits] =
      await Promise.all([
        db.task.count({ where: { eventId: id, archivedAt: null } }),
        db.eventInvitation.count({ where: { eventId: id } }),
        db.budgetItem.count({ where: { eventId: id, archivedAt: null } }),
        db.vendorEvent.count({ where: { eventId: id } }),
        db.timelineEntry.count({ where: { eventId: id, archivedAt: null } }),
        db.outfit.count({ where: { eventId: id, archivedAt: null } }),
      ]);

    const impact = { tasks, invitations, budgetItems, vendors, timelineEntries, outfits };
    return { name: event.name, impact, lines: describeRemoval(impact) };
  });
}

export async function archiveEvent(input: unknown) {
  return withAction("events.edit", async (viewer) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(input);

    const event = await db.event.findFirst({
      where: { id, weddingId: viewer.weddingId, archivedAt: null },
      select: { id: true, name: true, date: true },
    });
    if (!event) throw new Error("That function no longer exists.");

    const now = new Date();

    // One transaction: the event, the work attached to it, and the invitations
    // it issued all go together, so nobody is left holding an invitation to a
    // function that isn't happening.
    const [, tasks, entries, invitations] = await db.$transaction([
      db.event.update({ where: { id }, data: { archivedAt: now } }),
      db.task.updateMany({
        where: { eventId: id, archivedAt: null },
        data: { archivedAt: now },
      }),
      db.timelineEntry.updateMany({
        where: { eventId: id, archivedAt: null },
        data: { archivedAt: now },
      }),
      db.eventInvitation.deleteMany({ where: { eventId: id } }),
    ]);

    await logViewerActivity(viewer, {
      entityType: "event",
      entityId: id,
      entityLabel: event.name,
      action: "archived",
      summary:
        `${viewer.name} removed ${event.name} (${formatLongDate(event.date)}) — ` +
        `${tasks.count} tasks and ${entries.count} run-of-show entries archived with it, ` +
        `${invitations.count} invitations withdrawn.`,
      before: { name: event.name, date: toISODate(event.date) },
    });

    revalidateWedding();
    return { id, tasks: tasks.count, entries: entries.count };
  });
}

// ───────────────────────────────────────────────────────────────── Invitations

/**
 * Seed the guest list for a new function.
 *
 * Existing invitations are never touched — `skipDuplicates` means running this
 * twice doesn't reset anyone's RSVP.
 */
async function inviteGuests(
  weddingId: string,
  eventId: string,
  mode: InviteMode,
  copyFromEventId: string | null,
): Promise<number> {
  if (mode === "none") return 0;

  let guestIds: string[] = [];

  if (mode === "copy") {
    if (!copyFromEventId) return 0;
    const source = await db.eventInvitation.findMany({
      where: { eventId: copyFromEventId, status: { not: "NOT_INVITED" } },
      select: { guestId: true },
    });
    guestIds = source.map((i) => i.guestId);
  } else {
    const guests = await db.guest.findMany({
      where: {
        weddingId,
        archivedAt: null,
        ...(mode === "bride" ? { side: { in: ["BRIDE", "BOTH"] } } : {}),
        ...(mode === "groom" ? { side: { in: ["GROOM", "BOTH"] } } : {}),
        ...(mode === "vip" ? { isVIP: true } : {}),
      },
      select: { id: true },
    });
    guestIds = guests.map((g) => g.id);
  }

  if (guestIds.length === 0) return 0;

  const result = await db.eventInvitation.createMany({
    data: guestIds.map((guestId) => ({ guestId, eventId, status: "PENDING" as const })),
    skipDuplicates: true,
  });
  return result.count;
}

