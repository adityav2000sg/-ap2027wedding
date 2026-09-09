/**
 * Save-the-dates and invitations — who has been told, and who has answered.
 *
 * Two sends, tracked independently because they happen months apart: the
 * save-the-date goes early and wide, the invitation goes later and precisely.
 * A household can have had one, both or neither.
 *
 * The reply is deliberately three-state rather than a boolean. "Awaiting" is
 * not "no" — the whole point of this screen is the gap between what you've sent
 * and what has come back, and collapsing that to yes/no hides the chase list.
 */

import type { GuestTier, RsvpReply, WeddingSnapshot } from "./types";

export const TIERS: GuestTier[] = ["A", "B", "C"];

export const TIER_LABEL: Record<GuestTier, string> = {
  A: "Tier A — first wave",
  B: "Tier B — held back",
  C: "Tier C — reserve",
};

/** What somebody said to the save-the-date, rolled up for a whole household. */
export type StdReply = "YES" | "NO" | "PARTIAL" | "AWAITING";

export interface OutreachPerson {
  guestId: string;
  /// Present when this person receives a private link instead of the group's.
  rsvpToken: string | null;
  /// Their own tier — households can span two of them.
  tier: GuestTier;
  name: string;
  phone: string | null;
  email: string | null;
  saveTheDateSent: boolean;
  invitationSent: boolean;
  /// Their own answer to the save-the-date. This is the reply that exists a
  /// year out; the household's `reply` belongs to the invitation proper.
  stdResponse: "YES" | "NO" | null;
}

export interface OutreachRow {
  householdId: string;
  /// The household's own invitation link — what actually gets sent.
  rsvpToken: string;
  name: string;
  side: string;
  tier: GuestTier;
  people: OutreachPerson[];
  /** How many of this household have personally been sent each thing. */
  peopleSaveTheDateSent: number;
  peopleInvitationSent: number;
  /** People in this household, so a "no" carries its real weight. */
  headcount: number;
  saveTheDateSent: boolean;
  saveTheDateSentAt: Date | null;
  invitationSent: boolean;
  invitationSentAt: Date | null;
  reply: RsvpReply;
  repliedAt: Date | null;
  /**
   * The household's save-the-date answer, rolled up from the people in it.
   * PARTIAL matters: a family where two have answered and two haven't is the
   * one you chase, and calling it "awaiting" hides the two who replied.
   */
  stdReply: StdReply;
  stdYes: number;
  stdNo: number;
  stdAwaiting: number;
}

export interface OutreachStats {
  households: number;
  /** Save-the-date. */
  stdSent: number;
  stdNotSent: number;
  /** Invitation. */
  rsvpSent: number;
  rsvpNotSent: number;
  /** Replies, counted against invitations actually sent. */
  yes: number;
  no: number;
  awaiting: number;
  /** People, not households — this is what drives catering and rooms. */
  peopleYes: number;
  peopleNo: number;
  peopleAwaiting: number;
  /** Share of sent invitations that have come back, 0–100. */
  responseRate: number;
  /** People personally sent each thing, as opposed to household roll-ups. */
  peopleStdSent: number;
  peopleInviteSent: number;
  /** Answers to the save-the-date, counted in people. */
  stdYes: number;
  stdNo: number;
  stdAwaiting: number;
  /** Households where everybody has answered the save-the-date. */
  stdHouseholdsReplied: number;
}

export interface TierStats {
  tier: GuestTier;
  households: number;
  people: number;
  stdSent: number;
  /** Answers to the save-the-date from people on this wave. */
  stdYes: number;
  stdNo: number;
  rsvpSent: number;
  yes: number;
  no: number;
  awaiting: number;
}

