/**
 * Untangle households that the spreadsheet import merged by surname.
 *
 *   npm run fix:households            # dry run
 *   npm run fix:households -- --apply
 *   npm run fix:households -- --apply --force   # once links have gone out
 *
 * Three records each held two unrelated families who happen to share a name —
 * Abrol, Jain and Singh — and one held two different sets of Ahujas. Merged like
 * that they'd get one invitation between them, and worse, a single RSVP reply
 * cascades to everyone in a household, so one family answering yes would have
 * marked the other family confirmed.
 *
 * Each of these is a couple invited on their own, so each becomes its own
 * household named for the pair.
 *
 * The first group in each split keeps the original record — and with it the RSVP
 * token, the send history and anything already recorded against it. The rest are
 * created fresh.
 *
 * Idempotent: re-running checks what's already true and does nothing.
 */

import { randomBytes, randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

interface Split {
  /** The household as it stands today. */
  from: string;
  /** First group keeps the original record; the rest are new. */
  into: { name: string; members: string[] }[];
}

const SPLITS: Split[] = [
  {
    from: "Abrol",
    into: [
      { name: "Manav & Mona Abrol", members: ["Manav", "Mona"] },
      { name: "Sunil & Neelam Abrol", members: ["Sunil", "Neelam"] },
    ],
  },
  {
    from: "Jain",
    into: [
      { name: "Anu & Rajeev Jain", members: ["Anu", "Rajeev"] },
      { name: "Angela & Mahesh Jain", members: ["Angela", "Mahesh"] },
    ],
  },
  {
    from: "Singh",
    into: [
      { name: "Sunita & Vicky Singh", members: ["Sunita", "Vicky"] },
      { name: "Kamaljit & Josh Singh", members: ["Kamaljit", "Josh"] },
      { name: "Reuben & Baani Singh", members: ["Reuben", "Baani"] },
    ],
  },
  {
    from: "Ahuja",
    into: [
      // Anil's household keeps the plain name; Alpana and Sonny are a different
      // set of Ahujas and get their own.
      { name: "Ahuja", members: ["Anil", "Latika", "Arshia", "Harsh"] },
      { name: "Alpana & Sonny Ahuja", members: ["Alpana", "Sonny"] },
    ],
  },
];

/**
 * The prefix records which larger family they're connected to; the household's
 * own name is the second half. Bateman-Roxanis is a double-barrelled surname
 * rather than a link, so it keeps both parts.
 */
const RENAMES: Record<string, string> = {
  "Ahuja- Bansal": "Bansal",
  "Ahuja- Bhatia": "Bhatia",
  "Singh- Desai": "Desai",
  "Chowdhry- Minocha": "Minocha",
  "Bateman- Roxanis": "Bateman-Roxanis",
};

function newRsvpToken(): string {
  return randomUUID().replace(/-/g, "") + randomBytes(6).toString("hex");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const planned: string[] = [];
  const problems: string[] = [];

  // Splitting a household gives the people who move a brand-new link. If the
  // old one has already gone out, theirs silently stops speaking for them: the
  // token still resolves, to a household they are no longer in, and they get a
  // page with somebody else's names on it or none at all.
  //
  // The outreach state is carried across below, so the app will go on claiming
  // they were written to. That is exactly the combination nobody notices.
  const alreadyOut = await db.household.findMany({
    where: {
      name: { in: SPLITS.map((split) => split.from) },
      OR: [
        { saveTheDateSentAt: { not: null } },
        { rsvpSentAt: { not: null } },
        { stdRepliedAt: { not: null } },
        { rsvpRepliedAt: { not: null } },
        { guests: { some: { stdResponse: { not: null }, archivedAt: null } } },
      ],
    },
    select: { name: true, saveTheDateSentAt: true, rsvpSentAt: true },
  });

  if (alreadyOut.length > 0 && !force) {
    console.error(
      `\n✗ ${alreadyOut.length} of these households have already been sent a link:\n`,
    );
    for (const household of alreadyOut) {
      console.error(
        `   ${household.name} — ${household.saveTheDateSentAt ? "save-the-date" : "invitation"} already sent`,
      );
    }
    console.error(
      "\nSplitting them issues new links to whoever moves, and the link they were\n" +
        "given stops answering for them. Re-send the new links by hand afterwards,\n" +
        "then re-run `npm run rsvp:audit`.\n\n" +
        "Re-run with --force once you have read that.\n",
    );
    process.exitCode = 1;
    return;
  }

  // ── Splits ──────────────────────────────────────────────────────────────
  for (const split of SPLITS) {
    const household = await db.household.findFirst({
      where: { name: split.from },
      include: { guests: { where: { archivedAt: null } } },
    });

    if (!household) {
      // Already split on a previous run, or renamed by hand.
      const done = await db.household.findFirst({ where: { name: split.into[0].name } });
      if (!done) problems.push(`No household called "${split.from}".`);
      continue;
    }

    const named = split.into.flatMap((g) => g.members);
    const unaccounted = household.guests.filter((g) => !named.includes(g.firstName));
    if (unaccounted.length > 0) {
      problems.push(
        `"${split.from}" also contains ${unaccounted.map((g) => g.firstName).join(", ")}, ` +
        `who aren't in any of the groups — refusing to split it and leave them behind.`,
      );
      continue;
    }

    for (const [index, group] of split.into.entries()) {
      const members = household.guests.filter((g) => group.members.includes(g.firstName));
      const missing = group.members.filter(
        (name) => !household.guests.some((g) => g.firstName === name),
      );
      if (missing.length > 0) {
        problems.push(`"${split.from}" has no ${missing.join(", ")}.`);
        continue;
      }

      // The household's side follows its members, since the whole reason these
      // were wrong is that one record spanned both.
      const sides = new Set(members.map((m) => m.side));
      const side = sides.size === 1 ? [...sides][0] : "BOTH";

      if (index === 0) {
        if (household.name === group.name && household.side === side) continue;
        planned.push(`Keep ${group.members.join(" and ")} as "${group.name}" (${side}).`);
        if (apply) {
          await db.household.update({
            where: { id: household.id },
            data: { name: group.name, side },
          });
        }
        continue;
      }

      planned.push(
        `Move ${group.members.join(" and ")} out of "${split.from}" into a new "${group.name}" (${side}).`,
      );
      if (apply) {
        const created = await db.household.create({
          data: {
            weddingId: household.weddingId,
            name: group.name,
            side,
            relationship: household.relationship,
            city: household.city,
            country: household.country,
            rsvpToken: newRsvpToken(),
            // Carry the outreach state across, so a split doesn't quietly
            // un-send a save-the-date somebody has already had.
            invitationStatus: household.invitationStatus,
            saveTheDateSentAt: household.saveTheDateSentAt,
            rsvpSentAt: household.rsvpSentAt,
            rsvpReply: household.rsvpReply,
            rsvpRepliedAt: household.rsvpRepliedAt,
            tier: household.tier,
          },
          select: { id: true },
        });
        await db.guest.updateMany({
          where: { id: { in: members.map((m) => m.id) } },
          data: { householdId: created.id },
        });
      }
    }
  }

  // ── Renames ─────────────────────────────────────────────────────────────
  for (const [from, to] of Object.entries(RENAMES)) {
    const household = await db.household.findFirst({ where: { name: from } });
    if (!household) continue; // already done

    const clash = await db.household.findFirst({
      where: { name: to, id: { not: household.id } },
    });
    if (clash) {
      problems.push(`Can't rename "${from}" to "${to}" — a household already has that name.`);
      continue;
    }

    planned.push(`Rename "${from}" to "${to}".`);
    if (apply) {
      await db.household.update({ where: { id: household.id }, data: { name: to } });
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────
  if (problems.length > 0) {
    console.error("\n✗ Problems:\n");
    for (const problem of problems) console.error(`   ${problem}`);
  }

  if (planned.length === 0) {
    console.log("\n✓ Nothing to change — already applied.\n");
    return;
  }

  console.log(`\n${apply ? "Applied" : "Would apply"}:\n`);
  for (const line of planned) console.log(`   ${line}`);
  console.log(apply ? "\n✓ Done.\n" : "\nDry run. Re-run with --apply to write.\n");

  if (problems.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
