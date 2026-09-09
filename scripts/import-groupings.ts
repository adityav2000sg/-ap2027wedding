/**
 * Bring the groupings workbook across.
 *
 *   npx tsx scripts/import-groupings.ts            # dry run, changes nothing
 *   npx tsx scripts/import-groupings.ts --apply
 *
 * The sheet is one row per group: everybody on a row shares a room and gets one
 * invitation between them. It is also the definition of the A list — anybody on
 * it is invited, anybody not on it is not.
 *
 * Two things it must not touch:
 *
 *   Personal links. Eight couples share a room but each answer for themselves,
 *   and their private tokens were minted deliberately. Their grouping moves with
 *   everybody else's; their tokens are never written.
 *
 *   Anybody it cannot identify. The sheet is handwritten and the app's spelling
 *   came from a different list, so names disagree — "Shyam Pattni" against
 *   "Shyam Patni", a maiden name against a married one. Confident matches are
 *   made automatically and everything else is reported rather than guessed at,
 *   because guessing here moves a real person into a stranger's room.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";

const SOURCE =
  process.argv.find((a) => a.startsWith("--file="))?.slice(7) ??
  path.join(process.cwd(), "prisma", "data", "save-the-date-groupings.json");
const APPLY = process.argv.includes("--apply");

const norm = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase().replace(/[.'’]/g, "");

/** Edit distance, capped — only used to forgive a letter or two in a surname. */
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length][b.length];
}

interface Candidate {
  id: string;
  first: string;
  last: string;
  full: string;
  display: string;
  side: string;
  householdName: string | null;
  tier: string;
  hasPersonalLink: boolean;
}

interface Match {
  name: string;
  row: number;
  candidate: Candidate;
  how: string;
}

/**
 * Confirmed identities where the workbook intentionally uses a maiden name,
 * nickname, shortened name, or initials. These are explicit because a fuzzy
 * match is not safe enough to drive rooms and invitation links.
 */
const CONFIRMED_ALIASES: Record<string, string> = {
  "mary jane bercero bantoc": "mary jane bantoc",
  "swati shukla": "swati lamba",
  "vinit bharara": "vinnie bharara",
  ap: "anil parashar",
  kathryn: "katheryn",
};

/** The four children are present in the final workbook, but not the old list. */
const NEW_GUESTS: Record<
  string,
  { firstName: string; lastName: string; side: "GROOM"; relationship: string }
> = {
  "inaaya takiar": {
    firstName: "Inaaya",
    lastName: "Takiar",
    side: "GROOM",
    relationship: "Extended Family",
  },
  "amara takiar": {
    firstName: "Amara",
    lastName: "Takiar",
    side: "GROOM",
    relationship: "Extended Family",
  },
  "shaan batura": {
    firstName: "Shaan",
    lastName: "Batura",
    side: "GROOM",
    relationship: "Extended Family",
  },
  "maya batura": {
    firstName: "Maya",
    lastName: "Batura",
    side: "GROOM",
    relationship: "Extended Family",
  },
};

/** Duplicate exact names in the old master list, disambiguated by their side. */
const ROW_SIDE_OVERRIDES: Record<string, string> = {
  "32:sanjay anand": "BRIDE",
  "64:sanjay anand": "GROOM",
  "123:amay bham": "GROOM",
  "123:ashray bham": "GROOM",
};

