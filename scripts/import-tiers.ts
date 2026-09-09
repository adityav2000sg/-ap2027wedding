/**
 * Bring the tier and attendance score across from the original guest list.
 *
 *   npm run import:tiers            # dry run
 *   npm run import:tiers -- --apply
 *
 * Reads prisma/data/wedding-import.json, which is committed and therefore
 * present wherever the app runs — the spreadsheet it came from only exists on
 * one laptop, which is no use on a deploy. Both fields were in that file the
 * whole time; the seed simply never read them.
 *
 * Pass --file "…/Wedding Plan.xlsx" to re-read a newer spreadsheet instead.
 *
 * The guest list was imported without either, so every one of the 267 people
 * ended up on tier A with no likelihood attached — which is why the app reports
 * 259 expected guests when the spreadsheet's own weighted figure is about 220.
 *
 * Matches on full name. Refuses on a duplicate name rather than guessing, and
 * reports anyone it couldn't place instead of silently skipping them.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const db = new PrismaClient();

/** The scale used on the sheet, and what each step means in practice. */
const SCORE_TO_PROBABILITY: Record<number, number> = {
  1: 0.1,
  2: 0.25,
  3: 0.75,
  4: 0.95,
  5: 1.0,
};

interface SheetRow {
  name: string;
  tier: "A" | "B" | "C";
  score: number | null;
}

/** The committed import — the same data, minus the dependency on a local file. */
function readImportFile(): SheetRow[] {
  const path = new URL("../prisma/data/wedding-import.json", import.meta.url);
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    guests?: {
      tier?: string;
      firstName?: string;
      lastName?: string;
      probabilityScore?: number | null;
    }[];
  };

  const rows: SheetRow[] = [];
  for (const guest of data.guests ?? []) {
    const tier = String(guest.tier ?? "").trim().toUpperCase();
    const name = `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim();
    if (!name || !["A", "B", "C"].includes(tier)) continue;

    const score = Number(guest.probabilityScore);
    rows.push({
      name,
      tier: tier as "A" | "B" | "C",
      score: Number.isFinite(score) && score > 0 ? Math.round(score) : null,
    });
  }
  return rows;
}

async function readSheet(file: string): Promise<SheetRow[]> {
  // Imported lazily so the script only needs the dependency when actually run.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  // Node's Buffer and the one exceljs's types expect disagree across versions;
  // the bytes are identical either way.
  await workbook.xlsx.load(readFileSync(file) as never);

  const sheet = workbook.getWorksheet("Guest List");
  if (!sheet) throw new Error('No "Guest List" sheet in that file.');

  const rows: SheetRow[] = [];
  sheet.eachRow((row, index) => {
    if (index < 4) return; // headers and title
    // Cells can hold a formula object rather than a value; "Full Name" is one,
    // so the name is rebuilt from the plain first and last name columns.
    const plain = (value: unknown): string => {
      if (value === null || value === undefined) return "";
      if (typeof value === "object" && value !== null && "result" in value) {
        return String((value as { result?: unknown }).result ?? "").trim();
      }
      return String(value).trim();
    };

    const tier = plain(row.getCell(1).value).toUpperCase();
    const name = `${plain(row.getCell(3).value)} ${plain(row.getCell(4).value)}`.trim();
    const rawScore = row.getCell(10).value;
    if (!name || !["A", "B", "C"].includes(tier)) return;

    const score = Number(plain(rawScore));
    rows.push({
      name,
      tier: tier as "A" | "B" | "C",
      score: Number.isFinite(score) && score > 0 ? Math.round(score) : null,
    });
  });

  return rows;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const fileIndex = process.argv.indexOf("--file");
  const explicitFile = fileIndex === -1 ? null : process.argv[fileIndex + 1];

  const sheetRows = explicitFile
    ? await readSheet(explicitFile)
    : readImportFile();

  console.log(
    explicitFile
      ? `\nReading ${explicitFile}`
      : "\nReading prisma/data/wedding-import.json",
  );
  const guests = await db.guest.findMany({
    where: { archivedAt: null },
    select: { id: true, firstName: true, lastName: true, tier: true, attendanceScore: true },
  });

  const byName = new Map<string, typeof guests>();
  for (const guest of guests) {
    const key = `${guest.firstName} ${guest.lastName}`.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), guest]);
  }

  const planned: { id: string; name: string; tier: string; score: number | null }[] = [];
  const problems: string[] = [];

  for (const row of sheetRows) {
    const matches = byName.get(row.name.toLowerCase()) ?? [];
    if (matches.length === 0) {
      problems.push(`No guest called "${row.name}".`);
      continue;
    }
    if (matches.length > 1) {
      problems.push(`"${row.name}" matches ${matches.length} guests — too ambiguous.`);
      continue;
    }

    const guest = matches[0];
    if (guest.tier === row.tier && guest.attendanceScore === row.score) continue;
    planned.push({ id: guest.id, name: row.name, tier: row.tier, score: row.score });
  }

  const unmatched = guests.filter(
    (g) => !sheetRows.some((r) => r.name.toLowerCase() === `${g.firstName} ${g.lastName}`.trim().toLowerCase()),
  );

  if (problems.length > 0) {
    console.log(`\n${problems.length} row(s) in the sheet had no clear match:\n`);
    for (const problem of problems.slice(0, 12)) console.log(`   ${problem}`);
    if (problems.length > 12) console.log(`   …and ${problems.length - 12} more.`);
  }
  if (unmatched.length > 0) {
    console.log(`\n${unmatched.length} guest(s) in the app aren't in the sheet — left as they are:\n`);
    for (const g of unmatched.slice(0, 8)) console.log(`   ${g.firstName} ${g.lastName}`);
    if (unmatched.length > 8) console.log(`   …and ${unmatched.length - 8} more.`);
  }

  if (planned.length === 0) {
    console.log("\n✓ Tiers and scores already match the sheet.\n");
    return;
  }

  const byTier = planned.reduce<Record<string, number>>((acc, p) => {
    acc[p.tier] = (acc[p.tier] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\n${apply ? "Updated" : "Would update"} ${planned.length} guest(s):\n`);
  for (const [tier, count] of Object.entries(byTier).sort()) {
    console.log(`   Tier ${tier}: ${count}`);
  }

  if (apply) {
    // One transaction: a half-applied tier list would misreport every headline
    // number on the home page.
    await db.$transaction(
      planned.map((p) =>
        db.guest.update({
          where: { id: p.id },
          data: { tier: p.tier as "A" | "B" | "C", attendanceScore: p.score },
        }),
      ),
    );
  }

  // What the app will now report, so it can be checked against the sheet.
  const after = apply
    ? await db.guest.findMany({
        where: { archivedAt: null },
        select: { tier: true, attendanceScore: true },
      })
    : null;

  if (after) {
    const invited = after.filter((g) => g.tier === "A" || g.tier === "B");
    const tierA = after.filter((g) => g.tier === "A");
    const weighted = (list: typeof after) =>
      list.reduce((sum, g) => sum + (SCORE_TO_PROBABILITY[g.attendanceScore ?? 5] ?? 1), 0);

    console.log("\n   Tier A invited:      " + tierA.length);
    console.log("   Tier A expected:     " + weighted(tierA).toFixed(1));
    console.log("   Tier A+B invited:    " + invited.length);
    console.log("   Tier A+B expected:   " + weighted(invited).toFixed(1));
  }

  console.log(apply ? "\n✓ Done.\n" : "\nDry run. Re-run with --apply to write.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
