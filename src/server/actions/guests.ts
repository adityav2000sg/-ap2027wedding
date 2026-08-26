"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

import { analyseChange } from "@/domain/impact";
import { logViewerActivity } from "@/server/activity";
import { db } from "@/server/db";
import { fetchSnapshot } from "@/server/snapshot-query";
import { optionalId, optionalString, revalidateWedding, withAction } from "./shared";

const SIDES = ["BRIDE", "GROOM", "BOTH"] as const;
const DIETS = ["NON_VEGETARIAN", "VEGETARIAN", "JAIN", "VEGAN", "NOT_SPECIFIED"] as const;
const RSVP = ["NOT_INVITED", "PENDING", "CONFIRMED", "DECLINED", "TENTATIVE"] as const;

/** Unguessable and never derived from an internal id. */
function newRsvpToken(): string {
  return randomUUID().replace(/-/g, "") + randomBytes(6).toString("hex");
}

const guestSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().max(80).default(""),
  side: z.enum(SIDES).default("BOTH"),
  relationship: optionalString.optional(),
  phone: optionalString.optional(),
  email: optionalString.optional(),
  city: optionalString.optional(),
  country: z.string().trim().default("India"),
  householdId: optionalId.optional(),
  /** Creates a household on the fly when the user types a new name. */
  newHouseholdName: optionalString.optional(),
  isVIP: z.coerce.boolean().default(false),
  isChild: z.coerce.boolean().default(false),
  isSenior: z.coerce.boolean().default(false),
  dietary: z.enum(DIETS).default("NOT_SPECIFIED"),
  allergies: optionalString.optional(),
  accessibilityNeeds: optionalString.optional(),
  needsAccommodation: z.coerce.boolean().default(false),
  needsTransport: z.coerce.boolean().default(false),
  notes: optionalString.optional(),
  /** Events to invite them to immediately. */
  inviteToEventIds: z.array(z.string()).default([]),
});

export async function createGuest(input: unknown) {
  return withAction("guests.edit", async (viewer) => {
    const data = guestSchema.parse(input);

    const guest = await db.$transaction(async (tx) => {
      let householdId = data.householdId ?? null;

      if (!householdId && data.newHouseholdName) {
        const household = await tx.household.create({
          data: {
            weddingId: viewer.weddingId,
            name: data.newHouseholdName,
            side: data.side,
            city: data.city ?? null,
            country: data.country,
            rsvpToken: newRsvpToken(),
          },
          select: { id: true },
        });
        householdId = household.id;
      }

      const created = await tx.guest.create({
        data: {
          weddingId: viewer.weddingId,
          householdId,
          firstName: data.firstName,
          lastName: data.lastName,
          side: data.side,
          relationship: data.relationship ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          city: data.city ?? null,
          country: data.country,
          isVIP: data.isVIP,
          isChild: data.isChild,
          isSenior: data.isSenior,
          dietary: data.dietary,
          allergies: data.allergies ?? null,
          accessibilityNeeds: data.accessibilityNeeds ?? null,
          needsAccommodation: data.needsAccommodation,
          needsTransport: data.needsTransport,
          notes: data.notes ?? null,
        },
        select: { id: true, firstName: true, lastName: true },
      });

      // Every guest gets a row per event so the RSVP grid is always complete.
      const events = await tx.event.findMany({
        where: { weddingId: viewer.weddingId, archivedAt: null },
        select: { id: true },
      });
      await tx.eventInvitation.createMany({
        data: events.map((event) => ({
          guestId: created.id,
          eventId: event.id,
          status: data.inviteToEventIds.includes(event.id)
            ? ("PENDING" as const)
            : ("NOT_INVITED" as const),
        })),
        skipDuplicates: true,
      });

      return created;
    });

    const name = `${guest.firstName} ${guest.lastName}`.trim();
    await logViewerActivity(viewer, {
      entityType: "guest",
      entityId: guest.id,
      entityLabel: name,
      action: "created",
      summary: `${viewer.name} added ${name} to the guest list.`,
    });

    revalidateWedding();
    return { id: guest.id, name };
  });
}

const updateGuestSchema = guestSchema
  .partial()
  .extend({ id: z.string().min(1) })
  .omit({ inviteToEventIds: true, newHouseholdName: true });

