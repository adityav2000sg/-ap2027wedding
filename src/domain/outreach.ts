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

import type { RsvpReply, WeddingSnapshot } from "./types";

export interface OutreachRow {
  householdId: string;
  name: string;
  side: string;
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
}

export function outreachRows(snapshot: WeddingSnapshot): OutreachRow[] {
  const headcount = new Map<string, number>();
  for (const guest of snapshot.guests) {
    if (!guest.householdId) continue;
    headcount.set(guest.householdId, (headcount.get(guest.householdId) ?? 0) + 1);
  }

  return snapshot.households
    .map((household) => ({
      householdId: household.id,
      name: household.name,
      side: household.side,
      headcount: headcount.get(household.id) ?? 0,
      // Truthiness, not `!== null`: an absent field is "not sent", and reading
      // `undefined !== null` as "sent" would silently mark the whole list done.
      saveTheDateSent: Boolean(household.saveTheDateSentAt),
      saveTheDateSentAt: household.saveTheDateSentAt ?? null,
      invitationSent: Boolean(household.rsvpSentAt),
      invitationSentAt: household.rsvpSentAt ?? null,
      reply: household.rsvpReply ?? "AWAITING",
      repliedAt: household.rsvpRepliedAt ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  };

  for (const row of rows) {
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
