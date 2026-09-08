"use server";

/**
 * Rooms, travel and who's handling what.
 *
 * This is the part of the app that was readable and nothing else: the room
 * plan, the flight list and the responsibility board all came in from the
 * spreadsheet and then couldn't be touched. These are the writes.
 *
 * Responsibilities are the important half. "Nobody's name is against this" is
 * one of the alerts the readiness engine raises, and until now it was an alert
 * with no way to act on it.
 */

import { z } from "zod";

import { logViewerActivity } from "@/server/activity";
import { db } from "@/server/db";
import {
  optionalCivilDate,
  optionalId,
  optionalString,
  revalidateWedding,
  withAction,
} from "./shared";

const RESPONSIBILITY_STATUS = [
  "UNASSIGNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "DONE",
] as const;

// ───────────────────────────────────────────────── Who's handling what

const responsibilitySchema = z.object({
  title: z.string().trim().min(1, "Say what needs handling.").max(200),
  area: z.string().trim().min(1, "Which area is this?").max(60),
  ownerId: optionalId.optional(),
  backupId: optionalId.optional(),
  eventId: optionalId.optional(),
  dueDate: optionalCivilDate.optional(),
  importance: z.coerce.number().int().min(1).max(5).default(3),
  notes: optionalString.optional(),
});

export async function createResponsibility(input: unknown) {
  return withAction("logistics.edit", async (viewer) => {
    const data = responsibilitySchema.parse(input);

    const created = await db.responsibility.create({
      data: {
        weddingId: viewer.weddingId,
        ...data,
        ownerId: data.ownerId ?? null,
        backupId: data.backupId ?? null,
        eventId: data.eventId ?? null,
        dueDate: data.dueDate ?? null,
        notes: data.notes ?? null,
        // Status follows from whether anyone owns it, rather than being a
        // separate thing to remember to set.
        status: data.ownerId ? "ASSIGNED" : "UNASSIGNED",
      },
      select: { id: true, title: true },
    });

    await logViewerActivity(viewer, {
      entityType: "responsibility",
      entityId: created.id,
      entityLabel: created.title,
      action: "created",
      summary: `${viewer.name} added “${created.title}” to who's handling what.`,
      after: { area: data.area },
    });

    revalidateWedding();
    return { id: created.id };
  });
}

const responsibilityUpdateSchema = responsibilitySchema.partial().extend({
  id: z.string().min(1),
  status: z.enum(RESPONSIBILITY_STATUS).optional(),
});

export async function updateResponsibility(input: unknown) {
  return withAction("logistics.edit", async (viewer) => {
    const { id, ...patch } = responsibilityUpdateSchema.parse(input);

    const existing = await db.responsibility.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, title: true, ownerId: true, status: true },
    });
    if (!existing) throw new Error("That responsibility no longer exists.");

    // Assigning somebody moves it off unassigned; taking the owner away moves
    // it back. Any status set explicitly wins over both.
    const derivedStatus =
      patch.status ??
      (patch.ownerId === undefined
        ? undefined
        : patch.ownerId
          ? existing.status === "UNASSIGNED"
            ? "ASSIGNED"
            : existing.status
          : "UNASSIGNED");

    const updated = await db.responsibility.update({
      where: { id },
      data: { ...patch, ...(derivedStatus ? { status: derivedStatus } : {}) },
      select: { id: true, title: true, ownerId: true },
    });

    if (patch.ownerId !== undefined && patch.ownerId !== existing.ownerId) {
      const owner = updated.ownerId
        ? await db.weddingMember.findUnique({
            where: { id: updated.ownerId },
            include: { user: { select: { name: true } } },
          })
        : null;

      await logViewerActivity(viewer, {
        entityType: "responsibility",
        entityId: updated.id,
        entityLabel: updated.title,
        action: "updated",
        summary: owner
          ? `${viewer.name} put ${owner.user.name} on “${updated.title}”.`
          : `${viewer.name} took the owner off “${updated.title}”.`,
        before: { ownerId: existing.ownerId },
        after: { ownerId: updated.ownerId },
        undoable: true,
      });
    }

    revalidateWedding();
    return { id: updated.id };
  });
}

export async function deleteResponsibility(id: string) {
  return withAction("logistics.edit", async (viewer) => {
    const existing = await db.responsibility.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, title: true },
    });
    if (!existing) throw new Error("That responsibility no longer exists.");

    await db.responsibility.delete({ where: { id } });

    await logViewerActivity(viewer, {
      entityType: "responsibility",
      entityId: existing.id,
      entityLabel: existing.title,
      action: "deleted",
      summary: `${viewer.name} removed “${existing.title}”.`,
    });

    revalidateWedding();
    return { id };
  });
}

// ───────────────────────────────────────────────────────────── Rooms

/**
 * Put a guest in a room, or take them out of one.
 *
 * A stay is created on demand: assigning somebody who has no stay yet is the
 * common case, and making the user create an empty stay first would be a step
 * that exists only because of how the tables are shaped.
 */
