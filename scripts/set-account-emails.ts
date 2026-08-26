/**
 * Point the nine family accounts at their real email addresses.
 *
 *   npm run accounts:emails            # dry run — shows what would change
 *   npm run accounts:emails -- --apply # actually writes
 *
 * Safe to run against production:
 *   - matches on the member's name, never on a hardcoded id
 *   - updates only the email column; nothing is deleted, nothing is created
 *   - idempotent, so re-running is a no-op
 *   - refuses if a name is ambiguous or an address already belongs elsewhere
 *
 * This exists instead of re-seeding because seeding drops the wedding.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Keyed by the name as stored on the User row. */
const EMAILS: Record<string, string> = {
  "Avantika Chowdhry": "avantika.chowdhry@gmail.com",
  "Prateek Mehan": "prateek.mehan98@gmail.com",
  "Namrita Chowdhry": "namrita.chowdhry@gmail.com",
  "Dheeraj Chowdhry": "dheeraj.chowdhry@gmail.com",
  "Preeti Mehan": "preeti.mehan1975@gmail.com",
  "Ajay Mehan": "ajaymehan@hotmail.com",
  "Anousha Chowdhry": "chowdhry.anousha@gmail.com",
  "Trisha Mehan": "trisha.mehan95@gmail.com",
  "Aditya Vaidya": "adityavaidya2000@gmail.com",
};

async function main() {
  const apply = process.argv.includes("--apply");

  const users = await db.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  const planned: { id: string; name: string; from: string; to: string }[] = [];
  const problems: string[] = [];

  for (const [name, email] of Object.entries(EMAILS)) {
    const matches = users.filter((u) => u.name === name);

    if (matches.length === 0) {
      problems.push(`No account named "${name}".`);
      continue;
    }
    if (matches.length > 1) {
      problems.push(`"${name}" matches ${matches.length} accounts — too ambiguous to touch.`);
      continue;
    }

    const user = matches[0];
    if (user.email === email) continue; // already correct

    // Never move an address onto an account that would collide with another.
    const clash = users.find((u) => u.email === email && u.id !== user.id);
    if (clash) {
      problems.push(`${email} already belongs to "${clash.name}".`);
      continue;
    }

    planned.push({ id: user.id, name, from: user.email, to: email });
  }

  if (problems.length > 0) {
    console.error("\n✗ Refusing to continue:\n");
    for (const problem of problems) console.error(`   ${problem}`);
    console.error("");
    process.exitCode = 1;
    return;
  }

  if (planned.length === 0) {
    console.log("\n✓ All nine accounts already have their real addresses. Nothing to do.\n");
    return;
  }

  console.log(`\n${apply ? "Updating" : "Would update"} ${planned.length} account(s):\n`);
  for (const change of planned) {
    console.log(`   ${change.name.padEnd(20)} ${change.from}  →  ${change.to}`);
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write.\n");
    return;
  }

  await db.$transaction(
    planned.map((change) =>
      db.user.update({
        where: { id: change.id },
        // Sign-in is by emailed code now, so there's no password to set.
        data: { email: change.to, mustSetPassword: false },
      }),
    ),
  );

  console.log(`\n✓ Updated ${planned.length} account(s).\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