export async function importSaveTheDateGroupings({
  prisma,
  source = SOURCE,
  apply = false,
}: {
  prisma: PrismaClient;
  source?: string;
  apply?: boolean;
}) {
  let groups: string[][];
  if (path.extname(source).toLowerCase() === ".json") {
    groups = JSON.parse(readFileSync(source, "utf8")) as string[][];
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(source);
    const sheet = workbook.worksheets[0];
    groups = [];
    sheet.eachRow((row) => {
      const cells = Array.isArray(row.values) ? row.values : [];
      const names = cells
        .slice(1)
        .map((value) =>
          value && typeof value === "object" && "text" in value ? String(value.text) : value,
        )
        .filter((value): value is string => typeof value === "string" && value.trim() !== "")
        .map((value) => value.trim());
      if (names.length > 0) groups.push(names);
    });
  }

  const guests = await prisma.guest.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      side: true,
      tier: true,
      rsvpToken: true,
      household: { select: { name: true } },
    },
  });

  const pool: Candidate[] = guests.map((guest) => ({
    id: guest.id,
    first: norm(guest.firstName),
    last: norm(guest.lastName),
    full: norm(`${guest.firstName} ${guest.lastName}`),
    display: `${guest.firstName} ${guest.lastName}`.trim(),
    side: guest.side,
    householdName: guest.household?.name ?? null,
    tier: guest.tier,
    hasPersonalLink: guest.rsvpToken !== null,
  }));

  for (const [full, guest] of Object.entries(NEW_GUESTS)) {
    if (pool.some((candidate) => candidate.full === full)) continue;
    pool.push({
      id: `new:${full}`,
      first: norm(guest.firstName),
      last: norm(guest.lastName),
      full,
      display: `${guest.firstName} ${guest.lastName}`.trim(),
      side: guest.side,
      householdName: null,
      tier: "A",
      hasPersonalLink: false,
    });
  }

  const byFull = new Map<string, Candidate[]>();
  for (const candidate of pool) {
    const list = byFull.get(candidate.full) ?? [];
    list.push(candidate);
    byFull.set(candidate.full, list);
  }
  const firstNameCount = new Map<string, number>();
  for (const candidate of pool) {
    firstNameCount.set(candidate.first, (firstNameCount.get(candidate.first) ?? 0) + 1);
  }

  const taken = new Set<string>();
  const matched: Match[] = [];
  const unmatched: { name: string; row: number }[] = [];

  groups.forEach((group, index) => {
    const row = index + 1;
    for (const name of group) {
      const key = norm(name);
      const parts = key.split(" ");
      const first = parts[0];
      const last = parts.slice(1).join(" ");

      // 1. A user-confirmed alias or the exact same name.
      const confirmedFull = CONFIRMED_ALIASES[key];
      const sideOverride = ROW_SIDE_OVERRIDES[`${row}:${key}`];
      const exact = [
        ...(byFull.get(confirmedFull ?? key) ?? []),
        ...(confirmedFull && confirmedFull !== key ? (byFull.get(key) ?? []) : []),
      ];
      let hit = exact.find(
        (candidate) =>
          !taken.has(candidate.id) &&
          (!sideOverride || candidate.side === sideOverride),
      );
      let how = "exact";

      if (hit && confirmedFull && hit.full !== key) how = "confirmed alias";
      if (hit && sideOverride) how = "same-name person, confirmed by side";

      // 2. The same first name and a surname a letter or two out — Patni for
      //    Pattni, Jareth for Jerath.
      if (!hit || taken.has(hit.id)) {
        const near = pool.filter(
          (c) =>
            !taken.has(c.id) &&
            c.first === first &&
            last !== "" &&
            c.last !== "" &&
            distance(c.last, last) <= 2,
        );
        if (near.length === 1) {
          hit = near[0];
          how = "surname within two letters";
        }
      }

      // 3. The same first name, and only one person in the whole list has it —
      //    a maiden name against a married one, or a name given without one.
      if (!hit || taken.has(hit.id)) {
        const sameFirst = pool.filter((c) => !taken.has(c.id) && c.first === first);
        if (sameFirst.length === 1 && firstNameCount.get(first) === 1) {
          hit = sameFirst[0];
          how = last === "" ? "only one of that first name" : "different surname, unique first name";
        }
      }

      if (hit && !taken.has(hit.id)) {
        taken.add(hit.id);
        matched.push({ name, row, candidate: hit, how });
      } else {
        unmatched.push({ name, row });
      }
    }
  });

  const onTheSheet = new Set(matched.map((m) => m.candidate.id));
  const droppedFromA = pool.filter((c) => c.tier === "A" && !onTheSheet.has(c.id));
  const addedToA = matched.filter((m) => m.candidate.tier !== "A");
  const newGuests = matched.filter((m) => m.candidate.id.startsWith("new:"));

  console.log(`Source: ${groups.length} groups, ${groups.flat().length} people.`);
  console.log(`Matched ${matched.length}. Unmatched ${unmatched.length}.`);

  const fuzzy = matched.filter((m) => m.how !== "exact");
  if (fuzzy.length > 0) {
    console.log(`\nMatched by judgement (${fuzzy.length}) — check these:`);
    for (const m of fuzzy) {
      console.log(`  "${m.name}" → ${m.candidate.full} [${m.how}]`);
    }
  }

  if (unmatched.length > 0) {
    console.log(`\nNot found in the guest list (${unmatched.length}) — nothing done for these:`);
    for (const u of unmatched) console.log(`  row ${u.row}: ${u.name}`);
  }

  if (droppedFromA.length > 0) {
    console.log(`\nOn tier A today but not on the sheet (${droppedFromA.length}):`);
    for (const c of droppedFromA) console.log(`  ${c.full}${c.hasPersonalLink ? " (has a personal link)" : ""}`);
  }

  if (addedToA.length > 0) {
    console.log(`\nWould join tier A (${addedToA.length}):`);
    for (const m of addedToA) console.log(`  ${m.candidate.full} (tier ${m.candidate.tier} today)`);
  }

  if (newGuests.length > 0) {
    console.log(`\nWould add ${newGuests.length} guests from the workbook:`);
    for (const match of newGuests) console.log(`  row ${match.row}: ${match.name}`);
  }

  // Regrouping: how many people would change household.
  const moves: string[] = [];
  groups.forEach((group, index) => {
    const row = index + 1;
    const members = matched.filter((match) => match.row === row);
    const households = new Set(members.map((m) => m.candidate.householdName ?? "—"));
    if (households.size > 1) {
      moves.push(
        `  row ${index + 1}: ${members.map((m) => m.candidate.full).join(", ")} — currently in ${[...households].join(" / ")}`,
      );
    }
  });
  if (moves.length > 0) {
    console.log(`\nRows whose people are spread across different groups today (${moves.length}):`);
    console.log(moves.join("\n"));
  }

  if (!apply) {
    console.log("\nDry run. Nothing was written. Re-run with --apply to make these changes.");
    return;
  }

  console.log("\nApplying…");
  await prisma.$transaction(async (tx) => {
    const wedding = await tx.wedding.findFirstOrThrow({ select: { id: true } });
    const events = await tx.event.findMany({
      where: { weddingId: wedding.id },
      select: { id: true },
    });

    const resolvedIds = new Map<string, string>();
    for (const match of newGuests) {
      const guest = NEW_GUESTS[match.candidate.full];
      const existing = await tx.guest.findFirst({
        where: {
          weddingId: wedding.id,
          firstName: guest.firstName,
          lastName: guest.lastName,
          archivedAt: null,
        },
        select: { id: true },
      });
      const created =
        existing ??
        (await tx.guest.create({
          data: {
            weddingId: wedding.id,
            firstName: guest.firstName,
            lastName: guest.lastName,
            side: guest.side,
            relationship: guest.relationship,
            isChild: true,
            tier: "A",
            attendanceScore: 3,
            needsAccommodation: true,
            needsTransport: true,
          },
          select: { id: true },
        }));
      resolvedIds.set(match.candidate.id, created.id);
    }

    if (events.length > 0) {
      const children = await tx.guest.findMany({
        where: {
          weddingId: wedding.id,
          archivedAt: null,
          OR: Object.values(NEW_GUESTS).map((guest) => ({
            firstName: guest.firstName,
            lastName: guest.lastName,
          })),
        },
        select: { id: true },
      });
      await tx.eventInvitation.createMany({
        data: children.flatMap((child) =>
          events.map((event) => ({
            guestId: child.id,
            eventId: event.id,
            status: "PENDING" as const,
          })),
        ),
        skipDuplicates: true,
      });
    }

    const idOf = (candidate: Candidate) => resolvedIds.get(candidate.id) ?? candidate.id;
    const resolvedOnTheSheet = matched.map((match) => idOf(match.candidate));

    // Tier follows the sheet exactly: on it means A, off it means held back.
    await tx.guest.updateMany({
      where: { weddingId: wedding.id, id: { in: resolvedOnTheSheet } },
      data: { tier: "A" },
    });
    await tx.guest.updateMany({
      where: {
        weddingId: wedding.id,
        tier: "A",
        archivedAt: null,
        id: { notIn: resolvedOnTheSheet },
      },
      data: { tier: "B" },
    });

    // One row, one household — which is one room and one invitation. Personal
    // links are never touched; they hang off the guest, not the group.
    for (const [index] of groups.entries()) {
      const members = matched.filter((match) => match.row === index + 1);
      if (members.length === 0) continue;

      const memberIds = members.map((member) => idOf(member.candidate));
      const name = members.map((member) => member.candidate.display).join(" & ");

      // Reuse a household only when its membership is exactly this row. Name
      // equality is not identity: the workbook contains several unrelated
      // Chowdhry, Anand, Mehan, Ahuja, and Lamba rows.
      const candidates = await tx.household.findMany({
        where: { weddingId: wedding.id, guests: { some: { id: { in: memberIds } } } },
        select: { id: true, guests: { where: { archivedAt: null }, select: { id: true } } },
      });
      const wanted = new Set(memberIds);
      const existing = candidates.find(
        (household) =>
          household.guests.length === wanted.size &&
          household.guests.every((guest) => wanted.has(guest.id)),
      );
      const household =
        (existing
          ? await tx.household.update({
              where: { id: existing.id },
              data: { name, tier: "A" },
              select: { id: true },
            })
          : null) ??
        (await tx.household.create({
          data: {
            weddingId: wedding.id,
            name,
            side: "BOTH",
            tier: "A",
            // Unguessable, and never derived from an id — the same rule the
            // app uses when it mints one.
            rsvpToken: randomUUID().replace(/-/g, "") + randomBytes(6).toString("hex"),
          },
          select: { id: true },
        }));

      await tx.guest.updateMany({
        where: { id: { in: memberIds } },
        data: { householdId: household.id },
      });

      if (index === 0) console.log("  regrouping…");
    }

    await tx.guest.updateMany({
      where: { weddingId: wedding.id, firstName: "Vinnie", lastName: "Bharara" },
      data: { firstName: "Vinit" },
    });

    // Households nobody is in any more.
    const empty = await tx.household.findMany({
      where: { weddingId: wedding.id, guests: { none: {} } },
      select: { id: true, name: true },
    });
    if (empty.length > 0) {
      await tx.household.deleteMany({ where: { id: { in: empty.map((h) => h.id) } } });
      console.log(`  removed ${empty.length} empty groups`);
    }
  });

  console.log("Done.");
}

if (path.basename(process.argv[1] ?? "") === "import-groupings.ts") {
  const cliDb = new PrismaClient();
  importSaveTheDateGroupings({ prisma: cliDb, source: SOURCE, apply: APPLY })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => cliDb.$disconnect());
}