export function outreachRows(snapshot: WeddingSnapshot): OutreachRow[] {
  const members = new Map<string, OutreachPerson[]>();
  for (const guest of snapshot.guests) {
    if (!guest.householdId) continue;
    const list = members.get(guest.householdId) ?? [];
    list.push({
      guestId: guest.id,
      rsvpToken: guest.rsvpToken,
      tier: guest.tier,
      name: `${guest.firstName} ${guest.lastName}`.trim(),
      phone: guest.phone ?? null,
      email: guest.email ?? null,
      saveTheDateSent: Boolean(guest.saveTheDateSentAt),
      invitationSent: Boolean(guest.invitationSentAt),
      stdResponse: guest.stdResponse,
    });
    members.set(guest.householdId, list);
  }

  return snapshot.households
    .map((household) => {
      const people = (members.get(household.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      return {
      householdId: household.id,
      rsvpToken: household.rsvpToken,
      name: household.name,
      side: household.side,
      // Derived, never read from the household's own column. Tier lives on the
      // guest, and a household with anyone on the A list goes out in wave A —
      // you don't post half an envelope.
      tier: (["A", "B", "C"] as const).find((t) =>
        people.some((p) => p.tier === t),
      ) ?? "C",
      people,
      stdReply: rollUpStd(people),
      stdYes: people.filter((p) => p.stdResponse === "YES").length,
      stdNo: people.filter((p) => p.stdResponse === "NO").length,
      // The remainder, rather than a count of nulls: "no answer" is every
      // shape of absent, and an undefined slipping through as "answered" would
      // quietly mark a household replied.
      stdAwaiting:
        people.length -
        people.filter((p) => p.stdResponse === "YES" || p.stdResponse === "NO").length,
      peopleSaveTheDateSent: people.filter((p) => p.saveTheDateSent).length,
      peopleInvitationSent: people.filter((p) => p.invitationSent).length,
      headcount: people.length,
      // Truthiness, not `!== null`: an absent field is "not sent", and reading
      // `undefined !== null` as "sent" would silently mark the whole list done.
      saveTheDateSent: Boolean(household.saveTheDateSentAt),
      saveTheDateSentAt: household.saveTheDateSentAt ?? null,
      invitationSent: Boolean(household.rsvpSentAt),
      invitationSentAt: household.rsvpSentAt ?? null,
      reply: household.rsvpReply ?? "AWAITING",
      repliedAt: household.rsvpRepliedAt ?? null,
      };
    })
    // Tier first — the first wave is the list anybody is actually working from.
    .sort((a, b) => a.tier.localeCompare(b.tier) || a.name.localeCompare(b.name));
}

/**
 * One household, one answer.
 *
 * Anybody coming makes it a yes; a household is only a no when everyone who
 * answered said no and nobody is outstanding. Anything in between is partial,
 * which is a different job from awaiting.
 */
function rollUpStd(people: OutreachPerson[]): StdReply {
  if (people.length === 0) return "AWAITING";
  const answered = people.filter(
    (person) => person.stdResponse === "YES" || person.stdResponse === "NO",
  );
  if (answered.length === 0) return "AWAITING";
  if (answered.length < people.length) return "PARTIAL";
  return answered.some((person) => person.stdResponse === "YES") ? "YES" : "NO";
}

export function outreachStats(snapshot: WeddingSnapshot): OutreachStats {
  const rows = outreachRows(snapshot);

  const stats: OutreachStats = {
    households: rows.length,
    stdSent: 0,
    stdNotSent: 0,
    rsvpSent: 0,
    rsvpNotSent: 0,
    yes: 0,
    no: 0,
    awaiting: 0,
    peopleYes: 0,
    peopleNo: 0,
    peopleAwaiting: 0,
    responseRate: 0,
    peopleStdSent: 0,
    peopleInviteSent: 0,
    stdYes: 0,
    stdNo: 0,
    stdAwaiting: 0,
    stdHouseholdsReplied: 0,
  };

  for (const row of rows) {
    stats.peopleStdSent += row.peopleSaveTheDateSent;
    stats.peopleInviteSent += row.peopleInvitationSent;
    stats.stdYes += row.stdYes;
    stats.stdNo += row.stdNo;
    stats.stdAwaiting += row.stdAwaiting;
    if (row.stdAwaiting === 0 && row.headcount > 0) stats.stdHouseholdsReplied += 1;

    if (row.saveTheDateSent) stats.stdSent += 1;
    else stats.stdNotSent += 1;

    if (row.invitationSent) stats.rsvpSent += 1;
    else stats.rsvpNotSent += 1;

    if (row.reply === "YES") {
      stats.yes += 1;
      stats.peopleYes += row.headcount;
    } else if (row.reply === "NO") {
      stats.no += 1;
      stats.peopleNo += row.headcount;
    } else {
      stats.awaiting += 1;
      stats.peopleAwaiting += row.headcount;
    }
  }

  // Against invitations sent, not against the whole list — chasing a reply from
  // someone you never invited is not a real gap.
  const answered = stats.yes + stats.no;
  stats.responseRate = stats.rsvpSent === 0 ? 0 : Math.round((answered / stats.rsvpSent) * 100);

  return stats;
}

/**
 * Households that have replied but were never sent an invitation, and
 * households sitting on an unanswered invitation. Both are things somebody
 * needs to do something about.
 */
export function outreachGaps(snapshot: WeddingSnapshot) {
  const rows = outreachRows(snapshot);
  return {
    awaitingReply: rows.filter((r) => r.invitationSent && r.reply === "AWAITING"),
    neverContacted: rows.filter((r) => !r.saveTheDateSent && !r.invitationSent),
    repliedWithoutInvite: rows.filter((r) => !r.invitationSent && r.reply !== "AWAITING"),
  };
}

/** The same counts, split by wave — what you look at when deciding to send B. */
export function outreachByTier(snapshot: WeddingSnapshot): TierStats[] {
  const rows = outreachRows(snapshot);

  return TIERS.map((tier) => {
    const inTier = rows.filter((row) => row.tier === tier);
    return {
      tier,
      households: inTier.length,
      // People are counted by their OWN wave, not by their household's. Four
      // households span two tiers, and rolling their whole headcount into the
      // household's wave put ten tier-B relatives inside the tier-A total —
      // which is why this screen said 241 where the guest list said 231.
      people: rows.reduce(
        (sum, row) => sum + row.people.filter((person) => person.tier === tier).length,
        0,
      ),
      stdSent: inTier.filter((row) => row.saveTheDateSent).length,
      stdYes: rows.reduce(
        (sum, row) =>
          sum +
          row.people.filter((p) => p.tier === tier && p.stdResponse === "YES").length,
        0,
      ),
      stdNo: rows.reduce(
        (sum, row) =>
          sum + row.people.filter((p) => p.tier === tier && p.stdResponse === "NO").length,
        0,
      ),
      rsvpSent: inTier.filter((row) => row.invitationSent).length,
      yes: inTier.filter((row) => row.reply === "YES").length,
      no: inTier.filter((row) => row.reply === "NO").length,
      awaiting: inTier.filter((row) => row.reply === "AWAITING").length,
    };
    // A wave with nobody in it isn't a wave. It can still have people without
    // having households of its own — a cousin held back inside a family that
    // is going out in the first wave.
  }).filter((tier) => tier.households > 0 || tier.people > 0);
}
