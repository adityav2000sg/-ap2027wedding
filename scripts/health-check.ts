/**
 * Dev tool: print what the engines currently compute for the seeded wedding.
 *
 * Useful for eyeballing whether a change to the forecast, readiness or risk
 * rules moved the numbers in the direction you expected.
 *
 *   npm run health
 */

import { PrismaClient } from "@prisma/client";

import { buildBudgetView, paymentsByPayer } from "@/domain/budget";
import { computeGuestCounts, roomsRequired, rsvpProgress } from "@/domain/guests";
import { analyseChange } from "@/domain/impact";
import { nextMilestone } from "@/domain/milestones";
import { computeEventReadiness, computeWeddingReadiness } from "@/domain/readiness";
import { computeAlerts } from "@/domain/risk";
import { analyseTasks, nextBestActions, overdueTasks } from "@/domain/tasks";
import { detectConflicts, snapshotEventVenues } from "@/domain/timeline";
import { daysBetween, formatDateRange } from "@/lib/dates";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import { fetchSnapshot } from "@/server/snapshot-query";

const db = new PrismaClient();

async function main() {
  const wedding = await db.wedding.findFirstOrThrow();
  const snapshot = await fetchSnapshot(wedding.id, db);

  const tasks = analyseTasks(snapshot);
  const budget = buildBudgetView(snapshot);
  const readiness = computeWeddingReadiness(snapshot, tasks, budget);
  const alerts = computeAlerts(snapshot, tasks, budget);
  const counts = computeGuestCounts(snapshot);
  const base = snapshot.wedding.baseCurrency;

  const line = (label: string, value: string) =>
    console.log(`  ${label.padEnd(30)} ${value}`);

  console.log(`\n${snapshot.wedding.partnerAName} & ${snapshot.wedding.partnerBName}`);
  console.log(formatDateRange(snapshot.wedding.startDate, snapshot.wedding.endDate));
  console.log(
    `${daysBetween(snapshot.today, snapshot.wedding.startDate)} days to go · ${readiness.percent}% ready\n`,
  );

  console.log("READINESS");
  for (const component of readiness.components) {
    line(component.label, `${component.points}/${component.maxPoints} — ${component.summary}`);
  }
  console.log("\n  What's keeping it from 100%:");
  for (const blocker of readiness.blockers.slice(0, 6)) {
    console.log(`   −${blocker.pointsCost.toFixed(1)}%  ${blocker.label} — ${blocker.detail}`);
  }

  console.log("\nBUDGET");
  line("Total budget", formatMoney(budget.finance.totalBudget, base));
  line("Forecast", formatMoney(budget.finance.forecast, base));
  line("Variance", formatMoney(budget.finance.variance, base, { signed: true }));
  line("Committed", formatMoney(budget.finance.committed, base));
  line("Paid", formatMoney(budget.finance.paid, base));
  line("Remaining payable", formatMoney(budget.finance.remainingPayable, base));
  line("Contingency left", formatMoney(budget.finance.contingencyRemaining, base));
  if (budget.finance.missingRates.length) {
    line("MISSING RATES", budget.finance.missingRates.join(", "));
  }

  console.log("\n  Worst variances:");
  for (const category of [...budget.categories].sort((a, b) => b.variance - a.variance).slice(0, 4)) {
    console.log(
      `   ${category.name.padEnd(26)} ${formatCompactMoney(category.variance, base, { signed: true })} (forecast ${formatCompactMoney(category.forecast, base)} vs ${formatCompactMoney(category.allocated, base)})`,
    );
  }

  console.log("\n  Variable lines (react to guest count):");
  for (const item of budget.items.filter((i) => i.isVariable).slice(0, 5)) {
    console.log(`   ${item.name.padEnd(26)} ${formatCompactMoney(item.forecast, base)} — ${item.explanation}`);
  }

  console.log("\n  Who has paid:");
  for (const payer of paymentsByPayer(snapshot, budget.converter)) {
    console.log(`   ${payer.name.padEnd(20)} paid ${formatCompactMoney(payer.paid, base)} · upcoming ${formatCompactMoney(payer.upcoming, base)}`);
  }

  console.log("\nGUESTS");
  line("On the list", String(counts.total));
  line("Invited", String(counts.invited));
  line("Confirmed", String(counts.confirmed));
  line("Declined", String(counts.declined));
  line("Awaiting reply", String(counts.pending));
  line("Not yet invited", String(counts.notContacted));
  line("Need a room", `${counts.needAccommodation} → ${roomsRequired(snapshot)} rooms`);
  line("RSVP progress", `${rsvpProgress(snapshot).percent}%`);

  console.log("\nEVENTS");
  for (const event of snapshot.events) {
    const eventCounts = budget.drivers.eventCounts.get(event.id)!;
    const eventReadiness = computeEventReadiness(snapshot, event, tasks, budget, eventCounts);
    const money = budget.byEvent.get(event.id);
    console.log(
      `  ${event.name.padEnd(12)} ${String(eventReadiness.percent).padStart(3)}%  ` +
        `${String(eventCounts.confirmed).padStart(3)} confirmed / ${String(eventCounts.expected).padStart(3)} expected  ` +
        `${formatCompactMoney(money?.forecast ?? 0, base).padStart(8)}`,
    );
  }

  console.log("\nTASKS");
  line("Total", String(tasks.length));
  line("Done", String(tasks.filter((t) => t.isDone).length));
  line("Overdue", String(overdueTasks(tasks).length));
  line("Blocked", String(tasks.filter((t) => t.isBlocked).length));
  console.log("\n  Next best actions:");
  for (const task of nextBestActions(tasks, 5)) {
    console.log(`   [${String(task.leverage).padStart(3)}] ${task.title}`);
  }

  console.log(`\nALERTS (${alerts.length})`);
  for (const alert of alerts.slice(0, 8)) {
    console.log(`  [${alert.severity.toUpperCase().padEnd(9)}] ${alert.title}`);
    console.log(`              ${alert.detail}`);
  }

  const conflicts = detectConflicts(snapshot.timeline, snapshot.timelineDeps, {
    vendors: snapshot.vendors,
    venues: snapshot.venues,
    eventVenue: snapshotEventVenues(snapshot),
  });
  console.log(`\nTIMELINE CONFLICTS (${conflicts.length})`);
  for (const conflict of conflicts.slice(0, 4)) {
    console.log(`  ${conflict.title} — ${conflict.detail}`);
  }

  const milestone = nextMilestone({ snapshot, tasks, budget });
  console.log(`\nNEXT MILESTONE: ${milestone?.title ?? "all achieved"} (${Math.round((milestone?.progress ?? 1) * 100)}%)`);

  // Prove the system actually reacts: what if 40 more guests confirmed?
  console.log("\nIMPACT TEST — raise the guest estimate 320 → 360");
  const impact = analyseChange(snapshot, { type: "wedding.guests", estimatedGuests: 360 });
  console.log(`  Material: ${impact.material}`);
  for (const item of impact.impacts.slice(0, 6)) {
    console.log(`  [${item.severity}] ${item.message}`);
  }

  const shaadi = snapshot.events.find((e) => e.kind === "SHAADI")!;
  console.log("\nIMPACT TEST — move the Shaadi 45 minutes later");
  const timeImpact = analyseChange(snapshot, {
    type: "event.time",
    eventId: shaadi.id,
    startMinute: shaadi.startMinute + 45,
    endMinute: shaadi.endMinute + 45,
  });
  console.log(`  ${timeImpact.timelineMoves.length} timeline entries would move`);
  for (const move of timeImpact.timelineMoves.slice(0, 6)) {
    console.log(`   ${move.title} — ${move.reason}`);
  }
  for (const item of timeImpact.impacts.filter((i) => i.type === "vendor").slice(0, 4)) {
    console.log(`   [vendor] ${item.message}`);
  }
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