export async function updateGuest(input: unknown) {
  return withAction("guests.edit", async (viewer) => {
    const { id, ...patch } = updateGuestSchema.parse(input);

    const existing = await db.guest.findFirst({
      where: { id, weddingId: viewer.weddingId },
    });
    if (!existing) throw new Error("That guest no longer exists.");

    const updated = await db.guest.update({
      where: { id },
      data: patch,
      select: { id: true, firstName: true, lastName: true, needsAccommodation: true },
    });

    const name = `${updated.firstName} ${updated.lastName}`.trim();
    let summary = `${viewer.name} updated ${name}'s details.`;

    // Accommodation changes move the room forecast, so say so explicitly.
    if (
      patch.needsAccommodation !== undefined &&
      patch.needsAccommodation !== existing.needsAccommodation
    ) {
      summary = patch.needsAccommodation
        ? `${viewer.name} marked ${name} as needing a room.`
        : `${viewer.name} marked ${name} as no longer needing a room.`;
    }

    await logViewerActivity(viewer, {
      entityType: "guest",
      entityId: updated.id,
      entityLabel: name,
      action: "updated",
      summary,
      after: patch as Record<string, unknown>,
      undoable: true,
    });

    revalidateWedding();
    return { id: updated.id };
  });
}

export async function archiveGuest(id: string) {
  return withAction("guests.edit", async (viewer) => {
    const guest = await db.guest.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!guest) throw new Error("That guest no longer exists.");

    await db.guest.update({ where: { id }, data: { archivedAt: new Date() } });

    const name = `${guest.firstName} ${guest.lastName}`.trim();
    await logViewerActivity(viewer, {
      entityType: "guest",
      entityId: guest.id,
      entityLabel: name,
      action: "archived",
      summary: `${viewer.name} removed ${name} from the guest list.`,
      undoable: true,
    });

    revalidateWedding();
    return { id: guest.id };
  });
}

// ────────────────────────────────────────────────────────────────────── RSVP

const rsvpSchema = z.object({
  guestId: z.string().min(1),
  eventId: z.string().min(1),
  status: z.enum(RSVP),
});

export async function setRsvp(input: unknown) {
  return withAction("guests.edit", async (viewer) => {
    const data = rsvpSchema.parse(input);

    const [guest, event] = await Promise.all([
      db.guest.findFirst({
        where: { id: data.guestId, weddingId: viewer.weddingId },
        select: { id: true, firstName: true, lastName: true },
      }),
      db.event.findFirst({
        where: { id: data.eventId, weddingId: viewer.weddingId },
        select: { id: true, name: true },
      }),
    ]);
    if (!guest || !event) throw new Error("That guest or event no longer exists.");

    const previous = await db.eventInvitation.findUnique({
      where: { guestId_eventId: { guestId: data.guestId, eventId: data.eventId } },
      select: { status: true },
    });

    await db.eventInvitation.upsert({
      where: { guestId_eventId: { guestId: data.guestId, eventId: data.eventId } },
      create: {
        guestId: data.guestId,
        eventId: data.eventId,
        status: data.status,
        respondedAt: isAnswer(data.status) ? new Date() : null,
      },
      update: {
        status: data.status,
        respondedAt: isAnswer(data.status) ? new Date() : null,
      },
    });

    const name = `${guest.firstName} ${guest.lastName}`.trim();
    await logViewerActivity(viewer, {
      entityType: "guest",
      entityId: guest.id,
      entityLabel: name,
      action: "rsvp_changed",
      summary: `${viewer.name} recorded ${name} as ${RSVP_TEXT[data.status].toLowerCase()} for the ${event.name}.`,
      before: { status: previous?.status ?? null },
      after: { status: data.status },
      undoable: true,
    });

    revalidateWedding();
    return { guestId: data.guestId, eventId: data.eventId, status: data.status };
  });
}

/**
 * What would this RSVP change actually do? Called before committing a bulk
 * change so the user sees the catering consequence first.
 */
export async function previewRsvpChange(input: unknown) {
  return withAction("guests.edit", async (viewer) => {
    const data = rsvpSchema.parse(input);
    const snapshot = await fetchSnapshot(viewer.weddingId);
    return analyseChange(snapshot, {
      type: "guest.rsvp",
      guestId: data.guestId,
      eventId: data.eventId,
      status: data.status,
    });
  });
}

const bulkInviteSchema = z.object({
  guestIds: z.array(z.string().min(1)).min(1, "Select at least one guest."),
  eventId: z.string().min(1),
  status: z.enum(RSVP),
});

