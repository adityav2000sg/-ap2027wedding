/**
 * Clear the seeded task assignments.
 *
 *   npm run tasks:reset-owners
 *   npm run tasks:reset-owners -- --apply
 *
 * Every task came out of the seed with an owner already on it, which was
 * fiction — nobody has agreed to anything yet, and the family will divide the
 * work themselves. A list of invented assignments is worse than an empty one:
 * it hides which jobs genuinely have nobody on them.
 *
 * Completed tasks keep both their owner and their tick. Somebody did that work,
 * and erasing who did it would be rewriting history rather than clearing a
 * plan.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");

  const toClear = await db.task.findMany({
    where: {
      archivedAt: null,
      status: { not: "DONE" },
      OR: [{ ownerId: { not: null } }, { collaborators: { some: {} } }],
    },
    select: {
      id: true,
      title: true,
      status: true,
      ownerId: true,
      collaborators: { select: { memberId: true } },
    },
  });

  const done = await db.task.count({
    where: { archivedAt: null, status: "DONE", ownerId: { not: null } },
  });

  if (toClear.length === 0) {
    console.log("\n✓ No open task has an owner. Nothing to clear.\n");
    return;
  }

  const withOwner = toClear.filter((t) => t.ownerId).length;
  const withTags = toClear.filter((t) => t.collaborators.length > 0).length;

  console.log(`\n${apply ? "Cleared" : "Would clear"}:\n`);
  console.log(`   ${withOwner} open task(s) lose their owner`);
  if (withTags > 0) console.log(`   ${withTags} open task(s) lose their tagged people`);
  console.log(`\n   ${done} completed task(s) keep theirs — they're a record, not a plan.\n`);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to write.\n");
    return;
  }

  const ids = toClear.map((t) => t.id);
  await db.$transaction([
    db.task.updateMany({ where: { id: { in: ids } }, data: { ownerId: null } }),
    db.taskCollaborator.deleteMany({ where: { taskId: { in: ids } } }),
  ]);

  console.log("✓ Done. Every open task is now unassigned.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
