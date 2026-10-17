/**
 * Six families invited after the list closed.
 *
 *   npm run invitees:late                       # dry run — says what it would do
 *   npm run invitees:late -- --apply            # do it, and print the links
 *   npm run invitees:late -- --until 2026-11-30 # a different closing date
 *
 * The date on the invitation has passed and the links everybody else holds now
 * open onto a "replies have closed" page. These six need working links anyway,
 * so each household is given its own reply window — see `repliesOpenUntil` —
 * which keeps their link alone live and leaves the deadline standing for the
 * other 249.
 *
 * Three things have to be true for a group link to work at save-the-date
 * stage, and all three are easy to miss on their own:
 *
 *   1. The household's window is open. Otherwise: the closed page.
 *   2. Everybody in it is tier A. A household link speaks for tier A only —
 *      see `rsvpAudience` — so a tier B family opens a form with nobody on it.
 *   3. Nobody in it holds a personal token. A guest with their own link is
 *      deliberately excluded from the group one, so the group form would skip
 *      them silently.
 *
 * Idempotent: people already on the list are matched by name and reused rather
 * than duplicated, and running it twice changes nothing the second time.
 */

import { randomBytes, randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { CANONICAL_SITE_ORIGIN } from "../src/config/site";
import { publicRsvpPath } from "../src/lib/rsvp-links";

const db = new PrismaClient();

/**
 * The groups, exactly as they were given, and exactly as they will be asked.
 *
 * One entry here is one link and one form. The Kohlis answer together on one
 * page with four names on it; Naimesh answers for himself. Splitting or
 * merging these is the difference between a family filling in one form and
 * four people each wondering whether somebody else already did it.
 *
 * Whose list they are on is deliberately absent. Three of these six are on the
 * bride's and three on the groom's, that is already recorded against them, and
 * a script about reply windows has no business overwriting it with a guess.
 */
const GROUPS: { people: string[] }[] = [
  { people: ["Naimesh Choksi"] },
  { people: ["Sandeep Ghai", "Anu Ghai"] },
  { people: ["Nina Kohli", "Shiv Kohli", "Khyle Kohli", "Sai Kohli"] },
  { people: ["Simran Punjabi"] },
  { people: ["Manie Seehra", "Sue Seehra"] },
  { people: ["Ritu Kapoor", "Shumit Kapoor"] },
];

/** Default close for these six. Overridden with --until. */
const DEFAULT_UNTIL = "2026-11-30";

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** The convention the rest of the list already uses: every name, joined. */
function householdName(people: string[]): string {
  return people.join(" & ");
}

function parseUntil(): Date {
  const flag = process.argv.indexOf("--until");
  const raw = flag >= 0 ? process.argv[flag + 1] : DEFAULT_UNTIL;
  const parsed = new Date(`${raw}T23:59:59.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`--until wants a date like 2026-11-30, not "${raw}".`);
  }
  return parsed;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const until = parseUntil();

  const wedding = await db.wedding.findFirstOrThrow({ select: { id: true } });

  console.log(
    `\n${apply ? "Opening" : "Would open"} replies for ${GROUPS.length} groups ` +
      `until ${until.toISOString().slice(0, 10)}.\n`,
  );

  for (const group of GROUPS) {
    const wanted = householdName(group.people);
    console.log(`  ${wanted}`);

    const people = await Promise.all(
      group.people.map(async (full) => {
        const { firstName, lastName } = splitName(full);
        const guest = await db.guest.findFirst({
          where: { weddingId: wedding.id, archivedAt: null, firstName, lastName },
          select: {
            id: true, tier: true, rsvpToken: true, stdResponse: true, householdId: true,
            household: {
              select: {
                id: true, name: true, rsvpToken: true, saveTheDateSentAt: true,
                _count: { select: { guests: { where: { archivedAt: null } } } },
              },
            },
          },
        });
        return { full, guest };
      }),
    );

    const missing = people.filter((p) => !p.guest);
    if (missing.length === group.people.length) {
      console.log(`    nobody here is on the list yet — add them in the portal first\n`);
      continue;
    }

    /**
     * Which existing household this group should settle in.
     *
     * Never a new one. Every household here has already had its link sent, and
     * a new household means a new token — which is a link somebody already has
     * quietly ceasing to work. So the group moves to whichever household
     * already holds it, and the others are left exactly as they are.
     *
     * Most of the group wins. Where two hold the same number — Sandeep in one
     * "Ghai" and Anu in another — the tidier one wins: the household where our
     * people are most of who lives there, because moving into it disturbs the
     * fewest other replies.
     */
    const candidates = new Map<string, { id: string; name: string; rsvpToken: string; sent: boolean; mine: number; total: number }>();
    for (const { guest } of people) {
      if (!guest?.household) continue;
      const seen = candidates.get(guest.household.id);
      if (seen) {
        seen.mine += 1;
        continue;
      }
      candidates.set(guest.household.id, {
        id: guest.household.id,
        name: guest.household.name,
        rsvpToken: guest.household.rsvpToken,
        sent: guest.household.saveTheDateSentAt !== null,
        mine: 1,
        total: guest.household._count.guests,
      });
    }

    const anchor = [...candidates.values()].sort(
      (a, b) => b.mine - a.mine || b.mine / b.total - a.mine / a.total,
    )[0];

    for (const { full, guest } of people) {
      if (!guest) {
        console.log(`    MISSING  ${full} — not on the list, add in the portal`);
        continue;
      }
      const moving = guest.householdId !== anchor.id;
      const notes = [
        guest.tier !== "A" ? "tier → A" : null,
        guest.rsvpToken ? "personal link cleared" : null,
        moving ? `moving from "${guest.household?.name}"` : null,
        guest.stdResponse ? `already replied ${guest.stdResponse}` : null,
      ].filter(Boolean);
      console.log(`    ${moving ? "move " : "keep "}  ${full}${notes.length ? ` (${notes.join(", ")})` : ""}`);
    }

    if (apply) {
      await db.household.update({
        where: { id: anchor.id },
        data: { repliesOpenUntil: until, tier: "A", name: wanted },
      });
      for (const { guest } of people) {
        if (!guest) continue;
        await db.guest.update({
          where: { id: guest.id },
          data: { householdId: anchor.id, tier: "A", rsvpToken: null },
        });
      }
    }

    // The token is untouched, so this is the link they already have — the name
    // in it is decoration, and the address resolves on the code at the end.
    console.log(
      `    link   ${CANONICAL_SITE_ORIGIN}${publicRsvpPath(wanted, anchor.rsvpToken)}`,
    );
    if (anchor.name !== wanted) {
      console.log(`    (household renamed from "${anchor.name}" — the old link still works)`);
    }
    console.log("");
  }

  if (!apply) {
    console.log("Dry run — nothing written. Re-run with --apply.\n");
    return;
  }

  console.log("Done. Every other household keeps the original deadline.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
