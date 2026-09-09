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

import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";

const db = new PrismaClient();

const SHEET =
  process.argv.find((a) => a.startsWith("--file="))?.slice(7) ??
  "/Users/adityavaidya/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/FFEBA71D-7890-4BD0-A3AE-8C638528EB80/Groupings.xlsx";
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
  householdName: string | null;
  tier: string;
  hasPersonalLink: boolean;
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SHEET);
  const sheet = workbook.worksheets[0];

  const groups: string[][] = [];
  sheet.eachRow((row) => {
    const names = row.values
      .slice(1)
      .map((value) => (value && typeof value === "object" && "text" in value ? String(value.text) : value))
      .filter((value): value is string => typeof value === "string" && value.trim() !== "")
      .map((value) => value.trim());
    if (names.length > 0) groups.push(names);
  });

  const guests = await db.guest.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
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
    householdName: guest.household?.name ?? null,
    tier: guest.tier,
    hasPersonalLink: guest.rsvpToken !== null,
  }));

  const byFull = new Map(pool.map((c) => [c.full, c]));
  const firstNameCount = new Map<string, number>();
  for (const candidate of pool) {
    firstNameCount.set(candidate.first, (firstNameCount.get(candidate.first) ?? 0) + 1);
  }

  const taken = new Set<string>();
  const matched: { name: string; candidate: Candidate; how: string }[] = [];
  const unmatched: { name: string; row: number }[] = [];

  groups.forEach((group, index) => {
    for (const name of group) {
      const key = norm(name);
      const parts = key.split(" ");
      const first = parts[0];
      const last = parts.slice(1).join(" ");

      // 1. The same name, spelled the same way.
      let hit = byFull.get(key);
      let how = "exact";

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
        matched.push({ name, candidate: hit, how });
      } else {
        unmatched.push({ name, row: index + 1 });
      }
    }
  });

  const onTheSheet = new Set(matched.map((m) => m.candidate.id));
  const droppedFromA = pool.filter((c) => c.tier === "A" && !onTheSheet.has(c.id));
  const addedToA = matched.filter((m) => m.candidate.tier !== "A");

  console.log(`Sheet: ${groups.length} groups, ${groups.flat().length} people.`);
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

  // Regrouping: how many people would change household.
  const moves: string[] = [];
  groups.forEach((group, index) => {
    const members = group
      .map((name) => matched.find((m) => m.name === name && group.includes(m.name)))
      .filter((m): m is (typeof matched)[number] => Boolean(m));
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

  if (!APPLY) {
    console.log("\nDry run. Nothing was written. Re-run with --apply to make these changes.");
    await db.$disconnect();
    return;
  }

  console.log("\nApplying…");
  await db.$transaction(async (tx) => {
    const wedding = await tx.wedding.findFirstOrThrow({ select: { id: true } });

    // Tier follows the sheet exactly: on it means A, off it means held back.
    await tx.guest.updateMany({
      where: { weddingId: wedding.id, id: { in: [...onTheSheet] } },
      data: { tier: "A" },
    });
    await tx.guest.updateMany({
      where: {
        weddingId: wedding.id,
        tier: "A",
        archivedAt: null,
        id: { notIn: [...onTheSheet] },
      },
      data: { tier: "B" },
    });

    // One row, one household — which is one room and one invitation. Personal
    // links are never touched; they hang off the guest, not the group.
    for (const [index, group] of groups.entries()) {
      const members = group
        .map((name) => matched.find((m) => m.name === name))
        .filter((m): m is (typeof matched)[number] => Boolean(m));
      if (members.length === 0) continue;

      const surnames = members.map((m) => m.candidate.last).filter(Boolean);
      const name =
        new Set(surnames).size === 1 && surnames.length > 0
          ? members[0].candidate.last.replace(/\b\w/g, (c) => c.toUpperCase())
          : members
              .map((m) => m.candidate.full.replace(/\b\w/g, (c) => c.toUpperCase()))
              .join(" & ");

      const existing = await tx.household.findFirst({
        where: { weddingId: wedding.id, name },
        select: { id: true },
      });
      const household =
        existing ??
        (await tx.household.create({
          data: { weddingId: wedding.id, name, side: "BOTH", tier: "A" },
          select: { id: true },
        }));

      await tx.guest.updateMany({
        where: { id: { in: members.map((m) => m.candidate.id) } },
        data: { householdId: household.id },
      });

      if (index === 0) console.log("  regrouping…");
    }

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
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
