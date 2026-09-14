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
 *
 * And one rule above all the others: **every attempt is written to the ledger
 * before it is applied**, whether it validates, whether the token is real, and
 * whether the write then succeeds. A reply that reached this function and left
 * no trace is the one bug this file exists to make impossible. See
 * `@/server/rsvp-ledger` for what that cost us once already.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { REPLY_BY_LABEL, repliesHaveClosed } from "@/config/rsvp";
import { db } from "@/server/db";
import { recordSubmission, settleSubmission } from "@/server/rsvp-ledger";
import { resolveRsvpLink, rsvpAudience } from "@/server/rsvp-link";

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
  // Long enough to be a readable alias — "x-0123456789ab" is fourteen — and the
  // resolver decides what it actually is. A length rule here that disagreed
  // with the one the page uses would refuse links the page had just served.
  token: z.string().trim().min(13).max(200),
  people: z.array(personSchema).min(1).max(40),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  /// Whose number the household box was showing. Without it the details land on
  /// whoever happens to be first in the list, which is how one cousin ended up
  /// holding another's phone number.
  contactGuestId: z.string().min(1).optional(),
  message: z.string().trim().max(1000).optional(),
});

export type RsvpResult =
  | { ok: true; coming: number; total: number }
  | { ok: false; error: string };

/** Pull whatever looks like a token out of an unvalidated payload, for the ledger. */
function tokenFrom(input: unknown): string {
  const candidate = (input as { token?: unknown })?.token;
  return typeof candidate === "string" ? candidate : "";
}

