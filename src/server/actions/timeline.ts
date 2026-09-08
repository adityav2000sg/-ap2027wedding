"use server";

/**
 * Run-of-show mutations.
 *
 * The run of show is the only part of the wedding measured in minutes, so the
 * rules are different here: entries can be locked (a muhurat does not move
 * because the photographer is late), they can depend on each other, and moving
 * one is allowed to move everything downstream of it.
 *
 * Every write returns the conflicts the change leaves behind — an overlap, a
 * vendor in two places, a venue curfew — because the honest answer to "can I
 * schedule this?" is usually "yes, and here's what it breaks".
 */

import { z } from "zod";

import { detectConflicts, snapshotEventVenues } from "@/domain/timeline";
import { formatMinute } from "@/lib/dates";
import { logViewerActivity } from "@/server/activity";
import { db } from "@/server/db";
import { fetchSnapshot } from "@/server/snapshot-query";
import {
  civilDate,
  optionalId,
  optionalString,
  revalidateWedding,
  withAction,
} from "./shared";

const STATUSES = [
  "PLANNED", "CONFIRMED", "IN_PROGRESS", "DONE", "DELAYED", "CANCELLED",
] as const;

/** Minutes from midnight of the entry's own date; may run past 1440. */
const minuteSchema = z.coerce
  .number()
  .int("Choose a valid time.")
  .min(0, "Choose a valid time.")
  .max(2879, "Choose a valid time.");

const createSchema = z.object({
  title: z.string().trim().min(1, "Give it a name.").max(160),
  eventId: optionalId.optional(),
  date: civilDate,
  startMinute: minuteSchema,
  endMinute: minuteSchema,
  location: optionalString.optional(),
  ownerId: optionalId.optional(),
  vendorId: optionalId.optional(),
  participants: z.array(z.string().trim().min(1)).max(30).default([]),
  notes: optionalString.optional(),
  status: z.enum(STATUSES).default("PLANNED"),
  isLocked: z.coerce.boolean().default(false),
});

