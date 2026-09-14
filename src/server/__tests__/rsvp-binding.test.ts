/**
 * The binding between a link we send and the reply we get back.
 *
 * Run against the real database, because every rule under test is a database
 * rule: which rows a token may speak for, what survives a transaction, and what
 * is still on disk after the household has been deleted underneath it.
 *
 * The last of those is not hypothetical. On 11th September a household answered
 * the save-the-date, the activity feed recorded it, and the answer is not in
 * the database — a regrouping script moved the guests into a new household and
 * deleted the old one eleven seconds later. These tests are the fence around
 * that hole.
 *
 * Every test builds and removes its own wedding, so the suite leaves no trace.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";

// The action revalidates the planner's pages on the way out, which needs a
// request context these tests deliberately do not have.
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { db } = await import("@/server/db");
const { submitRsvp } = await import("@/server/actions/rsvp");
const { publicRsvpKey } = await import("@/lib/rsvp-links");
const { REPLY_CLOSES_AT, REPLY_BY, repliesHaveClosed } = await import("@/config/rsvp");

/**
 * Every token this suite mints, so the ledger rows it creates can be removed
 * again. The ledger deliberately has no foreign keys, which means deleting the
 * test wedding does not take its rows with it — that is the whole point of it,
 * and it makes cleaning up our own noise our own job.
 */
const minted: string[] = [];
const token = () => {
  const value = randomUUID().replace(/-/g, "") + randomBytes(6).toString("hex");
  minted.push(value);
  return value;
};
const SLUG = `rsvp-binding-${Date.now()}`;

let weddingId: string;

/** A household, its people, and the link that gets sent to it. */
async function makeHousehold(
  name: string,
  guests: { first: string; tier?: "A" | "B" | "C"; personal?: boolean }[],
) {
  const household = await db.household.create({
    data: {
      weddingId,
      name,
      rsvpToken: token(),
      guests: {
        create: guests.map((guest) => ({
          weddingId,
          firstName: guest.first,
          lastName: "Test",
          tier: guest.tier ?? "A",
          rsvpToken: guest.personal ? token() : null,
        })),
      },
    },
    select: {
      id: true,
      name: true,
      rsvpToken: true,
      guests: {
        orderBy: { firstName: "asc" },
        select: { id: true, firstName: true, rsvpToken: true },
      },
    },
  });
  return household;
}

const ledgerFor = (token: string) =>
  db.rsvpSubmission.findFirst({ where: { token }, orderBy: { createdAt: "desc" } });

beforeAll(async () => {
  const wedding = await db.wedding.create({
    data: {
      slug: SLUG,
      partnerAName: "Test",
      partnerBName: "Wedding",
      startDate: new Date("2027-06-16"),
      endDate: new Date("2027-06-19"),
      totalBudget: "1000",
      invitationStage: "SAVE_THE_DATE",
      rsvpEnabled: true,
    },
    select: { id: true },
  });
  weddingId = wedding.id;
});

afterAll(async () => {
  await db.rsvpSubmission.deleteMany({
    where: { OR: [{ weddingId }, { token: { in: minted } }] },
  });
  await db.activityLog.deleteMany({ where: { weddingId } });
  await db.guest.deleteMany({ where: { weddingId } });
  await db.household.deleteMany({ where: { weddingId } });
  await db.wedding.deleteMany({ where: { id: weddingId } });
});