export async function submitRsvp(input: unknown): Promise<RsvpResult> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) {
    // Recorded rather than dropped: a form that submits something we refuse is
    // a bug on our side, and the payload is the only way to find out which.
    await recordSubmission({
      token: tokenFrom(input),
      outcome: "INVALID_PAYLOAD",
      payload: input,
      error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    });
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your answers." };
  }
  const data = parsed.data;

  const link = await resolveRsvpLink(data.token);
  if (!link) {
    // Deliberately the same answer for a token that never existed and one that
    // has been rotated — but the two are told apart in the ledger, which is
    // where somebody chasing a silent guest will actually look.
    await recordSubmission({
      token: data.token,
      outcome: "LINK_NOT_FOUND",
      payload: data,
      error: "No household or guest holds this token.",
    });
    return { ok: false, error: "That link isn't valid any more." };
  }

  const household = await db.household.findUnique({
    where: { id: link.householdId },
    select: {
      id: true,
      name: true,
      weddingId: true,
      guests: {
        where: { archivedAt: null },
        select: {
          id: true,
          tier: true,
          rsvpToken: true,
          firstName: true,
          lastName: true,
        },
      },
      wedding: { select: { rsvpEnabled: true, invitationStage: true } },
    },
  });

  if (!household) {
    await recordSubmission({
      token: data.token,
      outcome: "LINK_NOT_FOUND",
      payload: data,
      householdId: link.householdId,
      guestId: link.personalGuestId,
      error: "The token resolved to a household that no longer exists.",
    });
    return { ok: false, error: "That link isn't valid any more." };
  }

  const nameOf = new Map(
    household.guests.map((guest) => [
      guest.id,
      `${guest.firstName} ${guest.lastName}`.trim(),
    ]),
  );
  const stage = household.wedding.invitationStage;
  const isSaveTheDate = stage === "SAVE_THE_DATE";

  /** Everything the ledger should know about this attempt, whatever happens to it. */
  const identity = {
    token: data.token,
    payload: data,
    weddingId: household.weddingId,
    householdId: household.id,
    householdName: household.name,
    guestId: link.personalGuestId,
    guestName: link.personalGuestId ? (nameOf.get(link.personalGuestId) ?? null) : null,
    stage,
  } as const;

  if (!household.wedding.rsvpEnabled) {
    await recordSubmission({
      ...identity,
      outcome: "REPLIES_CLOSED",
      error: "Replies are switched off for this wedding.",
    });
    return { ok: false, error: "Replies are closed for now. Do get in touch." };
  }

  // The date on the invitation, enforced.
  //
  // The page stops showing the form at the same moment, so nobody who reaches
  // here is being surprised — but the page is not the guard. Somebody who left
  // the tab open on the 8th and pressed send on the 12th would otherwise write
  // into a headcount that has already gone to the hotel.
  //
  // Refused, and recorded as its own thing: a late reply is not a lost one, it
  // is a guest to ring back, and the ledger is where you find them.
  if (repliesHaveClosed()) {
    await recordSubmission({
      ...identity,
      outcome: "DEADLINE_PASSED",
      summary: `A late reply, after ${REPLY_BY_LABEL}.`,
      error: `Replies closed on ${REPLY_BY_LABEL}. Their answers are in the payload — ring them.`,
    });
    return {
      ok: false,
      error: `Replies closed on ${REPLY_BY_LABEL}, so we couldn't record this one. Do message Avantika and Prateek directly — we'd still love to hear from you.`,
    };
  }

  // Exactly the rule the invitation page rendered from, from the same function.
  const allowed = rsvpAudience({
    stage,
    personalGuestId: link.personalGuestId,
    guests: household.guests,
  });

  if (allowed.size === 0) {
    await recordSubmission({
      ...identity,
      outcome: "NOBODY_TO_ANSWER_FOR",
      error: isSaveTheDate
        ? "The link is real, but nobody it speaks for is in the wave that was sent."
        : "The link is real, but it speaks for nobody.",
    });
    return { ok: false, error: "We couldn't match those names — do let us know." };
  }

  // All of them or none of them.
  //
  // This used to quietly keep the names it recognised and drop the rest, then
  // report success. A household of four whose page was a day out of date would
  // be told "thank you" having had two of its answers thrown away — which is
  // the precise shape of the failure nobody ever finds out about.
  const unknown = data.people.filter((person) => !allowed.has(person.guestId));
  if (unknown.length > 0) {
    await recordSubmission({
      ...identity,
      outcome: "NAMES_NOT_MATCHED",
      error: `Submitted ${data.people.length} ${data.people.length === 1 ? "name" : "names"}, of which ${unknown.length} ${unknown.length === 1 ? "is" : "are"} not on this link: ${unknown.map((p) => p.guestId).join(", ")}.`,
    });
    return {
      ok: false,
      error: "This invitation has changed since you opened it. Do reload the page and try again.",
    };
  }

  const people = data.people;

  // Everyone in the household the current wave asks, personal links included.
  const expectedToAnswer = household.guests
    .filter((guest) => !isSaveTheDate || guest.tier === "A")
    .map((guest) => guest.id);

  const events = await db.event.findMany({
    where: { weddingId: household.weddingId, archivedAt: null },
    select: { id: true },
  });

  // Who answered, by name.
  //
  // "1 of 1 hoping to come" is true and useless: the whole point of a reply
  // landing in the feed is knowing whose it was without opening anything.
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

  // Written *before* the answer is applied, so a write that dies halfway — or a
  // process that dies with it — still leaves the guest's actual answer on disk,
  // in full, ready to be replayed by hand.
  const ledgerId = await recordSubmission({
    ...identity,
    outcome: "WRITE_FAILED",
    summary,
    error: "Recorded on arrival; not yet applied.",
  });

  const now = new Date();
  const comingCount = people.filter((p) => p.coming === "YES").length;

  try {
    await db.$transaction(
      async (tx) => {
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
              // A save-the-date is an intention, not an acceptance. It's
              // recorded on the guest and deliberately does not touch the
              // per-event invitations, which stay pending until the real
              // invitation goes out.
              ...(isSaveTheDate ? { stdResponse: person.coming } : {}),
              ...(link.personalGuestId === person.guestId
                ? { rsvpMessage: data.message || null, rsvpSubmittedAt: now }
                : {}),
            },
          });

          if (isSaveTheDate) continue;

          // One answer covers the week — this is a resort wedding, and asking
          // seven times on a form somebody's grandmother is filling in is
          // unkind.
          const status = person.coming === "YES" ? "CONFIRMED" : "DECLINED";
          for (const event of events) {
            await tx.eventInvitation.upsert({
              where: { guestId_eventId: { guestId: person.guestId, eventId: event.id } },
              create: { guestId: person.guestId, eventId: event.id, status, respondedAt: now },
              update: { status, respondedAt: now },
            });
          }
        }

        // The invitation form collects one number for the household. It goes on
        // the person whose number was already in the box — named by the form
        // rather than guessed at here, and only if this link speaks for them.
        if (data.phone || data.email) {
          const named =
            data.contactGuestId && allowed.has(data.contactGuestId)
              ? data.contactGuestId
              : null;
          const owner =
            named ??
            people.find((person) => person.phone || person.email)?.guestId ??
            people[0].guestId;
          await tx.guest.update({
            where: { id: owner },
            data: {
              ...(data.phone ? { phone: data.phone } : {}),
              ...(data.email ? { email: data.email } : {}),
            },
          });
        }

        // "This household has answered" means everybody in it who is being
        // asked in the current wave has answered — including the couple of
        // people who reply on their own personal link rather than this one.
        // Counting only the names this link speaks for would mark a family
        // complete on the strength of one member's reply.
        const stillAwaiting = isSaveTheDate
          ? await tx.guest.count({
              where: {
                id: { in: expectedToAnswer },
                archivedAt: null,
                stdResponse: null,
              },
            })
          : 0;

        await tx.household.update({
          where: { id: household.id },
          data: {
            ...(isSaveTheDate
              ? // The household's RSVP stays untouched — nobody has been
                // formally invited yet, and marking them "coming" a year out
                // would inflate every headcount in the app.
                { stdRepliedAt: stillAwaiting === 0 ? now : null }
              : {
                  // Anybody coming makes it a yes for the household; a
                  // household is only a no when nobody from it is coming.
                  rsvpReply: comingCount > 0 ? "YES" : "NO",
                  rsvpRepliedAt: now,
                  rsvpSubmittedAt: now,
                }),
            ...(link.personalGuestId ? {} : { rsvpMessage: data.message || null }),
          },
        });

        await tx.activityLog.create({
          data: {
            weddingId: household.weddingId,
            source: "RSVP",
            // A personal link speaks for one person, so the entry points at
            // them; a household link points at the household it answered for.
            entityType: link.personalGuestId ? "guest" : "household",
            entityId: link.personalGuestId ?? household.id,
            entityLabel: link.personalGuestId
              ? (nameOf.get(link.personalGuestId) ?? household.name)
              : household.name,
            action: isSaveTheDate ? "std_replied" : "rsvp_updated",
            summary,
          },
        });
      },
      {
        // A household of eight over a slow hotel connection is a long way past
        // Prisma's five-second default, and a transaction that times out is a
        // reply thrown away. Generous on purpose.
        timeout: 30_000,
        maxWait: 10_000,
      },
    );
  } catch (cause) {
    await settleSubmission(ledgerId, {
      outcome: "WRITE_FAILED",
      summary,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    console.error("[rsvp] a reply was received but could not be applied", identity, cause);
    return {
      ok: false,
      error: "We couldn't save that just now. Do try again — and if it keeps failing, message us.",
    };
  }

  await settleSubmission(ledgerId, { outcome: "RECORDED", summary, error: null });

  // The planner should see this without a hard refresh.
  revalidatePath("/", "layout");

  return { ok: true, coming: comingCount, total: people.length };
}