export async function setGuestRoom(
  guestId: string,
  roomNumber: string | null,
  hotelId?: string,
) {
  return withAction("logistics.edit", async (viewer) => {
    const guest = await db.guest.findFirst({
      where: { id: guestId, weddingId: viewer.weddingId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!guest) throw new Error("That guest no longer exists.");

    const room = roomNumber?.trim() || null;
    const existing = await db.stay.findFirst({
      where: { guestId, weddingId: viewer.weddingId },
      select: { id: true, roomNumber: true, hotelId: true },
    });

    if (!room) {
      if (existing) await db.stay.delete({ where: { id: existing.id } });
    } else if (existing) {
      await db.stay.update({
        where: { id: existing.id },
        data: { roomNumber: room, ...(hotelId ? { hotelId } : {}) },
      });
    } else {
      // A new stay needs a hotel and dates; fall back to the first hotel and
      // the wedding's own dates rather than refusing.
      const hotel = hotelId
        ? await db.hotel.findFirst({ where: { id: hotelId, weddingId: viewer.weddingId } })
        : await db.hotel.findFirst({ where: { weddingId: viewer.weddingId } });
      if (!hotel) throw new Error("Add a hotel before allocating rooms.");

      const wedding = await db.wedding.findUnique({
        where: { id: viewer.weddingId },
        select: { startDate: true, endDate: true },
      });
      if (!wedding) throw new Error("That wedding no longer exists.");

      await db.stay.create({
        data: {
          weddingId: viewer.weddingId,
          guestId,
          hotelId: hotel.id,
          roomNumber: room,
          checkIn: wedding.startDate,
          checkOut: wedding.endDate,
        },
      });
    }

    const name = `${guest.firstName} ${guest.lastName}`.trim();
    await logViewerActivity(viewer, {
      entityType: "guest",
      entityId: guest.id,
      entityLabel: name,
      action: "updated",
      summary: room
        ? `${viewer.name} put ${name} in room ${room}.`
        : `${viewer.name} took ${name} out of room ${existing?.roomNumber ?? "—"}.`,
      before: { roomNumber: existing?.roomNumber ?? null },
      after: { roomNumber: room },
      undoable: true,
    });

    revalidateWedding();
    return { id: guest.id, roomNumber: room };
  });
}

// ──────────────────────────────────────────────────────────── Travel

const TRAVEL_MODES = ["FLIGHT", "TRAIN", "CAR", "BUS"] as const;
const TRAVEL_DIRECTIONS = ["ARRIVAL", "DEPARTURE"] as const;

const travelSchema = z.object({
  guestId: z.string().min(1, "Whose journey is this?"),
  direction: z.enum(TRAVEL_DIRECTIONS),
  mode: z.enum(TRAVEL_MODES).default("FLIGHT"),
  carrier: optionalString.optional(),
  serviceNumber: optionalString.optional(),
  hub: optionalString.optional(),
  scheduledAt: z.string().min(1, "When?"),
  pickupRequired: z.coerce.boolean().default(false),
});

export async function createTravel(input: unknown) {
  return withAction("logistics.edit", async (viewer) => {
    const data = travelSchema.parse(input);

    const guest = await db.guest.findFirst({
      where: { id: data.guestId, weddingId: viewer.weddingId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!guest) throw new Error("That guest no longer exists.");

    const created = await db.travelRecord.create({
      data: {
        weddingId: viewer.weddingId,
        ...data,
        carrier: data.carrier ?? null,
        serviceNumber: data.serviceNumber ?? null,
        hub: data.hub ?? null,
        scheduledAt: new Date(data.scheduledAt),
      },
      select: { id: true },
    });

    const name = `${guest.firstName} ${guest.lastName}`.trim();
    await logViewerActivity(viewer, {
      entityType: "travel",
      entityId: created.id,
      entityLabel: name,
      action: "created",
      summary: `${viewer.name} added ${name}'s ${data.direction === "ARRIVAL" ? "arrival" : "departure"}.`,
    });

    revalidateWedding();
    return { id: created.id };
  });
}

export async function updateTravel(input: unknown) {
  return withAction("logistics.edit", async (viewer) => {
    // guestId is deliberately not updatable: a journey belongs to the person it
    // was created for. Moving one to somebody else is deleting and re-adding.
    const { id, guestId: _guestId, ...patch } = travelSchema
      .partial()
      .extend({ id: z.string().min(1) })
      .parse(input);

    const existing = await db.travelRecord.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true },
    });
    if (!existing) throw new Error("That journey no longer exists.");

    await db.travelRecord.update({
      where: { id },
      data: {
        ...patch,
        ...(patch.scheduledAt ? { scheduledAt: new Date(patch.scheduledAt) } : {}),
      },
    });

    revalidateWedding();
    return { id };
  });
}

export async function deleteTravel(id: string) {
  return withAction("logistics.edit", async (viewer) => {
    const existing = await db.travelRecord.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true },
    });
    if (!existing) throw new Error("That journey no longer exists.");

    await db.travelRecord.delete({ where: { id } });
    revalidateWedding();
    return { id };
  });
}