beforeEach(async () => {
  await db.wedding.update({
    where: { id: weddingId },
    data: { invitationStage: "SAVE_THE_DATE", rsvpEnabled: true },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a link and the reply it produces", () => {
  it("records every person the household link speaks for", async () => {
    const household = await makeHousehold("Ledger Family", [
      { first: "Anna" },
      { first: "Bilal" },
    ]);

    const result = await submitRsvp({
      token: household.rsvpToken,
      message: "Wouldn't miss it",
      people: household.guests.map((guest) => ({
        guestId: guest.id,
        coming: "YES",
        phone: "+447700900123",
      })),
    });

    expect(result).toEqual({ ok: true, coming: 2, total: 2 });

    const after = await db.guest.findMany({
      where: { householdId: household.id },
      select: { firstName: true, stdResponse: true },
      orderBy: { firstName: "asc" },
    });
    expect(after.map((g) => g.stdResponse)).toEqual(["YES", "YES"]);

    const row = await db.household.findUnique({
      where: { id: household.id },
      select: { stdRepliedAt: true, rsvpMessage: true },
    });
    expect(row?.stdRepliedAt).not.toBeNull();
    expect(row?.rsvpMessage).toBe("Wouldn't miss it");

    const ledger = await ledgerFor(household.rsvpToken);
    expect(ledger?.outcome).toBe("RECORDED");
    expect(ledger?.householdName).toBe("Ledger Family");
    expect(ledger?.summary).toContain("Anna Test and Bilal Test said yes");
  });

  it("accepts the readable alias that is actually sent, not just the raw token", async () => {
    const household = await makeHousehold("Alias Family", [{ first: "Chitra" }]);
    const sent = publicRsvpKey(household.name, household.rsvpToken);
    minted.push(sent);

    const result = await submitRsvp({
      token: sent,
      people: [{ guestId: household.guests[0].id, coming: "NO" }],
    });

    expect(result).toEqual({ ok: true, coming: 0, total: 1 });
    expect(
      (
        await db.guest.findUnique({
          where: { id: household.guests[0].id },
          select: { stdResponse: true },
        })
      )?.stdResponse,
    ).toBe("NO");
    expect((await ledgerFor(sent))?.outcome).toBe("RECORDED");
  });

  it("refuses the whole reply rather than silently dropping a name it doesn't know", async () => {
    const household = await makeHousehold("Partial Family", [
      { first: "Dev" },
      { first: "Esha" },
    ]);
    const stranger = await makeHousehold("Other Family", [{ first: "Farid" }]);

    const result = await submitRsvp({
      token: household.rsvpToken,
      people: [
        { guestId: household.guests[0].id, coming: "YES" },
        { guestId: stranger.guests[0].id, coming: "YES" },
      ],
    });

    expect(result.ok).toBe(false);

    // Nobody at all was written — not even the name that was genuinely ours.
    const touched = await db.guest.findMany({
      where: {
        householdId: { in: [household.id, stranger.id] },
        stdResponse: { not: null },
      },
      select: { id: true },
    });
    expect(touched).toHaveLength(0);

    const ledger = await ledgerFor(household.rsvpToken);
    expect(ledger?.outcome).toBe("NAMES_NOT_MATCHED");
    // The answers themselves are kept, so the reply can be honoured by hand.
    expect(JSON.stringify(ledger?.payload)).toContain(stranger.guests[0].id);
  });

  it("keeps a personal link to its owner and leaves the household alone", async () => {
    const household = await makeHousehold("Personal Family", [
      { first: "Gita", personal: true },
      { first: "Hari" },
    ]);
    const gita = household.guests.find((g) => g.firstName === "Gita")!;
    const hari = household.guests.find((g) => g.firstName === "Hari")!;

    const result = await submitRsvp({
      token: gita.rsvpToken!,
      people: [{ guestId: gita.id, coming: "YES" }],
    });
    expect(result.ok).toBe(true);

    expect(
      (await db.guest.findUnique({ where: { id: hari.id }, select: { stdResponse: true } }))
        ?.stdResponse,
    ).toBeNull();

    // The household is not "answered" while Hari still owes us a reply.
    expect(
      (
        await db.household.findUnique({
          where: { id: household.id },
          select: { stdRepliedAt: true },
        })
      )?.stdRepliedAt,
    ).toBeNull();

    const ledger = await ledgerFor(gita.rsvpToken!);
    expect(ledger?.outcome).toBe("RECORDED");
    expect(ledger?.guestName).toBe("Gita Test");
  });

  it("will not let a personal-link holder answer for their housemate", async () => {
    const household = await makeHousehold("Overreach Family", [
      { first: "Ira", personal: true },
      { first: "Jai" },
    ]);
    const ira = household.guests.find((g) => g.firstName === "Ira")!;
    const jai = household.guests.find((g) => g.firstName === "Jai")!;

    const result = await submitRsvp({
      token: ira.rsvpToken!,
      people: [
        { guestId: ira.id, coming: "YES" },
        { guestId: jai.id, coming: "YES" },
      ],
    });

    expect(result.ok).toBe(false);
    expect(
      (await db.guest.findUnique({ where: { id: jai.id }, select: { stdResponse: true } }))
        ?.stdResponse,
    ).toBeNull();
    expect((await ledgerFor(ira.rsvpToken!))?.outcome).toBe("NAMES_NOT_MATCHED");
  });

  it("records a token that matches nothing instead of forgetting it happened", async () => {
    const orphan = token();
    const result = await submitRsvp({
      token: orphan,
      people: [{ guestId: "whoever", coming: "YES" }],
    });

    expect(result).toEqual({ ok: false, error: "That link isn't valid any more." });
    const ledger = await ledgerFor(orphan);
    expect(ledger?.outcome).toBe("LINK_NOT_FOUND");
    expect(ledger?.token).toBe(orphan);
  });

  it("records a reply that arrives while replies are closed", async () => {
    const household = await makeHousehold("Closed Family", [{ first: "Kiran" }]);
    await db.wedding.update({ where: { id: weddingId }, data: { rsvpEnabled: false } });

    const result = await submitRsvp({
      token: household.rsvpToken,
      people: [{ guestId: household.guests[0].id, coming: "YES" }],
    });

    expect(result.ok).toBe(false);
    expect((await ledgerFor(household.rsvpToken))?.outcome).toBe("REPLIES_CLOSED");
  });

  it("records a link whose wave currently asks nobody", async () => {
    const household = await makeHousehold("Held Back Family", [
      { first: "Lata", tier: "B" },
    ]);

    const result = await submitRsvp({
      token: household.rsvpToken,
      people: [{ guestId: household.guests[0].id, coming: "YES" }],
    });

    expect(result.ok).toBe(false);
    expect((await ledgerFor(household.rsvpToken))?.outcome).toBe("NOBODY_TO_ANSWER_FOR");
  });

  it("records a malformed submission rather than dropping it", async () => {
    const household = await makeHousehold("Malformed Family", [{ first: "Manu" }]);

    const result = await submitRsvp({ token: household.rsvpToken, people: [] });

    expect(result.ok).toBe(false);
    const ledger = await ledgerFor(household.rsvpToken);
    expect(ledger?.outcome).toBe("INVALID_PAYLOAD");
  });

  /**
   * The regression test for the reply we actually lost.
   *
   * The ledger holds no foreign keys precisely so that regrouping the guest
   * list — which deletes households and mints new tokens — cannot take the
   * evidence with it.
   */
  it("keeps the reply after the household it was made against is deleted", async () => {
    const household = await makeHousehold("Doomed Family", [
      { first: "Nina" },
      { first: "Omar" },
    ]);

    await submitRsvp({
      token: household.rsvpToken,
      people: household.guests.map((guest) => ({ guestId: guest.id, coming: "YES" })),
    });

    await db.activityLog.deleteMany({ where: { entityId: household.id } });
    await db.guest.deleteMany({ where: { householdId: household.id } });
    await db.household.delete({ where: { id: household.id } });

    const ledger = await ledgerFor(household.rsvpToken);
    expect(ledger).not.toBeNull();
    expect(ledger?.outcome).toBe("RECORDED");
    expect(ledger?.householdName).toBe("Doomed Family");
    expect(ledger?.summary).toContain("Nina Test and Omar Test said yes");
    // And the answers themselves, ready to be replayed onto the new rows.
    expect(JSON.stringify(ledger?.payload)).toContain('"coming":"YES"');
  });
});

/**
 * The date on the invitation, enforced.
 *
 * The page stops showing the form at the same instant, but the page is not the
 * guard — a tab left open on the 8th and sent on the 12th has to be refused by
 * the server or it writes into a headcount that has already gone to the hotel.
 */
describe("the reply deadline", () => {
  it("still takes a reply on the day it is due", async () => {
    const household = await makeHousehold("On Time Family", [{ first: "Nadia" }]);
    // Late on the 9th, in the last timezone on earth to be living it.
    vi.setSystemTime(new Date("2026-10-10T11:00:00.000Z"));

    const result = await submitRsvp({
      token: household.rsvpToken,
      people: [{ guestId: household.guests[0].id, coming: "YES" }],
    });

    expect(result.ok).toBe(true);
    expect((await ledgerFor(household.rsvpToken))?.outcome).toBe("RECORDED");
  });

  it("refuses a reply once the date has passed, and keeps their answers", async () => {
    const household = await makeHousehold("Too Late Family", [
      { first: "Omar" },
      { first: "Pia" },
    ]);
    vi.setSystemTime(new Date("2026-10-15T09:00:00.000Z"));

    const result = await submitRsvp({
      token: household.rsvpToken,
      people: household.guests.map((guest) => ({ guestId: guest.id, coming: "YES" })),
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("9th October 2026");

    // Nothing was written to the guest list.
    const after = await db.guest.findMany({
      where: { householdId: household.id },
      select: { stdResponse: true },
    });
    expect(after.every((guest) => guest.stdResponse === null)).toBe(true);

    // But the answers are kept, because a late guest is a guest to ring back.
    const ledger = await ledgerFor(household.rsvpToken);
    expect(ledger?.outcome).toBe("DEADLINE_PASSED");
    expect(JSON.stringify(ledger?.payload)).toContain('"coming":"YES"');
    expect(ledger?.householdName).toBe("Too Late Family");
  });

  it("tells a late reply apart from one refused by the switch", async () => {
    const household = await makeHousehold("Switched Off Family", [{ first: "Quin" }]);
    await db.wedding.update({ where: { id: weddingId }, data: { rsvpEnabled: false } });
    vi.setSystemTime(new Date("2026-10-15T09:00:00.000Z"));

    await submitRsvp({
      token: household.rsvpToken,
      people: [{ guestId: household.guests[0].id, coming: "YES" }],
    });

    // The manual switch is checked first and reported as itself: somebody
    // turned replies off, which is a different thing from running out of time.
    expect((await ledgerFor(household.rsvpToken))?.outcome).toBe("REPLIES_CLOSED");
  });

  it("closes at the end of the 9th in the last timezone, not the start of it", () => {
    expect(repliesHaveClosed(REPLY_BY)).toBe(false);
    expect(repliesHaveClosed(new Date("2026-10-09T23:59:00.000Z"))).toBe(false);
    // Still the 9th in Honolulu and points west.
    expect(repliesHaveClosed(new Date("2026-10-10T11:59:00.000Z"))).toBe(false);
    expect(repliesHaveClosed(REPLY_CLOSES_AT)).toBe(true);
    expect(repliesHaveClosed(new Date("2026-10-11T00:00:00.000Z"))).toBe(true);
  });
});
