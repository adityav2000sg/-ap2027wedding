"use server";

/**
 * The public RSVP.
 *
 * This is the only part of the app a stranger can reach, so it is written as if
 * the token were the sole thing standing between the internet and the guest
 * list — because it is.
 *
 * The rules that follow from that:
 *
 *   - the token is the only key; no id from the request is ever trusted
 *   - a guest can only be updated if they belong to the household that token
 *     opens, checked server-side against the database rather than against what
 *     was submitted
 *   - nothing is created and nothing is deleted; a household can answer for the
 *     people on the list and no one else
 *   - a wrong token is "not found", never "wrong", so the endpoint can't be used
 *     to discover which tokens are real
 *
 * Replies overwrite freely. People change their minds, and a link that stops
 * working the moment it's used is a link that generates phone calls.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";

const DIETS = [
  "NOT_SPECIFIED",
  "NON_VEGETARIAN",
  "VEGETARIAN",
  "JAIN",
  "VEGAN",
] as const;

const personSchema = z.object({
  guestId: z.string().min(1),
  coming: z.enum(["YES", "NO"]),
  dietary: z.enum(DIETS).optional(),
  allergies: z.string().trim().max(280).optional(),
  accessibilityNeeds: z.string().trim().max(280).optional(),
  needsAccommodation: z.coerce.boolean().optional(),
  needsTransport: z.coerce.boolean().optional(),
});

const submissionSchema = z.object({
  token: z.string().min(20),
  people: z.array(personSchema).min(1).max(40),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  message: z.string().trim().max(1000).optional(),
});

export type RsvpResult =
  | { ok: true; coming: number; total: number }
  | { ok: false; error: string };

export async function submitRsvp(input: unknown): Promise<RsvpResult> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your answers." };
  }
  const data = parsed.data;

  const household = await db.household.findUnique({
    where: { rsvpToken: data.token },
    select: {
      id: true,
      weddingId: true,
      guests: { where: { archivedAt: null }, select: { id: true } },
      wedding: { select: { rsvpEnabled: true, invitationStage: true } },
    },
  });

  // Deliberately the same answer for a token that never existed and one that
  // has been rotated.
  if (!household) return { ok: false, error: "That link isn't valid any more." };
  if (!household.wedding.rsvpEnabled) {
    return { ok: false, error: "Replies are closed for now. Do get in touch." };
  }

  // The set of people this token is allowed to speak for.
  const allowed = new Set(household.guests.map((g) => g.id));
  const people = data.people.filter((person) => allowed.has(person.guestId));
  if (people.length === 0) {
    return { ok: false, error: "We couldn't match those names — do let us know." };
  }

  const events = await db.event.findMany({
    where: { weddingId: household.weddingId, archivedAt: null },
    select: { id: true },
  });

  const now = new Date();
  const comingCount = people.filter((p) => p.coming === "YES").length;
  const isSaveTheDate = household.wedding.invitationStage === "SAVE_THE_DATE";

  await db.$transaction(async (tx) => {
    for (const person of people) {
      await tx.guest.update({
        where: { id: person.guestId },
        data: {
          ...(person.dietary ? { dietary: person.dietary } : {}),
          ...(person.allergies !== undefined
            ? { allergies: person.allergies || null }
            : {}),
          ...(person.accessibilityNeeds !== undefined
            ? { accessibilityNeeds: person.accessibilityNeeds || null }
            : {}),
          ...(person.needsAccommodation !== undefined
            ? { needsAccommodation: person.needsAccommodation }
            : {}),
          ...(person.needsTransport !== undefined
            ? { needsTransport: person.needsTransport }
            : {}),
        },
      });

      if (isSaveTheDate) {
        // A save-the-date is an intention, not an acceptance. It's recorded on
        // the guest and deliberately does not touch the per-event invitations,
        // which stay pending until the real invitation goes out.
        await tx.guest.update({
          where: { id: person.guestId },
          data: { stdResponse: person.coming },
        });
        continue;
      }

      // One answer covers the week — this is a resort wedding, and asking seven
      // times on a form somebody's grandmother is filling in is unkind.
      const status = person.coming === "YES" ? "CONFIRMED" : "DECLINED";
      for (const event of events) {
        await tx.eventInvitation.upsert({
          where: { guestId_eventId: { guestId: person.guestId, eventId: event.id } },
          create: { guestId: person.guestId, eventId: event.id, status, respondedAt: now },
          update: { status, respondedAt: now },
        });
      }
    }

    // Contact details go on the first person who came back, since the form
    // collects one number for the household.
    if (data.phone || data.email) {
      await tx.guest.update({
        where: { id: people[0].guestId },
        data: {
          ...(data.phone ? { phone: data.phone } : {}),
          ...(data.email ? { email: data.email } : {}),
        },
      });
    }

    await tx.household.update({
      where: { id: household.id },
      data: {
        ...(isSaveTheDate
          ? // The household's RSVP stays untouched — nobody has been formally
            // invited yet, and marking them "coming" a year out would inflate
            // every headcount in the app.
            { stdRepliedAt: now }
          : {
              // Anybody coming makes it a yes for the household; a household is
              // only a no when nobody from it is coming.
              rsvpReply: comingCount > 0 ? "YES" : "NO",
              rsvpRepliedAt: now,
              rsvpSubmittedAt: now,
            }),
        rsvpMessage: data.message || null,
      },
    });

    await tx.activityLog.create({
      data: {
        weddingId: household.weddingId,
        source: "RSVP",
        entityType: "household",
        entityId: household.id,
        entityLabel: null,
        action: isSaveTheDate ? "std_replied" : "rsvp_updated",
        summary: isSaveTheDate
          ? `Answered the save-the-date: ${comingCount} of ${people.length} hoping to come.`
          : comingCount > 0
            ? `${comingCount} of ${people.length} replied yes.`
            : `Replied no.`,
      },
    });
  });

  // The planner should see this without a hard refresh.
  revalidatePath("/", "layout");

  return { ok: true, coming: comingCount, total: people.length };
}
