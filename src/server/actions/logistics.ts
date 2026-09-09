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
  civilDate,
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

// ────────────────────────────────────────────────────────────── Transport

/**
 * Vehicles and journeys.
 *
 * The transport tab could show a plan and not make one: journeys came in from
 * the spreadsheet, and an unassigned airport pickup could be seen but never
 * acted on. These are the writes for it — a coach, a run, and who is on it.
 */

const VEHICLE_TYPES = ["Sedan", "SUV", "Van", "Minibus", "Coach", "Boat"] as const;

const vehicleSchema = z.object({
  label: z.string().trim().min(1, "Give the vehicle a name.").max(120),
  vehicleType: z.enum(VEHICLE_TYPES).default("Van"),
  capacity: z.coerce.number().int().min(1, "How many does it seat?").max(200),
  driverName: optionalString.optional(),
  driverPhone: optionalString.optional(),
  notes: optionalString.optional(),
});

export async function createVehicle(input: unknown) {
  return withAction("logistics.edit", async (viewer) => {
    const data = vehicleSchema.parse(input);

    const vehicle = await db.transportVehicle.create({
      data: {
        weddingId: viewer.weddingId,
        label: data.label,
        vehicleType: data.vehicleType,
        capacity: data.capacity,
        driverName: data.driverName ?? null,
        driverPhone: data.driverPhone ?? null,
        notes: data.notes ?? null,
      },
      select: { id: true, label: true },
    });

    await logViewerActivity(viewer, {
      entityType: "vehicle",
      entityId: vehicle.id,
      entityLabel: vehicle.label,
      action: "created",
      summary: `${viewer.name} added ${vehicle.label} (${data.capacity} seats) to the transport plan.`,
    });

    revalidateWedding();
    return { id: vehicle.id };
  });
}

export async function updateVehicle(input: unknown) {
  return withAction("logistics.edit", async (viewer) => {
    const { id, ...patch } = vehicleSchema
      .partial()
      .extend({ id: z.string().min(1) })
      .parse(input);

    const existing = await db.transportVehicle.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, label: true },
    });
    if (!existing) throw new Error("That vehicle no longer exists.");

    await db.transportVehicle.update({ where: { id }, data: patch });

    await logViewerActivity(viewer, {
      entityType: "vehicle",
      entityId: id,
      entityLabel: patch.label ?? existing.label,
      action: "updated",
      summary: `${viewer.name} updated ${patch.label ?? existing.label}.`,
      undoable: true,
    });

    revalidateWedding();
    return { id };
  });
}

export async function archiveVehicle(id: string) {
  return withAction("logistics.edit", async (viewer) => {
    const existing = await db.transportVehicle.findFirst({
      where: { id, weddingId: viewer.weddingId, archivedAt: null },
      select: { id: true, label: true },
    });
    if (!existing) throw new Error("That vehicle no longer exists.");

    // Journeys keep their history; the vehicle simply comes off the fleet.
    await db.transportVehicle.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    await logViewerActivity(viewer, {
      entityType: "vehicle",
      entityId: id,
      entityLabel: existing.label,
      action: "archived",
      summary: `${viewer.name} took ${existing.label} off the transport plan.`,
    });

    revalidateWedding();
    return { id };
  });
}

const journeySchema = z.object({
  purpose: z.string().trim().min(1, "What is this run for?").max(160),
  date: civilDate,
  startMinute: z.coerce.number().int().min(0).max(2879),
  endMinute: z.coerce.number().int().min(0).max(2879),
  vehicleId: optionalId.optional(),
  eventId: optionalId.optional(),
  fromLocation: optionalString.optional(),
  toLocation: optionalString.optional(),
  notes: optionalString.optional(),
  /** Who is on it. Replaces the list outright rather than merging. */
  passengerIds: z.array(z.string().min(1)).max(200).default([]),
});

/** Only this wedding's guests may be put on one of its journeys. */
async function ownPassengers(weddingId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const guests = await db.guest.findMany({
    where: { id: { in: ids }, weddingId, archivedAt: null },
    select: { id: true },
  });
  return guests.map((guest) => guest.id);
}

