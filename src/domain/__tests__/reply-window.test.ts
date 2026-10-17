import { describe, expect, it } from "vitest";

import {
  REPLY_BY,
  REPLY_CLOSES_AT,
  repliesHaveClosed,
  repliesOpenForHousehold,
} from "@/config/rsvp";

const BEFORE = new Date("2026-10-09T10:00:00.000Z");
const AFTER = new Date("2026-10-20T10:00:00.000Z");

/**
 * The exception that lets a few people reply after the date on the invitation.
 *
 * It has to be exactly as strict as the global deadline everywhere it does not
 * apply, because the whole list depends on that date — and exactly as generous
 * where it does, or somebody is sent a link that opens a form the server then
 * refuses.
 */
describe("a household's reply window", () => {
  it("follows the global deadline when no extension is set", () => {
    expect(repliesOpenForHousehold(null, BEFORE)).toBe(true);
    expect(repliesOpenForHousehold(null, AFTER)).toBe(false);
    expect(repliesOpenForHousehold(undefined, AFTER)).toBe(false);
  });

  it("keeps a household open past the deadline while its window lasts", () => {
    const until = new Date("2026-11-07T00:00:00.000Z");
    expect(repliesOpenForHousehold(until, AFTER)).toBe(true);
  });

  it("closes itself once the window passes, with nothing to clean up", () => {
    const until = new Date("2026-10-18T00:00:00.000Z");
    expect(repliesOpenForHousehold(until, new Date("2026-10-17T23:59:00.000Z"))).toBe(true);
    expect(repliesOpenForHousehold(until, until)).toBe(false);
    expect(repliesOpenForHousehold(until, new Date("2026-10-19T00:00:00.000Z"))).toBe(false);
  });

  it("never shortens the window for everybody else", () => {
    // An extension already in the past must not close a link that the global
    // deadline still has open.
    const expired = new Date("2026-09-01T00:00:00.000Z");
    expect(repliesOpenForHousehold(expired, BEFORE)).toBe(true);
  });

  it("leaves the global deadline exactly where it was", () => {
    expect(repliesHaveClosed(REPLY_BY)).toBe(false);
    expect(repliesHaveClosed(new Date("2026-10-10T11:59:00.000Z"))).toBe(false);
    expect(repliesHaveClosed(REPLY_CLOSES_AT)).toBe(true);
  });
});
