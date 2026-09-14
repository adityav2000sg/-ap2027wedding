import "server-only";

/**
 * The reply ledger.
 *
 * One rule: if somebody pressed send, there is a row here. Not "if it
 * validated", not "if the token was real", not "if the write succeeded" — if
 * they pressed send.
 *
 * This exists because the opposite has already happened. On 11th September a
 * household answered the save-the-date, the activity feed recorded it, and the
 * answer itself is not in the database: a regrouping script ran eleven seconds
 * later, moved the guests into a freshly created household and deleted the old
 * one, taking the reply and the link that had been sent with it. Nobody would
 * ever have noticed. The couple would simply have chased a family who had
 * already said yes.
 *
 * So this table holds no foreign keys and takes part in no transaction. It is
 * written before the answer is applied and again after, it stores the payload
 * as it arrived and the names as text, and nothing in the app is allowed to
 * cascade into it. A reply recorded here can be read, and replayed, long after
 * every row it referred to has been rewritten.
 *
 * Writing to it must never be the reason a guest sees an error, so every write
 * here swallows its own failures — loudly, to the server log, but without
 * taking the reply down with it.
 */

import type { Prisma, RsvpSubmissionOutcome } from "@prisma/client";

import { db } from "@/server/db";

export interface LedgerEntry {
  token: string;
  outcome: RsvpSubmissionOutcome;
  weddingId?: string | null;
  householdId?: string | null;
  householdName?: string | null;
  guestId?: string | null;
  guestName?: string | null;
  stage?: "SAVE_THE_DATE" | "INVITATION" | null;
  /** Whatever arrived, valid or not. */
  payload: unknown;
  summary?: string | null;
  error?: string | null;
}

/**
 * Make an arbitrary submission storable.
 *
 * The payload is whatever the network handed us, so it may be a string, a
 * class, or something with a cycle in it. None of that is a reason to lose the
 * reply, so anything unserialisable is stored as a description of itself.
 */
function storable(payload: unknown): Prisma.InputJsonValue {
  try {
    const json = JSON.stringify(payload ?? null);
    return json === undefined
      ? { unserialisable: String(payload) }
      : (JSON.parse(json) as Prisma.InputJsonValue);
  } catch {
    return { unserialisable: Object.prototype.toString.call(payload) };
  }
}

/**
 * Write one attempt to the ledger.
 *
 * Returns the row id when it landed, and null when even this failed — in which
 * case the reply is still applied, and the console carries the evidence.
 */
export async function recordSubmission(entry: LedgerEntry): Promise<string | null> {
  try {
    const row = await db.rsvpSubmission.create({
      data: {
        token: entry.token.slice(0, 200),
        outcome: entry.outcome,
        weddingId: entry.weddingId ?? null,
        householdId: entry.householdId ?? null,
        householdName: entry.householdName ?? null,
        guestId: entry.guestId ?? null,
        guestName: entry.guestName ?? null,
        stage: entry.stage ?? null,
        payload: storable(entry.payload),
        summary: entry.summary ?? null,
        error: entry.error ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (cause) {
    // The last line of defence: if the ledger itself is unwritable, the reply
    // must still be applied, and this must still be findable in the logs.
    console.error(
      "[rsvp] COULD NOT LEDGER A REPLY",
      JSON.stringify({
        token: entry.token,
        outcome: entry.outcome,
        household: entry.householdName,
        guest: entry.guestName,
        payload: entry.payload,
      }),
      cause,
    );
    return null;
  }
}

/** Promote a provisional row to its final outcome once the write has landed. */
export async function settleSubmission(
  id: string | null,
  patch: { outcome: RsvpSubmissionOutcome; summary?: string | null; error?: string | null },
): Promise<void> {
  if (!id) return;
  try {
    await db.rsvpSubmission.update({
      where: { id },
      data: {
        outcome: patch.outcome,
        summary: patch.summary ?? null,
        error: patch.error ?? null,
      },
    });
  } catch (cause) {
    console.error("[rsvp] could not settle ledger row", id, patch, cause);
  }
}

/**
 * Note that an invitation was opened.
 *
 * Three numbers make the difference between "they never got it", "they got it
 * and haven't answered" and "they answered and we lost it" — and only the first
 * two are fixed by sending the link again. Deliberately best-effort: nobody's
 * invitation should fail to render because a counter would not increment.
 */
export async function noteRsvpOpened(link: {
  householdId: string;
  personalGuestId: string | null;
}): Promise<void> {
  const now = new Date();
  try {
    if (link.personalGuestId) {
      await db.guest.update({
        where: { id: link.personalGuestId },
        data: { rsvpLastOpenedAt: now, rsvpOpenCount: { increment: 1 } },
      });
      // `rsvpOpenedAt` is the first open and must not move; set it only when
      // it is still empty.
      await db.guest.updateMany({
        where: { id: link.personalGuestId, rsvpOpenedAt: null },
        data: { rsvpOpenedAt: now },
      });
      return;
    }
    await db.household.update({
      where: { id: link.householdId },
      data: { rsvpLastOpenedAt: now, rsvpOpenCount: { increment: 1 } },
    });
    await db.household.updateMany({
      where: { id: link.householdId, rsvpOpenedAt: null },
      data: { rsvpOpenedAt: now },
    });
  } catch (cause) {
    console.error("[rsvp] could not note an opened invitation", link, cause);
  }
}