export async function createJourney(input: unknown) {
  return withAction("logistics.edit", async (viewer) => {
    const data = journeySchema.parse(input);
    const passengers = await ownPassengers(viewer.weddingId, data.passengerIds);

    const journey = await db.transportJourney.create({
      data: {
        weddingId: viewer.weddingId,
        purpose: data.purpose,
        date: data.date,
        startMinute: data.startMinute,
        endMinute: data.endMinute,
        vehicleId: data.vehicleId ?? null,
        eventId: data.eventId ?? null,
        fromLocation: data.fromLocation ?? null,
        toLocation: data.toLocation ?? null,
        notes: data.notes ?? null,
        passengers: { create: passengers.map((guestId) => ({ guestId })) },
      },
      select: { id: true, purpose: true },
    });

    await logViewerActivity(viewer, {
      entityType: "journey",
      entityId: journey.id,
      entityLabel: journey.purpose,
      action: "created",
      summary: `${viewer.name} planned “${journey.purpose}”${
        passengers.length > 0 ? ` for ${passengers.length} people` : ""
      }.`,
    });

    revalidateWedding();
    return { id: journey.id };
  });
}

export async function updateJourney(input: unknown) {
  return withAction("logistics.edit", async (viewer) => {
    const { id, passengerIds, ...patch } = journeySchema
      .partial()
      .extend({ id: z.string().min(1) })
      .parse(input);

    const existing = await db.transportJourney.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, purpose: true },
    });
    if (!existing) throw new Error("That journey no longer exists.");

    await db.$transaction(async (tx) => {
      await tx.transportJourney.update({
        where: { id },
        data: {
          ...patch,
          ...(patch.vehicleId !== undefined ? { vehicleId: patch.vehicleId ?? null } : {}),
          ...(patch.eventId !== undefined ? { eventId: patch.eventId ?? null } : {}),
        },
      });

      // Absent means "leave the passengers alone"; an empty array means "empty
      // it". They are different requests and must not collapse into one.
      if (passengerIds !== undefined) {
        const passengers = await ownPassengers(viewer.weddingId, passengerIds);
        await tx.journeyPassenger.deleteMany({ where: { journeyId: id } });
        if (passengers.length > 0) {
          await tx.journeyPassenger.createMany({
            data: passengers.map((guestId) => ({ journeyId: id, guestId })),
          });
        }
      }
    });

    await logViewerActivity(viewer, {
      entityType: "journey",
      entityId: id,
      entityLabel: patch.purpose ?? existing.purpose,
      action: "updated",
      summary: `${viewer.name} updated “${patch.purpose ?? existing.purpose}”.`,
      undoable: true,
    });

    revalidateWedding();
    return { id };
  });
}

export async function deleteJourney(id: string) {
  return withAction("logistics.edit", async (viewer) => {
    const existing = await db.transportJourney.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, purpose: true },
    });
    if (!existing) throw new Error("That journey no longer exists.");

    // Anybody whose pickup was on this run goes back to needing one, rather
    // than silently keeping a link to something that no longer exists.
    await db.$transaction(async (tx) => {
      await tx.travelRecord.updateMany({
        where: { journeyId: id },
        data: { journeyId: null },
      });
      await tx.transportJourney.delete({ where: { id } });
    });

    await logViewerActivity(viewer, {
      entityType: "journey",
      entityId: id,
      entityLabel: existing.purpose,
      action: "deleted",
      summary: `${viewer.name} removed the journey “${existing.purpose}”.`,
    });

    revalidateWedding();
    return { id };
  });
}

/** Put somebody's arrival on a run, or take it off one. */
export async function setTravelJourney(travelId: string, journeyId: string | null) {
  return withAction("logistics.edit", async (viewer) => {
    const record = await db.travelRecord.findFirst({
      where: { id: travelId, weddingId: viewer.weddingId },
      select: { id: true, guest: { select: { firstName: true, lastName: true } } },
    });
    if (!record) throw new Error("That arrival no longer exists.");

    if (journeyId) {
      const journey = await db.transportJourney.findFirst({
        where: { id: journeyId, weddingId: viewer.weddingId },
        select: { id: true },
      });
      if (!journey) throw new Error("That journey no longer exists.");
    }

    await db.travelRecord.update({
      where: { id: travelId },
      data: { journeyId },
    });

    const name = `${record.guest.firstName} ${record.guest.lastName}`.trim();
    await logViewerActivity(viewer, {
      entityType: "travel",
      entityId: travelId,
      entityLabel: name,
      action: "updated",
      summary: journeyId
        ? `${viewer.name} put ${name}'s pickup on a journey.`
        : `${viewer.name} took ${name}'s pickup off its journey.`,
    });

    revalidateWedding();
    return { id: travelId };
  });
}
