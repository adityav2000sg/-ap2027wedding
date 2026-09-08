/**
 * Give each of the nine accounts its own password.
 *
 *   npm run accounts:passwords            # dry run — shows who would change
 *   npm run accounts:passwords -- --apply # generates, writes, and prints them
 *   npm run accounts:passwords -- --apply --first-name-2027
 *
 * Passwords are generated here and printed once. They are never committed, never
 * logged anywhere else, and can't be recovered afterwards — the database only
 * stores a scrypt hash. If you lose the output, re-run with --apply and hand out
 * the new set.
 *
 * Safe against production:
 *   - matches on the email address, so it can't touch the wrong account
 *   - only ever writes passwordHash; nothing is created or deleted
 *   - refuses if any address is missing rather than half-applying
 *
 * Three words and a number: long enough to resist guessing, short enough to read
 * down a phone line to a parent. Avoids look-alike characters entirely by using
 * words rather than a random string.
 */

import { randomInt } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { FAMILY_ACCOUNTS, firstNamePassword } from "../src/config/family-accounts";
import { hashPassword } from "../src/server/auth-hash";

const db = new PrismaClient();

const EMAILS: string[] = FAMILY_ACCOUNTS.map((account) => account.email);

/** Deliberately plain, unambiguous words — these get read aloud and retyped. */
const WORDS = [
  "amber", "anchor", "basil", "beacon", "cedar", "cobalt", "copper", "coral",
  "cotton", "dahlia", "ember", "fable", "garnet", "harbour", "indigo", "ivory",
  "jasmine", "juniper", "lantern", "lilac", "linen", "mango", "marble", "meadow",
  "monsoon", "nectar", "olive", "orchid", "papaya", "pepper", "quartz", "ribbon",
  "saffron", "sandal", "sapphire", "silk", "sorrel", "sunset", "teak", "temple",
  "thistle", "tulip", "velvet", "walnut", "willow", "yarrow",
];

function generatePassword(): string {
  const picked: string[] = [];
  while (picked.length < 3) {
    const word = WORDS[randomInt(0, WORDS.length)];
    if (!picked.includes(word)) picked.push(word);
  }
  return `${picked.join("-")}-${randomInt(10, 100)}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const useFirstName = process.argv.includes("--first-name-2027");

  const users = await db.user.findMany({
    where: { email: { in: EMAILS } },
    select: { id: true, name: true, email: true },
  });

  const missing = EMAILS.filter((email) => !users.some((u) => u.email === email));
  if (missing.length > 0) {
    console.error("\n✗ Refusing to continue — no account for:\n");
    for (const email of missing) console.error(`   ${email}`);
    console.error("\nRun `npm run accounts:emails -- --apply` first.\n");
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    console.log(`\nWould set a new password for ${users.length} accounts:\n`);
    for (const user of users) {
      console.log(`   ${user.name.padEnd(20)} ${user.email}`);
    }
    const mode = useFirstName ? " --first-name-2027" : "";
    console.log(`\nDry run. Re-run with --apply${mode} to generate and write them.\n`);
    return;
  }

  const issued: { name: string; email: string; password: string }[] = [];

  for (const user of users) {
    const password = useFirstName ? firstNamePassword(user.name) : generatePassword();
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), mustSetPassword: false },
    });
    issued.push({ name: user.name, email: user.email, password });
  }

  // Ordered the way the family thinks about itself, not by database id.
  issued.sort((a, b) => EMAILS.indexOf(a.email) - EMAILS.indexOf(b.email));

  const width = Math.max(...issued.map((i) => i.name.length));
  const emailWidth = Math.max(...issued.map((i) => i.email.length));

  console.log("\n✓ Passwords set. This is the only time they are shown.\n");
  console.log(
    `   ${"Name".padEnd(width)}  ${"Email".padEnd(emailWidth)}  Password`,
  );
  console.log(`   ${"─".repeat(width)}  ${"─".repeat(emailWidth)}  ${"─".repeat(24)}`);
  for (const row of issued) {
    console.log(
      `   ${row.name.padEnd(width)}  ${row.email.padEnd(emailWidth)}  ${row.password}`,
    );
  }
  console.log("\n   Send each person only their own line.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
