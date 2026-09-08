/**
 * Idempotently provision the nine family accounts into an existing wedding.
 *
 * This is safe to run on every Railway boot. It creates missing users and
 * memberships, fixes legacy placeholder email addresses, and leaves existing
 * password hashes and user preferences untouched.
 */

import { PrismaClient } from "@prisma/client";

import { FAMILY_ACCOUNTS } from "../src/config/family-accounts";
import { hashPassword } from "../src/server/auth-hash";

const db = new PrismaClient();
const WEDDING_SLUG = "avantika-prateek";
const FALLBACK_INITIAL_PASSWORD = "wedding2027";

async function main() {
  const wedding = await db.wedding.findUnique({
    where: { slug: WEDDING_SLUG },
    select: { id: true },
  });

  if (!wedding) {
    throw new Error(
      `Wedding "${WEDDING_SLUG}" does not exist. Run the seed once before provisioning accounts.`,
    );
  }

  const initialPassword =
    process.env.FAMILY_ACCOUNT_PASSWORD?.trim() || FALLBACK_INITIAL_PASSWORD;
  const initialPasswordHash = await hashPassword(initialPassword);
  let createdUsers = 0;
  let updatedEmails = 0;
  let createdMemberships = 0;

  await db.$transaction(async (tx) => {
    for (const account of FAMILY_ACCOUNTS) {
      const [usersByName, userByEmail] = await Promise.all([
        tx.user.findMany({ where: { name: account.name }, select: { id: true, email: true } }),
        tx.user.findFirst({
          where: { email: { equals: account.email, mode: "insensitive" } },
          select: { id: true, email: true },
        }),
      ]);

      if (usersByName.length > 1) {
        throw new Error(`More than one user is named "${account.name}"; refusing to guess.`);
      }

      const userByName = usersByName[0];
      if (userByName && userByEmail && userByName.id !== userByEmail.id) {
        throw new Error(
          `${account.email} belongs to a different user than "${account.name}"; refusing to merge them.`,
        );
      }

      let userId: string;
      const existing = userByEmail ?? userByName;
      if (existing) {
        userId = existing.id;
        if (existing.email !== account.email) {
          await tx.user.update({
            where: { id: userId },
            data: { email: account.email },
          });
          updatedEmails += 1;
        }
      } else {
        const user = await tx.user.create({
          data: {
            name: account.name,
            email: account.email,
            passwordHash: initialPasswordHash,
            avatarTone: account.tone,
            displayCurrency: account.displayCurrency,
            mustSetPassword: false,
          },
          select: { id: true },
        });
        userId = user.id;
        createdUsers += 1;
      }

      const membership = await tx.weddingMember.findUnique({
        where: { weddingId_userId: { weddingId: wedding.id, userId } },
        select: { id: true },
      });
      if (!membership) {
        await tx.weddingMember.create({
          data: {
            weddingId: wedding.id,
            userId,
            relation: account.relation,
          },
        });
        createdMemberships += 1;
      }
    }
  });

  const provisioned = await db.weddingMember.count({
    where: {
      weddingId: wedding.id,
      user: { email: { in: FAMILY_ACCOUNTS.map((account) => account.email) } },
    },
  });

  if (provisioned !== FAMILY_ACCOUNTS.length) {
    throw new Error(
      `Expected ${FAMILY_ACCOUNTS.length} family accounts, found ${provisioned} after provisioning.`,
    );
  }

  console.log(
    `\n✓ ${provisioned} family accounts ready ` +
      `(${createdUsers} users created, ${updatedEmails} emails repaired, ` +
      `${createdMemberships} memberships created).\n`,
  );
  if (createdUsers > 0 && !process.env.FAMILY_ACCOUNT_PASSWORD) {
    console.warn(
      "  New accounts received the documented initial password. " +
        "Run `npm run accounts:passwords -- --apply` to replace it with unique passwords.\n",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