export async function bulkSetRsvp(input: unknown) {
  return withAction("guests.edit", async (viewer) => {
    const data = bulkInviteSchema.parse(input);

    const event = await db.event.findFirst({
      where: { id: data.eventId, weddingId: viewer.weddingId },
      select: { id: true, name: true },
    });
    if (!event) throw new Error("That event no longer exists.");

    const guests = await db.guest.findMany({
      where: { id: { in: data.guestIds }, weddingId: viewer.weddingId },
      select: { id: true },
    });

    await db.$transaction(
      guests.map((guest) =>
        db.eventInvitation.upsert({
          where: { guestId_eventId: { guestId: guest.id, eventId: event.id } },
          create: {
            guestId: guest.id,
            eventId: event.id,
            status: data.status,
            respondedAt: isAnswer(data.status) ? new Date() : null,
          },
          update: {
            status: data.status,
            respondedAt: isAnswer(data.status) ? new Date() : null,
          },
        }),
      ),
    );

    await logViewerActivity(viewer, {
      entityType: "guest",
      action: "bulk_rsvp",
      summary: `${viewer.name} set ${guests.length} ${guests.length === 1 ? "guest" : "guests"} to ${RSVP_TEXT[data.status].toLowerCase()} for the ${event.name}.`,
    });

    revalidateWedding();
    return { count: guests.length };
  });
}

// ───────────────────────────────────────────────────────────────── Households

const householdSchema = z.object({
  name: z.string().trim().min(1, "Give the household a name.").max(120),
  side: z.enum(SIDES).default("BOTH"),
  relationship: optionalString.optional(),
  city: optionalString.optional(),
  country: z.string().trim().default("India"),
  notes: optionalString.optional(),
});

export async function createHousehold(input: unknown) {
  return withAction("guests.edit", async (viewer) => {
    const data = householdSchema.parse(input);

    const household = await db.household.create({
      data: {
        weddingId: viewer.weddingId,
        name: data.name,
        side: data.side,
        relationship: data.relationship ?? null,
        city: data.city ?? null,
        country: data.country,
        notes: data.notes ?? null,
        rsvpToken: newRsvpToken(),
      },
      select: { id: true, name: true },
    });

    await logViewerActivity(viewer, {
      entityType: "household",
      entityId: household.id,
      entityLabel: household.name,
      action: "created",
      summary: `${viewer.name} added the ${household.name} household.`,
    });

    revalidateWedding();
    return { id: household.id, name: household.name };
  });
}

const INVITATION_STATUS = ["NOT_CONTACTED", "SAVE_THE_DATE_SENT", "INVITED", "DELIVERED"] as const;

export async function setHouseholdInvitationStatus(
  householdId: string,
  status: (typeof INVITATION_STATUS)[number],
) {
  return withAction("guests.edit", async (viewer) => {
    z.enum(INVITATION_STATUS).parse(status);

    const household = await db.household.findFirst({
      where: { id: householdId, weddingId: viewer.weddingId },
      select: { id: true, name: true, invitationStatus: true },
    });
    if (!household) throw new Error("That household no longer exists.");

    await db.household.update({
      where: { id: householdId },
      data: {
        invitationStatus: status,
        invitationDeliveredAt: status === "DELIVERED" ? new Date() : null,
      },
    });

    await logViewerActivity(viewer, {
      entityType: "household",
      entityId: household.id,
      entityLabel: household.name,
      action: "invitation_updated",
      summary: `${viewer.name} marked the ${household.name} invitation as ${status.replace(/_/g, " ").toLowerCase()}.`,
      before: { invitationStatus: household.invitationStatus },
      after: { invitationStatus: status },
      undoable: true,
    });

    revalidateWedding();
    return { id: household.id };
  });
}

/** Rotate a household's public RSVP link, invalidating the old one. */
export async function regenerateRsvpToken(householdId: string) {
  return withAction("guests.edit", async (viewer) => {
    const household = await db.household.findFirst({
      where: { id: householdId, weddingId: viewer.weddingId },
      select: { id: true, name: true },
    });
    if (!household) throw new Error("That household no longer exists.");

    const token = newRsvpToken();
    await db.household.update({ where: { id: householdId }, data: { rsvpToken: token } });

    await logViewerActivity(viewer, {
      entityType: "household",
      entityId: household.id,
      entityLabel: household.name,
      action: "rsvp_link_reset",
      summary: `${viewer.name} reset the RSVP link for ${household.name}. The previous link no longer works.`,
    });

    revalidateWedding();
    return { token };
  });
}

const RSVP_TEXT: Record<(typeof RSVP)[number], string> = {
  NOT_INVITED: "Not invited",
  PENDING: "Awaiting a reply",
  CONFIRMED: "Coming",
  DECLINED: "Not coming",
  TENTATIVE: "Maybe",
};

function isAnswer(status: (typeof RSVP)[number]): boolean {
  return status === "CONFIRMED" || status === "DECLINED" || status === "TENTATIVE";
}
