/**
 * Clear the task list back to nothing, so the family can write their own.
 *
 *   npm run tasks:reset                      # dry run — says what would go
 *   npm run tasks:reset -- --apply           # archive them (reversible)
 *   npm run tasks:reset -- --restore         # bring back what this archived
 *   npm run tasks:reset -- --delete --apply  # destroy them (not reversible)
 *
 * The 478 tasks in here came out of a generic destination-wedding template.
 * They were a reasonable starting point and they are not this wedding's plan,
 * and a list that long which nobody wrote is worse than an empty one — you
 * can't tell the jobs that matter from the scaffolding around them.
 *
 * Archiving is the default, and is what "reset" should mean. Every read in the
 * app filters on `archivedAt: null`, so archived tasks vanish from every page
 * exactly as if they had been deleted — but they are still in the table, and
 * `--restore` puts them back. Deleting is offered because it is sometimes what
 * you actually want, and it is guarded, because it cascades into comments,
 * dependencies, collaborators, guest links and notifications.
 *
 * Either way this touches nothing but tasks. Guests, RSVPs, budget, timeline
 * and uploads are in their own tables and are not referenced here.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/**
 * How `--restore` finds its own work.
 *
 * A bulk archive stamps every row with the same instant, so the newest distinct
 * `archivedAt` in the table *is* the last run of this script. Nothing has to be
 * written into the task itself to mark it — which matters, because there is no
 * spare field to write into, and borrowing `description` would destroy what the
 * task actually says.
 */
async function lastBulkArchive(): Promise<Date | null> {
  const newest = await db.task.findFirst({
    where: { archivedAt: { not: null } },
    orderBy: { archivedAt: "desc" },
    select: { archivedAt: true },
  });
  return newest?.archivedAt ?? null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const destroy = process.argv.includes("--delete");
  const restore = process.argv.includes("--restore");

  if (restore) return runRestore(apply);

  const tasks = await db.task.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { comments: true, collaborators: true, guestLinks: true } },
    },
  });

  if (tasks.length === 0) {
    console.log("\n✓ There are no open tasks. The slate is already clean.\n");
    return;
  }

  // What somebody would actually lose. A task the seed created and nobody has
  // touched since costs nothing to clear; one that has been ticked off, picked
  // up or commented on is a record of real work, and is worth naming before it
  // goes rather than after.
  const touched = tasks.filter(
    (task) =>
      task.status !== "NOT_STARTED" ||
      task.ownerId !== null ||
      task._count.comments > 0 ||
      task._count.collaborators > 0 ||
      task._count.guestLinks > 0,
  );
  const done = tasks.filter((task) => task.status === "DONE");
  const inProgress = tasks.filter((task) => task.status === "IN_PROGRESS");
  const comments = tasks.reduce((sum, task) => sum + task._count.comments, 0);

  const verb = destroy ? "delete" : "archive";
  console.log(
    `\n${apply ? (destroy ? "Deleting" : "Archiving") : `Would ${verb}`} ` +
      `${tasks.length} task${tasks.length === 1 ? "" : "s"}.\n`,
  );
  console.log(`  ${done.length} marked done`);
  console.log(`  ${inProgress.length} in progress`);
  console.log(`  ${tasks.filter((t) => t.ownerId).length} with somebody on them`);
  console.log(`  ${comments} comment${comments === 1 ? "" : "s"}`);

  if (touched.length > 0) {
    console.log(
      `\n  ${touched.length} of these carry real work — a tick, an owner or a\n` +
        `  comment. ${destroy ? "Deleting loses that permanently." : "Archiving hides it; --restore brings it back."}\n`,
    );
    for (const task of touched.slice(0, 8)) {
      console.log(`    ${task.status.padEnd(12)} ${task.title}`);
    }
    if (touched.length > 8) console.log(`    …and ${touched.length - 8} more`);
  }

  if (!apply) {
    console.log(
      `\nDry run — nothing written. Re-run with --apply to ${verb}.` +
        (destroy ? "\nThis one cannot be undone.\n" : "\n"),
    );
    return;
  }

  if (destroy) {
    // Cascades handle comments, dependencies, collaborators, guest links and
    // notifications; the schema declares onDelete: Cascade on every one.
    const { count } = await db.task.deleteMany({ where: { archivedAt: null } });
    console.log(`\n✓ Deleted ${count} tasks and everything hanging off them.\n`);
    return;
  }

  // One instant across every row, which is what makes the run recoverable.
  const now = new Date();
  const { count } = await db.task.updateMany({
    where: { archivedAt: null },
    data: { archivedAt: now },
  });
  console.log(
    `\n✓ Archived ${count} tasks. They are gone from every page in the app.\n` +
      `  Run with --restore --apply to bring them back.\n`,
  );
}

async function runRestore(apply: boolean) {
  const at = await lastBulkArchive();
  if (at === null) {
    console.log("\n✓ Nothing is archived. There is nothing to restore.\n");
    return;
  }

  // Only the rows from that one instant. A task somebody archived by hand in
  // the app has its own timestamp and stays archived, which is what they meant.
  const archived = await db.task.count({ where: { archivedAt: at } });

  if (!apply) {
    console.log(
      `\nWould restore ${archived} task${archived === 1 ? "" : "s"} ` +
        `archived at ${at.toISOString()}.\n` +
        `Dry run — nothing written. Re-run with --restore --apply.\n`,
    );
    return;
  }

  const { count } = await db.task.updateMany({
    where: { archivedAt: at },
    data: { archivedAt: null },
  });
  console.log(`\n✓ Restored ${count} tasks.\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
