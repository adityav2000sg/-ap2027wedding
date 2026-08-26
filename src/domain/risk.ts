/**
 * Risk engine — the "Needs your attention" list.
 *
 * Alerts are *computed*, never stored, so they can't go stale: fix the problem
 * and the alert disappears on the next render. Only dismissals are persisted.
 *
 * The hard part of an alert system is restraint. Rules here only fire when
 * there is a concrete, actionable problem with a number attached — no
 * "consider reviewing your budget" filler.
 */

import { daysBetween, formatMediumDate, formatMinute } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { BudgetView } from "./budget";
import type { AnalysedTask } from "./tasks";
import { detectConflicts, snapshotEventVenues } from "./timeline";
import { VENDOR_CATEGORY_LABEL, VENDOR_STATUS_TEXT } from "./impact";
import { SEVERITY_ORDER, type Severity, type WeddingSnapshot } from "./types";

export interface Alert {
  /** Stable across renders so dismissals stick to the right problem. */
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  href: string;
  actionLabel?: string;
  group: "money" | "vendors" | "guests" | "tasks" | "logistics" | "timeline" | "documents";
}

export function computeAlerts(
  snapshot: WeddingSnapshot,
  tasks: AnalysedTask[],
  budget: BudgetView,
): Alert[] {
  const alerts: Alert[] = [];
  const base = snapshot.wedding.baseCurrency;
  const today = snapshot.today;
  const daysToWedding = daysBetween(today, snapshot.wedding.startDate);

  // ── Money ────────────────────────────────────────────────────────────────
  const overdue = snapshot.payments.filter(
    (p) => p.status !== "PAID" && p.status !== "CANCELLED" && new Date(p.dueDate) < today,
  );
  if (overdue.length) {
    const total = overdue.reduce(
      (sum, p) => sum + budget.converter.toBase(p.amount, p.currency),
      0,
    );
    alerts.push({
      key: "payments:overdue",
      severity: "critical",
      title: `${overdue.length} ${overdue.length === 1 ? "payment is" : "payments are"} overdue`,
      detail: `${formatMoney(total, base)} past its due date — the oldest was due ${formatMediumDate(new Date(overdue[0].dueDate))}.`,
      href: "/budget?view=payments&filter=overdue",
      actionLabel: "Review payments",
      group: "money",
    });
  }

  const dueSoon = snapshot.payments.filter((p) => {
    if (p.status === "PAID" || p.status === "CANCELLED") return false;
    const days = daysBetween(today, new Date(p.dueDate));
    return days >= 0 && days <= 7;
  });
  if (dueSoon.length) {
    const total = dueSoon.reduce(
      (sum, p) => sum + budget.converter.toBase(p.amount, p.currency),
      0,
    );
    alerts.push({
      key: "payments:due-soon",
      severity: "important",
      title: `${dueSoon.length} ${dueSoon.length === 1 ? "payment is" : "payments are"} due this week`,
      detail: `${formatMoney(total, base)} across ${new Set(dueSoon.map((p) => p.vendorId)).size} vendor(s).`,
      href: "/budget?view=payments",
      actionLabel: "See what's due",
      group: "money",
    });
  }

  if (budget.finance.isOverBudget) {
    alerts.push({
      key: "budget:over",
      severity: budget.finance.variancePercent > 10 ? "critical" : "important",
      title: `Forecast is ${formatMoney(budget.finance.variance, base)} over budget`,
      detail: `Forecast ${formatMoney(budget.finance.forecast, base)} against a ${formatMoney(budget.finance.totalBudget, base)} budget.`,
      href: "/budget",
      actionLabel: "Open budget",
      group: "money",
    });
  }

  // Individual categories drifting, even when the total still balances.
  for (const category of budget.categories) {
    if (category.allocated <= 0) continue;
    if (category.variance <= 0) continue;
    const overshoot = category.variance / category.allocated;
    if (overshoot < 0.12 || category.variance < 50_000) continue;
    alerts.push({
      key: `budget:category:${category.categoryId}`,
      severity: overshoot > 0.3 ? "important" : "attention",
      title: `${category.name} is ${formatMoney(category.variance, base)} above allocation`,
      detail: `Forecast ${formatMoney(category.forecast, base)} against ${formatMoney(category.allocated, base)} set aside.`,
      href: "/budget",
      actionLabel: "Review category",
      group: "money",
    });
  }

  // Money going out beyond what was agreed.
  for (const vendor of snapshot.vendors) {
    const totals = budget.byVendor.get(vendor.id);
    if (!totals || vendor.contractedAmount === null) continue;
    const contracted = budget.converter.toBase(vendor.contractedAmount, vendor.currency);
    if (totals.paid > contracted + 1) {
      alerts.push({
        key: `vendor:overpaid:${vendor.id}`,
        severity: "critical",
        title: `${vendor.businessName} has been paid more than contracted`,
        detail: `${formatMoney(totals.paid, base)} paid against a ${formatMoney(contracted, base)} contract.`,
        href: `/vendors/${vendor.id}`,
        group: "money",
      });
    }
  }

  // ── Vendors ──────────────────────────────────────────────────────────────
  for (const contract of snapshot.contracts) {
    if (!contract.expiryDate || contract.status === "SIGNED" || contract.status === "CANCELLED") {
      continue;
    }
    const days = daysBetween(today, new Date(contract.expiryDate));
    if (days < 0 || days > 14) continue;
    const vendor = snapshot.vendors.find((v) => v.id === contract.vendorId);
    alerts.push({
      key: `contract:expiring:${contract.id}`,
      severity: days <= 3 ? "critical" : "important",
      title: `${vendor?.businessName ?? contract.title} contract expires in ${days} ${days === 1 ? "day" : "days"}`,
      detail: `${contract.title} — ${formatMoney(contract.amount, contract.currency)}. Unsigned offers usually lapse.`,
      href: vendor ? `/vendors/${vendor.id}` : "/vendors",
      actionLabel: "Review contract",
      group: "vendors",
    });
  }

  for (const vendor of snapshot.vendors) {
    if (vendor.status !== "SELECTED") continue;
    const hasContract = snapshot.contracts.some(
      (c) => c.vendorId === vendor.id && c.status === "SIGNED",
    );
    if (hasContract) continue;
    alerts.push({
      key: `vendor:uncontracted:${vendor.id}`,
      severity: daysToWedding < 120 ? "important" : "attention",
      title: `${vendor.businessName} is selected but not contracted`,
      detail: `${VENDOR_CATEGORY_LABEL[vendor.category] ?? vendor.category} — nothing is signed, so the date isn't held.`,
      href: `/vendors/${vendor.id}`,
      actionLabel: "Send contract",
      group: "vendors",
    });
  }

  // ── Guests & capacity ────────────────────────────────────────────────────
  const counts = budget.drivers.guestCounts;
  if (counts.pending > 0) {
    const share = counts.invited ? counts.pending / counts.invited : 0;
    alerts.push({
      key: "guests:pending-rsvp",
      severity: share > 0.5 && daysToWedding < 120 ? "important" : "attention",
      title: `${counts.pending} guests haven't replied`,
      detail: `${counts.confirmed} confirmed and ${counts.declined} declined out of ${counts.invited} invited.`,
      href: "/guests?rsvp=pending",
      actionLabel: "Chase RSVPs",
      group: "guests",
    });
  }
  if (counts.notContacted > 0) {
    alerts.push({
      key: "guests:not-invited",
      severity: "info",
      title: `${counts.notContacted} people on the list haven't been invited to anything`,
      detail: "They're recorded as guests but aren't on any event's list yet.",
      href: "/guests?rsvp=not-contacted",
      group: "guests",
    });
  }

  for (const event of snapshot.events) {
    const venue = event.venueId ? snapshot.venues.find((v) => v.id === event.venueId) : null;
    const eventCounts = budget.drivers.eventCounts.get(event.id);
    if (!venue) {
      alerts.push({
        key: `event:no-venue:${event.id}`,
        severity: daysToWedding < 180 ? "critical" : "important",
        title: `${event.name} venue not confirmed`,
        detail: `${formatMediumDate(event.date)} — no venue is attached to this event.`,
        href: `/events/${event.slug}`,
        actionLabel: "Set venue",
        group: "logistics",
      });
      continue;
    }
    if (venue.capacity && eventCounts && eventCounts.expected > venue.capacity) {
      alerts.push({
        key: `event:capacity:${event.id}`,
        severity: "critical",
        title: `${event.name} exceeds ${venue.name}'s capacity`,
        detail: `${eventCounts.expected} guests expected, capacity is ${venue.capacity}.`,
        href: `/events/${event.slug}`,
        group: "logistics",
      });
    }
  }

  // ── Logistics ────────────────────────────────────────────────────────────
  const roomsNeeded = budget.drivers.rooms;
  const roomsHeld = snapshot.hotels.reduce((sum, h) => sum + h.contractedRooms, 0);
  if (roomsNeeded > roomsHeld) {
    alerts.push({
      key: "logistics:rooms",
      severity: roomsNeeded - roomsHeld > 15 ? "important" : "attention",
      title: `${roomsNeeded - roomsHeld} more hotel rooms needed`,
      detail: `${counts.needAccommodation} guests need a bed — that's ${roomsNeeded} rooms at ${snapshot.wedding.guestsPerRoom} per room, and ${roomsHeld} are contracted.`,
      href: "/logistics",
      actionLabel: "Open logistics",
      group: "logistics",
    });
  }

  const guestsWithoutRoom = snapshot.guests.filter(
    (g) => g.needsAccommodation && !snapshot.stays.some((s) => s.guestId === g.id),
  );
  if (guestsWithoutRoom.length) {
    alerts.push({
      key: "logistics:unallocated-rooms",
      severity: daysToWedding < 60 ? "important" : "attention",
      title: `${guestsWithoutRoom.length} guests still need a room allocated`,
      detail: "They've told us they need accommodation but aren't assigned to a hotel yet.",
      href: "/logistics?view=stays",
      group: "logistics",
    });
  }

  const pickups = snapshot.travel.filter((t) => t.direction === "ARRIVAL" && t.pickupRequired);
  const unassignedPickups = pickups.filter((t) => !t.journeyId);
  if (unassignedPickups.length) {
    const seats = snapshot.journeys.reduce((sum, journey) => {
      const vehicle = snapshot.vehicles.find((v) => v.id === journey.vehicleId);
      return sum + (vehicle?.capacity ?? 0);
    }, 0);
    alerts.push({
      key: "logistics:pickups",
      severity: daysToWedding < 45 ? "important" : "attention",
      title: `${unassignedPickups.length} airport pickups have no vehicle`,
      detail: `${pickups.length} guests need collecting and ${seats} transport seats are currently scheduled.`,
      href: "/logistics?view=transport",
      actionLabel: "Assign transport",
      group: "logistics",
    });
  }

  const unowned = snapshot.responsibilities.filter((r) => !r.ownerId && r.importance >= 3);
  if (unowned.length) {
    alerts.push({
      key: "ops:unassigned-responsibilities",
      severity: unowned.length > 8 ? "important" : "attention",
      title: `${unowned.length} important responsibilities have no owner`,
      detail: "Nobody's name is against these — they're the things that get forgotten.",
      href: "/logistics?view=responsibilities",
      actionLabel: "Assign owners",
      group: "logistics",
    });
  }

  // ── Tasks ────────────────────────────────────────────────────────────────
  const overdueTasks = tasks.filter((t) => t.isOverdue);
  const criticalOverdue = overdueTasks.filter((t) => t.importance >= 4);
  if (criticalOverdue.length) {
    alerts.push({
      key: "tasks:critical-overdue",
      severity: "critical",
      title: `${criticalOverdue.length} important ${criticalOverdue.length === 1 ? "task is" : "tasks are"} overdue`,
      detail: criticalOverdue
        .slice(0, 3)
        .map((t) => `${t.title} (${t.daysLate}d late)`)
        .join(" · "),
      href: "/tasks?view=overdue",
      actionLabel: "Open tasks",
      group: "tasks",
    });
  } else if (overdueTasks.length) {
    alerts.push({
      key: "tasks:overdue",
      severity: "attention",
      title: `${overdueTasks.length} ${overdueTasks.length === 1 ? "task is" : "tasks are"} overdue`,
      detail: `The oldest is ${overdueTasks[0].daysLate} days late.`,
      href: "/tasks?view=overdue",
      group: "tasks",
    });
  }

  const blocked = tasks.filter((t) => t.isBlocked && t.downstreamCount > 0);
  const highLeverageBlocked = blocked
    .filter((t) => t.downstreamCount >= 2)
    .sort((a, b) => b.downstreamCount - a.downstreamCount);
  if (highLeverageBlocked.length) {
    const worst = highLeverageBlocked[0];
    alerts.push({
      key: `tasks:blocked-chain:${worst.id}`,
      severity: "attention",
      title: `“${worst.title}” is holding up ${worst.downstreamCount} other tasks`,
      detail: `It's waiting on ${worst.blockedBy.map((b) => b.title).join(", ")}.`,
      href: `/tasks?task=${worst.id}`,
      group: "tasks",
    });
  }

  const unassignedImportant = tasks.filter(
    (t) => !t.ownerId && !t.isDone && t.importance >= 4 && t.status !== "CANCELLED",
  );
  if (unassignedImportant.length) {
    alerts.push({
      key: "tasks:unassigned",
      severity: "attention",
      title: `${unassignedImportant.length} important tasks have nobody handling them`,
      detail: unassignedImportant.slice(0, 3).map((t) => t.title).join(" · "),
      href: "/tasks?owner=unassigned",
      actionLabel: "Assign owners",
      group: "tasks",
    });
  }

  // ── Timeline ─────────────────────────────────────────────────────────────
  const conflicts = detectConflicts(snapshot.timeline, snapshot.timelineDeps, {
    vendors: snapshot.vendors,
    venues: snapshot.venues,
    eventVenue: snapshotEventVenues(snapshot),
  });
  // Soft "worth a glance" overlaps stay on the timeline page rather than
  // competing for attention on the home screen.
  const hardConflicts = conflicts.filter((c) => c.severity !== "info");
  for (const conflict of hardConflicts.slice(0, 5)) {
    alerts.push({
      key: `timeline:${conflict.key}`,
      severity: conflict.severity,
      title: conflict.title,
      detail: conflict.detail,
      href: "/timeline",
      actionLabel: "Open run of show",
      group: "timeline",
    });
  }

  // ── Documents ────────────────────────────────────────────────────────────
  const contractedWithoutDoc = snapshot.vendors.filter((v) => {
    if (v.status !== "CONTRACTED" && v.status !== "ACTIVE") return false;
    return !snapshot.documents.some((d) =>
      d.links.some((l) => l.entityType === "vendor" && l.entityId === v.id && d.kind === "CONTRACT"),
    );
  });
  if (contractedWithoutDoc.length) {
    alerts.push({
      key: "documents:missing-contracts",
      severity: "attention",
      title: `${contractedWithoutDoc.length} contracted vendors have no contract on file`,
      detail: contractedWithoutDoc.slice(0, 3).map((v) => v.businessName).join(" · "),
      href: "/documents",
      actionLabel: "Upload contracts",
      group: "documents",
    });
  }

  // ── Event readiness close to the wedding ─────────────────────────────────
  if (daysToWedding <= 90 && daysToWedding >= 0) {
    for (const event of snapshot.events) {
      const eventTasks = tasks.filter((t) => t.eventId === event.id && !t.isDone);
      const criticalOpen = eventTasks.filter((t) => t.importance >= 4).length;
      if (criticalOpen >= 4) {
        alerts.push({
          key: `event:behind:${event.id}`,
          severity: "important",
          title: `${event.name} is behind with ${daysToWedding} days to go`,
          detail: `${criticalOpen} important tasks still open.`,
          href: `/events/${event.slug}`,
          group: "tasks",
        });
      }
    }
  }

  const dismissed = new Set(snapshot.dismissedAlerts);
  return alerts
    .filter((alert) => !dismissed.has(alert.key))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function alertCounts(alerts: Alert[]): Record<Severity, number> {
  return alerts.reduce(
    (acc, alert) => ({ ...acc, [alert.severity]: acc[alert.severity] + 1 }),
    { critical: 0, important: 0, attention: 0, info: 0 } as Record<Severity, number>,
  );
}

export { formatMinute };
