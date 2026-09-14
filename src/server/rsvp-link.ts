import "server-only";

/**
 * Turning a link into the people it speaks for.
 *
 * This lives in one file because the invitation page and the action that
 * records the reply must never disagree about it. They used to answer the same
 * two questions separately — "whose link is this?" and "who may it answer
 * for?" — and two copies of that rule is one copy too many: the moment they
 * drift, a guest is shown a form whose answers the server then throws away
 * without saying so.
 *
 * So both sides call these. If the page renders somebody's name, the reply for
 * that name is accepted; if it doesn't, it never had to be refused.
 */

import { db } from "@/server/db";
import { rsvpCodeFromPath } from "@/lib/rsvp-links";

/** Who a link belongs to, once the token has been matched to a real row. */
export interface ResolvedRsvpLink {
  householdId: string;
  /** Set when the link is a personal one and answers only for that person. */
  personalGuestId: string | null;
  /** The full private token, whatever form the link arrived in. */
  resolvedToken: string;
}

/**
 * Match a link to its owner.
 *
 * Three shapes are accepted, in the order a real link is most likely to be in:
 * the readable alias that goes out today, a legacy full token, and — because
 * people retype links off a phone screen — either of those in any case.
 *
 * A token that matches nothing returns null, and so does the extraordinarily
 * unlikely prefix collision: opening neither invitation is safer than opening
 * the wrong person's. The audit catches a collision long before a guest could.
 */
export async function resolveRsvpLink(token: string): Promise<ResolvedRsvpLink | null> {
  const trimmed = token.trim();
  if (trimmed === "") return null;

  // A full token, exactly as stored.
  const exact = await Promise.all([
    db.guest.findUnique({
      where: { rsvpToken: trimmed },
      select: { id: true, householdId: true, rsvpToken: true },
    }),
    db.household.findUnique({
      where: { rsvpToken: trimmed },
      select: { id: true, rsvpToken: true },
    }),
  ]);
  const [exactGuest, exactHousehold] = exact;
  if (exactGuest?.householdId) {
    return {
      householdId: exactGuest.householdId,
      personalGuestId: exactGuest.id,
      resolvedToken: exactGuest.rsvpToken!,
    };
  }
  if (exactHousehold) {
    return {
      householdId: exactHousehold.id,
      personalGuestId: null,
      resolvedToken: exactHousehold.rsvpToken,
    };
  }

  // The readable alias: a name, then the private prefix.
  const code = rsvpCodeFromPath(trimmed);
  if (!code) return null;

  const [people, households] = await Promise.all([
    db.guest.findMany({
      where: { rsvpToken: { startsWith: code } },
      take: 2,
      select: { id: true, householdId: true, rsvpToken: true },
    }),
    db.household.findMany({
      where: { rsvpToken: { startsWith: code } },
      take: 2,
      select: { id: true, rsvpToken: true },
    }),
  ]);

  if (people.length + households.length !== 1) return null;

  const person = people[0];
  if (person) {
    if (!person.householdId) return null;
    return {
      householdId: person.householdId,
      personalGuestId: person.id,
      resolvedToken: person.rsvpToken!,
    };
  }
  return {
    householdId: households[0].id,
    personalGuestId: null,
    resolvedToken: households[0].rsvpToken,
  };
}

/** The minimum a guest row needs for us to decide whether a link speaks for it. */
export interface AudienceGuest {
  id: string;
  tier: "A" | "B" | "C";
  /** Non-null when this person has a personal link of their own. */
  rsvpToken: string | null;
  archivedAt?: Date | null;
}

/**
 * Who this link may answer for.
 *
 * A personal link speaks for exactly one person. A household link speaks for
 * everybody in the household who has not been given a link of their own — and,
 * while the save-the-date is the mailing that's out, only for the wave it was
 * actually sent to.
 *
 * Returned as ids in a Set, because the only safe way to use this is to ask it
 * about each submitted name rather than to re-derive the rule at the call site.
 */
export function rsvpAudience({
  stage,
  personalGuestId,
  guests,
}: {
  stage: "SAVE_THE_DATE" | "INVITATION";
  personalGuestId: string | null;
  guests: AudienceGuest[];
}): Set<string> {
  const live = guests.filter((guest) => !guest.archivedAt);

  if (personalGuestId) {
    // A personal link answers for its owner and nobody else — not even when
    // the owner has since been archived, in which case it answers for nobody.
    return new Set(live.filter((guest) => guest.id === personalGuestId).map((g) => g.id));
  }

  return new Set(
    live
      .filter((guest) => guest.rsvpToken === null)
      .filter((guest) => stage !== "SAVE_THE_DATE" || guest.tier === "A")
      .map((guest) => guest.id),
  );
}
