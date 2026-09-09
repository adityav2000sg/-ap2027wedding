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
}

export interface TierStats {
  tier: GuestTier;
  households: number;
  people: number;
  stdSent: number;
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
  };

  for (const row of rows) {
    stats.peopleStdSent += row.peopleSaveTheDateSent;
    stats.peopleInviteSent += row.peopleInvitationSent;

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
