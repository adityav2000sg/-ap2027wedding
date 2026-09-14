/**
 * When replies are due, and when they actually stop being accepted.
 *
 * One place, because three surfaces read it — the words on the invitation, the
 * countdown beside them, and the server that decides whether to take a reply.
 * A deadline shown in the page and not enforced on the server is decoration;
 * one enforced on the server and not shown is a trap. They have to be the same
 * fact.
 */

/** The date printed on the invitation. */
export const REPLY_BY = new Date("2026-10-09T00:00:00.000Z");

/** The same date in the words used everywhere it appears. */
export const REPLY_BY_LABEL = "9th October 2026";

/**
 * The instant replies stop being taken.
 *
 * Not midnight at the start of the 9th — "reply by the 9th" plainly includes
 * the 9th — and not midnight at the end of it in London either. This guest list
 * spans London, Delhi, Singapore, Dubai and Sydney, and telling somebody in
 * California that they are late while it is still the 9th where they are
 * standing is a small rudeness we can simply decline to commit.
 *
 * So: the end of the 9th of October in the last timezone on earth to finish it
 * (UTC−12). Everybody gets their whole day, and a few hours of grace besides.
 */
export const REPLY_CLOSES_AT = new Date("2026-10-10T12:00:00.000Z");

/** Whether the list has closed. Takes the clock as an argument so it can be tested. */
export function repliesHaveClosed(now: Date = new Date()): boolean {
  return now.getTime() >= REPLY_CLOSES_AT.getTime();
}
