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
  /// The save-the-date collects a number and (optionally) an email from each
  /// person who says yes, rather than one set of details for the household.
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
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

  let household = await db.household.findUnique({
    where: { rsvpToken: data.token },
    select: {
      id: true,
      name: true,
      weddingId: true,
      guests: {
        where: { archivedAt: null, rsvpToken: null },
        select: { id: true, tier: true, firstName: true, lastName: true },
      },
      wedding: { select: { rsvpEnabled: true, invitationStage: true } },
    },
  });
  let personalGuestId: string | null = null;

  if (!household) {
    const personal = await db.guest.findUnique({
      where: { rsvpToken: data.token },
      select: {
        id: true,
        household: {
          select: {
            id: true,
            name: true,
            weddingId: true,
            guests: {
              where: { archivedAt: null },
              select: { id: true, tier: true, firstName: true, lastName: true },
            },
            wedding: { select: { rsvpEnabled: true, invitationStage: true } },
          },
        },
      },
    });
    household = personal?.household ?? null;
    personalGuestId = personal?.id ?? null;
  }

  // Deliberately the same answer for a token that never existed and one that
  // has been rotated.
  if (!household) return { ok: false, error: "That link isn't valid any more." };
  if (!household.wedding.rsvpEnabled) {
    return { ok: false, error: "Replies are closed for now. Do get in touch." };
  }

  // The set of people this token is allowed to speak for.
  const isSaveTheDate = household.wedding.invitationStage === "SAVE_THE_DATE";
  const allowed = new Set(
    personalGuestId
      ? [personalGuestId]
      : household.guests
          .filter((guest) => !isSaveTheDate || guest.tier === "A")
          .map((guest) => guest.id),
  );
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
          // Their own details, never blanked by an empty box: somebody who
          // leaves the email field alone keeps the address we already had.
          ...(person.phone ? { phone: person.phone } : {}),
          ...(person.email ? { email: person.email } : {}),
          ...(personalGuestId === person.guestId
            ? {
                rsvpMessage: data.message || null,
                rsvpSubmittedAt: now,
              }
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

    // The invitation form still collects one number for the household; it goes
    // on the first person who came back. The save-the-date sends nothing here,
    // because each person has already answered with their own.
    if (data.phone || data.email) {
      await tx.guest.update({
        where: { id: people[0].guestId },
        data: {
          ...(data.phone ? { phone: data.phone } : {}),
          ...(data.email ? { email: data.email } : {}),
        },
      });
    }

    const tierAStillAwaiting = isSaveTheDate
      ? await tx.guest.count({
          where: {
            householdId: household.id,
            archivedAt: null,
            tier: "A",
            stdResponse: null,
          },
        })
      : 0;

    await tx.household.update({
      where: { id: household.id },
      data: {
        ...(isSaveTheDate
          ? // The household's RSVP stays untouched — nobody has been formally
            // invited yet, and marking them "coming" a year out would inflate
            // every headcount in the app.
            { stdRepliedAt: tierAStillAwaiting === 0 ? now : null }
          : {
              // Anybody coming makes it a yes for the household; a household is
              // only a no when nobody from it is coming.
              rsvpReply: comingCount > 0 ? "YES" : "NO",
              rsvpRepliedAt: now,
              rsvpSubmittedAt: now,
            }),
        ...(personalGuestId ? {} : { rsvpMessage: data.message || null }),
      },
    });

    // Who answered, by name.
    //
    // "1 of 1 hoping to come" is true and useless: the whole point of a reply
    // landing in the feed is knowing whose it was without opening anything.
    const nameOf = new Map(
      household.guests.map((guest) => [
        guest.id,
        `${guest.firstName} ${guest.lastName}`.trim(),
      ]),
    );
    const named = (list: typeof people) =>
      list.map((person) => nameOf.get(person.guestId) ?? "A guest");
    const yesNames = named(people.filter((person) => person.coming === "YES"));
    const noNames = named(people.filter((person) => person.coming === "NO"));
    const sentence = (names: string[], one: string, many: string) =>
      names.length === 0
        ? null
        : `${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`} ${names.length === 1 ? one : many}`;

    const summary = isSaveTheDate
      ? [
          sentence(yesNames, "said yes", "said yes"),
          sentence(noNames, "said no", "said no"),
        ]
          .filter(Boolean)
          .join("; ") + " to the save-the-date."
      : [
          sentence(yesNames, "is coming", "are coming"),
          sentence(noNames, "can't make it", "can't make it"),
        ]
          .filter(Boolean)
          .join("; ") + ".";

    await tx.activityLog.create({
      data: {
        weddingId: household.weddingId,
        source: "RSVP",
        // A personal link speaks for one person, so the entry points at them;
        // a household link points at the household it answered for.
        entityType: personalGuestId ? "guest" : "household",
        entityId: personalGuestId ?? household.id,
        entityLabel: personalGuestId
          ? (nameOf.get(personalGuestId) ?? household.name)
          : household.name,
        action: isSaveTheDate ? "std_replied" : "rsvp_updated",
        summary,
      },
    });
  });

  // The planner should see this without a hard refresh.
  revalidatePath("/", "layout");

  return { ok: true, coming: comingCount, total: people.length };
}