export async function createTimelineEntry(input: unknown) {
  return withAction("timeline.edit", async (viewer) => {
    const data = createSchema.parse(input);

    if (data.endMinute <= data.startMinute) {
      throw new Error(
        "It has to end after it starts. Something running past midnight ends the next day — say 25:00 as 1:00 AM by ticking that on the event instead.",
      );
    }

    // Slot it after whatever already runs at that time, so the spine reads in
    // order without anyone dragging rows around.
    const siblings = await db.timelineEntry.findMany({
      where: { weddingId: viewer.weddingId, date: data.date, archivedAt: null },
      select: { sortOrder: true },
    });
    const sortOrder = siblings.reduce((max, e) => Math.max(max, e.sortOrder), 0) + 10;

    const entry = await db.timelineEntry.create({
      data: {
        weddingId: viewer.weddingId,
        eventId: data.eventId ?? null,
        title: data.title,
        date: data.date,
        startMinute: data.startMinute,
        endMinute: data.endMinute,
        location: data.location ?? null,
        ownerId: data.ownerId ?? null,
        vendorId: data.vendorId ?? null,
        participants: data.participants,
        notes: data.notes ?? null,
        status: data.status,
        isLocked: data.isLocked,
        sortOrder,
      },
      select: { id: true, title: true },
    });

    await logViewerActivity(viewer, {
      entityType: "timeline",
      entityId: entry.id,
      entityLabel: entry.title,
      action: "created",
      summary: `${viewer.name} added “${entry.title}” at ${formatMinute(data.startMinute)} to the run of show.`,
      after: { title: entry.title, startMinute: data.startMinute, endMinute: data.endMinute },
    });

    revalidateWedding();
    return { id: entry.id, conflicts: await conflictsFor(viewer.weddingId, entry.id) };
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(160).optional(),
  eventId: optionalId.optional(),
  date: civilDate.optional(),
  startMinute: minuteSchema.optional(),
  endMinute: minuteSchema.optional(),
  location: optionalString.optional(),
  ownerId: optionalId.optional(),
  vendorId: optionalId.optional(),
  participants: z.array(z.string().trim().min(1)).max(30).optional(),
  notes: optionalString.optional(),
  status: z.enum(STATUSES).optional(),
  isLocked: z.coerce.boolean().optional(),
});

export async function updateTimelineEntry(input: unknown) {
  return withAction("timeline.edit", async (viewer) => {
    const { id, ...patch } = updateSchema.parse(input);

    const existing = await db.timelineEntry.findFirst({
      where: { id, weddingId: viewer.weddingId, archivedAt: null },
    });
    if (!existing) throw new Error("That run-of-show entry no longer exists.");

    const startMinute = patch.startMinute ?? existing.startMinute;
    const endMinute = patch.endMinute ?? existing.endMinute;
    if (endMinute <= startMinute) {
      throw new Error("It has to end after it starts.");
    }

    await db.timelineEntry.update({
      where: { id },
      data: {
        title: patch.title,
        eventId: patch.eventId === undefined ? undefined : patch.eventId,
        date: patch.date,
        startMinute: patch.startMinute,
        endMinute: patch.endMinute,
        location: patch.location === undefined ? undefined : patch.location,
        ownerId: patch.ownerId === undefined ? undefined : patch.ownerId,
        vendorId: patch.vendorId === undefined ? undefined : patch.vendorId,
        participants: patch.participants,
        notes: patch.notes === undefined ? undefined : patch.notes,
        status: patch.status,
        isLocked: patch.isLocked,
      },
    });

    const moved = startMinute - existing.startMinute;
    await logViewerActivity(viewer, {
      entityType: "timeline",
      entityId: id,
      entityLabel: patch.title ?? existing.title,
      action: "updated",
      summary:
        moved !== 0
          ? `${viewer.name} moved “${existing.title}” ${Math.abs(moved)} min ${
              moved > 0 ? "later" : "earlier"
            }, to ${formatMinute(startMinute)}.`
          : `${viewer.name} updated “${patch.title ?? existing.title}” in the run of show.`,
      before: { startMinute: existing.startMinute, endMinute: existing.endMinute, status: existing.status },
      after: { startMinute, endMinute, status: patch.status ?? existing.status },
      undoable: true,
    });

    revalidateWedding();
    return { id, conflicts: await conflictsFor(viewer.weddingId, id) };
  });
}

export async function archiveTimelineEntry(input: unknown) {
  return withAction("timeline.edit", async (viewer) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(input);

    const entry = await db.timelineEntry.findFirst({
      where: { id, weddingId: viewer.weddingId, archivedAt: null },
      select: { id: true, title: true, isLocked: true },
    });
    if (!entry) throw new Error("That run-of-show entry no longer exists.");
    if (entry.isLocked) {
      throw new Error(
        `“${entry.title}” is locked. Unlock it first — locking exists so fixed times don't get removed by accident.`,
      );
    }

    await db.timelineEntry.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    await logViewerActivity(viewer, {
      entityType: "timeline",
      entityId: id,
      entityLabel: entry.title,
      action: "archived",
      summary: `${viewer.name} removed “${entry.title}” from the run of show.`,
    });

    revalidateWedding();
    return { id };
  });
}

/**
 * Conflicts the current schedule contains, narrowed to one entry.
 *
 * Runs the same engine the Timeline page renders, so a warning shown after a
 * save is the identical warning the page will show on the next load.
 */
async function conflictsFor(weddingId: string, entryId: string) {
  const snapshot = await fetchSnapshot(weddingId);
  return detectConflicts(snapshot.timeline, snapshot.timelineDeps, {
    vendors: snapshot.vendors,
    venues: snapshot.venues,
    eventVenue: snapshotEventVenues(snapshot),
  })
    .filter((conflict) => conflict.entryIds.includes(entryId))
    .map((conflict) => ({
      key: conflict.key,
      severity: conflict.severity,
      title: conflict.title,
      detail: conflict.detail,
    }));
}
