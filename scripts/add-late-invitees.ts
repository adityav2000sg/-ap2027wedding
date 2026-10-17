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
 */
const GROUPS: { people: string[]; side: "BRIDE" | "GROOM" | "BOTH" }[] = [
  { people: ["Naimesh Choksi"], side: "GROOM" },
  { people: ["Sandeep Ghai", "Anu Ghai"], side: "GROOM" },
  { people: ["Nina Kohli", "Shiv Kohli", "Khyle Kohli", "Sai Kohli"], side: "GROOM" },
  { people: ["Simran Punjabi"], side: "GROOM" },
  { people: ["Manie Seehra", "Sue Seehra"], side: "GROOM" },
  { people: ["Ritu Kapoor", "Shumit Kapoor"], side: "GROOM" },
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
    `\n${apply ? "Adding" : "Would add"} ${GROUPS.length} groups, ` +
      `replies open to them until ${until.toISOString().slice(0, 10)}.\n`,
  );

  for (const group of GROUPS) {
    const name = householdName(group.people);

    // Match on the exact names given. Anybody already on the list keeps their
    // record — their notes, their dietary answer, their id — rather than being
    // duplicated beside themselves.
    const existing = await Promise.all(
      group.people.map(async (full) => {
        const { firstName, lastName } = splitName(full);
        return db.guest.findFirst({
          where: { weddingId: wedding.id, archivedAt: null, firstName, lastName },
          select: {
            id: true, firstName: true, lastName: true, tier: true,
            rsvpToken: true, householdId: true,
            household: { select: { name: true } },
          },
        });
      }),
    );

    const found = existing.filter((g) => g !== null);
    const missing = group.people.filter((_, i) => existing[i] === null);

    console.log(`  ${name}`);
    for (const [index, person] of group.people.entries()) {
      const match = existing[index];
      console.log(
        match
          ? `    reuse  ${person}` +
              ` (tier ${match.tier}${match.tier !== "A" ? " → A" : ""}` +
              `${match.rsvpToken ? ", personal link cleared" : ""}` +
              `${match.household?.name && match.household.name !== name ? `, moving from "${match.household.name}"` : ""})`
          : `    create ${person}`,
      );
    }

    if (!apply) {
      console.log("");
      continue;
    }

    // One household per group, found by the name this script builds, so a
    // second run lands on the same row rather than making another. Household
    // names are not unique in the schema, hence find-then-write rather than an
    // upsert.
    const already = await db.household.findFirst({
      where: { weddingId: wedding.id, name },
      select: { id: true },
    });

    const household = already
      ? await db.household.update({
          where: { id: already.id },
          data: { repliesOpenUntil: until, tier: "A", side: group.side },
          select: { id: true, name: true, rsvpToken: true },
        })
      : await db.household.create({
          data: {
            weddingId: wedding.id,
            name,
            side: group.side,
            tier: "A",
            repliesOpenUntil: until,
            // The same shape the seed issues: long, random, and never derived
            // from anything about the household.
            rsvpToken: randomUUID().replace(/-/g, "") + randomBytes(6).toString("hex"),
          },
          select: { id: true, name: true, rsvpToken: true },
        });

    for (const [index, person] of group.people.entries()) {
      const match = existing[index];
      const { firstName, lastName } = splitName(person);
      const shared = {
        householdId: household.id,
        tier: "A" as const,
        side: group.side,
        // A personal token would take them out of the group form. These six
        // answer together, so the group link has to speak for all of them.
        rsvpToken: null,
      };

      if (match) {
        await db.guest.update({ where: { id: match.id }, data: shared });
      } else {
        await db.guest.create({
          data: { weddingId: wedding.id, firstName, lastName, ...shared },
        });
      }
    }

    // The readable alias, which is the form every other link in this wedding
    // takes — a name somebody can read back over the phone, with the private
    // part still doing the work.
    console.log(
      `    link   ${CANONICAL_SITE_ORIGIN}${publicRsvpPath(household.name, household.rsvpToken)}`,
    );
    console.log("");
    void found;
    void missing;
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
