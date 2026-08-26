/**
 * Readiness engine.
 *
 * Readiness is deliberately *not* `done / total`. A wedding where every trivial
 * task is ticked but no venue is contracted is not 90% ready.
 *
 * The score blends four signals, each of which can independently sink you:
 *
 *   1. Weighted task progress  — importance-weighted, penalised for lateness
 *   2. Vendor booking progress — per essential category, best status wins
 *   3. Financial commitment    — how much of the forecast is actually contracted
 *   4. Operational readiness   — guests answered, rooms, transport (events only)
 *
 * Critically, every component reports *which specific things* are costing
 * percentage points, so "61% ready" is always followed by a truthful,
 * clickable answer to "why not 100%?".
 */

import type { AnalysedTask } from "./tasks";
import { IMPORTANCE_WEIGHT } from "./tasks";
import type { BudgetView } from "./budget";
import type { EventGuestCounts } from "./guests";
import type {
  EventNode,
  Severity,
  VendorCategory,
  VendorNode,
  VendorStatus,
  WeddingSnapshot,
} from "./types";

export interface ReadinessComponent {
  key: string;
  label: string;
  /** Share of the overall score, 0–1. */
  weight: number;
  /** How complete this component is, 0–1. */
  score: number;
  points: number;
  maxPoints: number;
  summary: string;
}

export interface ReadinessBlocker {
  key: string;
  label: string;
  detail: string;
  /** Percentage points of readiness this single thing is costing. */
  pointsCost: number;
  kind: "task" | "vendor" | "financial" | "guest" | "logistics";
  severity: Severity;
  entityId?: string;
  href?: string;
}

export interface ReadinessResult {
  percent: number;
  components: ReadinessComponent[];
  /** Ranked by how much each is costing. This is the "why not 100%" list. */
  blockers: ReadinessBlocker[];
  stats: {
    tasksTotal: number;
    tasksDone: number;
    tasksOpen: number;
    tasksOverdue: number;
    tasksBlocked: number;
    criticalOpen: number;
  };
}

/** How booked a vendor is, as a fraction. */
const VENDOR_PROGRESS: Record<VendorStatus, number> = {
  COMPLETED: 1,
  ACTIVE: 1,
  CONTRACTED: 1,
  SELECTED: 0.7,
  NEGOTIATING: 0.45,
  SHORTLISTED: 0.3,
  QUOTE_RECEIVED: 0.2,
  CONTACTED: 0.1,
  RESEARCHING: 0.05,
  REJECTED: 0,
};

export const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = {
  RESEARCHING: "Researching",
  CONTACTED: "Contacted",
  QUOTE_RECEIVED: "Quote received",
  SHORTLISTED: "Shortlisted",
  NEGOTIATING: "Negotiating",
  SELECTED: "Selected",
  CONTRACTED: "Contracted",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  REJECTED: "Not going ahead",
};

/**
 * Categories a North Indian wedding genuinely cannot happen without, and how
 * much each matters. Absence of any of these is a readiness hole, not just a
 * missing row.
 */
const ESSENTIAL_CATEGORIES: { category: VendorCategory; label: string; weight: number }[] = [
  { category: "VENUE", label: "Venue", weight: 5 },
  { category: "CATERING", label: "Catering", weight: 5 },
  { category: "PHOTOGRAPHY", label: "Photography", weight: 4 },
  { category: "DECOR", label: "Decor", weight: 4 },
  { category: "PRIEST", label: "Pandit", weight: 4 },
  { category: "MAKEUP", label: "Hair & makeup", weight: 3 },
  { category: "VIDEOGRAPHY", label: "Videography", weight: 3 },
  { category: "DJ", label: "DJ & sound", weight: 3 },
  { category: "HOTELS", label: "Accommodation", weight: 3 },
  { category: "TRANSPORTATION", label: "Transport", weight: 2 },
  { category: "MEHENDI", label: "Mehendi artists", weight: 2 },
  { category: "INVITATIONS", label: "Invitations", weight: 2 },
];

const WEDDING_WEIGHTS = { tasks: 0.5, vendors: 0.25, financial: 0.15, operations: 0.1 };
const EVENT_WEIGHTS = { tasks: 0.45, vendors: 0.25, financial: 0.15, operations: 0.15 };

export function computeWeddingReadiness(
  snapshot: WeddingSnapshot,
  tasks: AnalysedTask[],
  budget: BudgetView,
): ReadinessResult {
  const scopedTasks = tasks.filter((t) => t.status !== "CANCELLED");
  const taskPart = scoreTasks(scopedTasks);
  const vendorPart = scoreVendors(snapshot.vendors, ESSENTIAL_CATEGORIES);
  const financialPart = scoreFinancial(budget);
  const operationsPart = scoreWeddingOperations(snapshot, budget);

  return assemble(
    [
      { key: "tasks", label: "Planning work", weight: WEDDING_WEIGHTS.tasks, ...taskPart },
      { key: "vendors", label: "Vendors booked", weight: WEDDING_WEIGHTS.vendors, ...vendorPart },
      { key: "financial", label: "Money committed", weight: WEDDING_WEIGHTS.financial, ...financialPart },
      { key: "operations", label: "Guests & logistics", weight: WEDDING_WEIGHTS.operations, ...operationsPart },
    ],
    scopedTasks,
  );
}

export function computeEventReadiness(
  snapshot: WeddingSnapshot,
  event: EventNode,
  tasks: AnalysedTask[],
  budget: BudgetView,
  guestCounts: EventGuestCounts,
): ReadinessResult {
  const scopedTasks = tasks.filter(
    (t) => t.eventId === event.id && t.status !== "CANCELLED",
  );
  const eventVendors = snapshot.vendors.filter((v) => v.eventIds.includes(event.id));

  // Only judge an event against the categories it actually needs.
  const relevant = ESSENTIAL_CATEGORIES.filter(
    (entry) =>
      eventVendors.some((v) => v.category === entry.category) ||
      requiredCategoriesFor(event).includes(entry.category),
  );

  const taskPart = scoreTasks(scopedTasks);
  const vendorPart = scoreVendors(eventVendors, relevant);
  const financialPart = scoreEventFinancial(budget, event.id);
  const operationsPart = scoreEventOperations(snapshot, event, guestCounts);

  return assemble(
    [
      { key: "tasks", label: "Planning work", weight: EVENT_WEIGHTS.tasks, ...taskPart },
      { key: "vendors", label: "Vendors booked", weight: EVENT_WEIGHTS.vendors, ...vendorPart },
      { key: "financial", label: "Money committed", weight: EVENT_WEIGHTS.financial, ...financialPart },
      { key: "operations", label: "Venue & guests", weight: EVENT_WEIGHTS.operations, ...operationsPart },
    ],
    scopedTasks,
  );
}

/** The vendor categories an event of this kind can't run without. */
function requiredCategoriesFor(event: EventNode): VendorCategory[] {
  switch (event.kind) {
    case "SHAADI":
      return ["VENUE", "CATERING", "DECOR", "PHOTOGRAPHY", "PRIEST", "MAKEUP"];
    case "SANGEET":
      return ["VENUE", "CATERING", "DECOR", "PHOTOGRAPHY", "DJ"];
    case "MEHENDI":
      return ["VENUE", "CATERING", "MEHENDI", "PHOTOGRAPHY"];
    case "HALDI":
      return ["VENUE", "CATERING", "DECOR", "PHOTOGRAPHY"];
    case "RECEPTION":
      return ["VENUE", "CATERING", "DECOR", "PHOTOGRAPHY", "DJ"];
    default:
      return ["VENUE", "CATERING"];
  }
}

// ────────────────────────────────────────────────────────────────── Components

interface PartialComponent {
  score: number;
  summary: string;
  blockers: Omit<ReadinessBlocker, "pointsCost">[];
}

/**
 * How much a task counts towards readiness *today*.
 *
 * Readiness answers "are we on track?", not "have we done everything that will
 * ever need doing". A task due in eight months shouldn't drag the score down
 * now — but it shouldn't count for nothing either, or the number would leap
 * around as deadlines approach. So relevance ramps up as the deadline nears.
 */
function relevance(task: AnalysedTask): number {
  if (task.daysUntilDue === null) return 0.5;
  if (task.daysUntilDue < 0) return 1;
  if (task.daysUntilDue <= 30) return 1;
  if (task.daysUntilDue <= 90) return 0.7;
  if (task.daysUntilDue <= 180) return 0.4;
  return 0.2;
}

function scoreTasks(tasks: AnalysedTask[]): PartialComponent {
  const active = tasks.filter((t) => t.status !== "CANCELLED");
  if (active.length === 0) {
    return {
      score: 0,
      summary: "No planning tasks yet",
      blockers: [
        {
          key: "tasks:none",
          label: "No planning tasks yet",
          detail: "Generate the wedding plan to start tracking readiness.",
          kind: "task",
          severity: "important",
        },
      ],
    };
  }

  let earned = 0;
  let possible = 0;
  const contributions: { task: AnalysedTask; shortfall: number }[] = [];

  for (const task of active) {
    // Importance sets the base weight; how soon it's due scales how much it
    // matters to today's score.
    const weight = (IMPORTANCE_WEIGHT[task.importance] ?? 4) * relevance(task);
    // Being late doesn't undo work done, but it does mean you're less ready
    // than the status alone suggests.
    const latePenalty = task.isOverdue ? 0.6 : 1;
    const progress = Math.min(1, task.progress * latePenalty);

    earned += weight * progress;
    possible += weight;
    if (progress < 1) contributions.push({ task, shortfall: weight * (1 - progress) });
  }

  const score = possible === 0 ? 0 : earned / possible;
  // Report against the work that's actually live, so "12 of 40" doesn't read as
  // "12 of 478" when 438 of those aren't due for half a year.
  const live = active.filter((t) => relevance(t) >= 0.7);
  const done = live.filter((t) => t.isDone).length;

  const blockers = contributions
    .sort((a, b) => b.shortfall - a.shortfall)
    .slice(0, 12)
    .map(({ task, shortfall }) => ({
      key: `task:${task.id}`,
      label: task.title,
      detail: describeTaskGap(task),
      kind: "task" as const,
      severity: taskSeverity(task),
      entityId: task.id,
      href: `/tasks?task=${task.id}`,
      // Carried on the object so `assemble` can convert to points.
      _share: possible === 0 ? 0 : shortfall / possible,
    })) as (Omit<ReadinessBlocker, "pointsCost"> & { _share: number })[];

  return {
    score,
    summary:
      live.length > 0
        ? `${done} of ${live.length} tasks that are due soon`
        : `${active.filter((t) => t.isDone).length} of ${active.length} tasks complete`,
    blockers,
  };
}

function describeTaskGap(task: AnalysedTask): string {
  if (task.isBlocked) {
    const first = task.blockedBy[0];
    return `Waiting on “${first.title}”${
      task.blockedBy.length > 1 ? ` and ${task.blockedBy.length - 1} more` : ""
    }`;
  }
  if (task.isOverdue) return `${task.daysLate} ${task.daysLate === 1 ? "day" : "days"} late`;
  if (task.status === "IN_PROGRESS") return "In progress";
  if (task.status === "REVIEW") return "Waiting for a final check";
  if (!task.ownerId) return "Nobody is handling this yet";
  return "Not started";
}

function taskSeverity(task: AnalysedTask): Severity {
  if (task.isOverdue && task.importance >= 4) return "critical";
  if (task.isOverdue || task.priority === "CRITICAL") return "important";
  if (task.importance >= 4 || task.isBlocked) return "attention";
  return "info";
}

function scoreVendors(
  vendors: VendorNode[],
  categories: { category: VendorCategory; label: string; weight: number }[],
): PartialComponent {
  if (categories.length === 0) {
    return { score: 1, summary: "No vendors required", blockers: [] };
  }

  let earned = 0;
  let possible = 0;
  const gaps: (Omit<ReadinessBlocker, "pointsCost"> & { _share: number })[] = [];

  for (const entry of categories) {
    const inCategory = vendors.filter(
      (v) => v.category === entry.category && v.status !== "REJECTED",
    );
    // The furthest-along vendor represents the category's progress.
    const best = inCategory.reduce(
      (max, v) => Math.max(max, VENDOR_PROGRESS[v.status] ?? 0),
      0,
    );

    earned += entry.weight * best;
    possible += entry.weight;

    if (best < 1) {
      const leader = inCategory
        .slice()
        .sort((a, b) => (VENDOR_PROGRESS[b.status] ?? 0) - (VENDOR_PROGRESS[a.status] ?? 0))[0];
      gaps.push({
        key: `vendor:${entry.category}`,
        label: inCategory.length === 0
          ? `No ${entry.label.toLowerCase()} vendor yet`
          : `${entry.label} not contracted`,
        detail: leader
          ? `${leader.businessName} is at “${VENDOR_STATUS_LABEL[leader.status]}”`
          : `Nobody shortlisted for ${entry.label.toLowerCase()} yet`,
        kind: "vendor",
        severity: entry.weight >= 4 ? "important" : "attention",
        href: `/vendors?category=${entry.category}`,
        _share: possible === 0 ? 0 : (entry.weight * (1 - best)) / possible,
      });
    }
  }

  const booked = categories.length - gaps.length;
  const score = possible === 0 ? 1 : earned / possible;

  // Shares were computed against a running total; normalise against the final one.
  const total = categories.reduce((s, c) => s + c.weight, 0);
  for (const gap of gaps) {
    const entry = categories.find((c) => `vendor:${c.category}` === gap.key)!;
    const inCategory = vendors.filter(
      (v) => v.category === entry.category && v.status !== "REJECTED",
    );
    const best = inCategory.reduce((max, v) => Math.max(max, VENDOR_PROGRESS[v.status] ?? 0), 0);
    gap._share = (entry.weight * (1 - best)) / total;
  }

  return {
    score,
    summary: `${booked} of ${categories.length} key vendors locked in`,
    blockers: gaps,
  };
}

function scoreFinancial(budget: BudgetView): PartialComponent {
  const { forecast, committed, paid } = budget.finance;
  if (forecast === 0) {
    return { score: 0, summary: "No budget yet", blockers: [] };
  }

  // Contracted money is certainty. Paid money is more certain still, but the
  // contract is what removes planning risk, so it carries the weight.
  const score = Math.min(1, (committed + paid * 0.15) / forecast);
  const uncommitted = Math.max(0, forecast - committed);

  const blockers: (Omit<ReadinessBlocker, "pointsCost"> & { _share: number })[] = [];
  if (uncommitted > 0) {
    blockers.push({
      key: "financial:uncommitted",
      label: "Spend not yet under contract",
      detail: `${Math.round((uncommitted / forecast) * 100)}% of the forecast has no signed contract behind it`,
      kind: "financial",
      severity: uncommitted / forecast > 0.6 ? "important" : "attention",
      href: "/budget",
      _share: uncommitted / forecast,
    });
  }

  return {
    score,
    summary: `${Math.round((committed / forecast) * 100)}% of forecast contracted`,
    blockers,
  };
}

function scoreEventFinancial(budget: BudgetView, eventId: string): PartialComponent {
  const totals = budget.byEvent.get(eventId);
  if (!totals || totals.forecast === 0) {
    return {
      score: 0,
      summary: "No budget lines for this event",
      blockers: [
        {
          key: `financial:event:${eventId}`,
          label: "No budget set for this event",
          detail: "Add budget lines so this event's cost can be forecast.",
          kind: "financial",
          severity: "attention",
          href: "/budget",
          _share: 1,
        } as Omit<ReadinessBlocker, "pointsCost"> & { _share: number },
      ],
    };
  }

  const score = Math.min(1, totals.committed / totals.forecast);
  const uncommitted = Math.max(0, totals.forecast - totals.committed);
  const blockers: (Omit<ReadinessBlocker, "pointsCost"> & { _share: number })[] = [];
  if (uncommitted > 0) {
    blockers.push({
      key: `financial:event-uncommitted:${eventId}`,
      label: "Costs not yet contracted",
      detail: `${Math.round((uncommitted / totals.forecast) * 100)}% of this event's forecast is still uncommitted`,
      kind: "financial",
      severity: "attention",
      href: "/budget",
      _share: uncommitted / totals.forecast,
    });
  }
  return { score, summary: `${Math.round(score * 100)}% contracted`, blockers };
}

function scoreWeddingOperations(
  snapshot: WeddingSnapshot,
  budget: BudgetView,
): PartialComponent {
  const counts = budget.drivers.guestCounts;
  const blockers: (Omit<ReadinessBlocker, "pointsCost"> & { _share: number })[] = [];
  const signals: { weight: number; score: number }[] = [];

  // 1. Have guests answered?
  const invited = counts.invited;
  const responded = counts.confirmed + counts.declined;
  const rsvpScore = invited === 0 ? 0 : responded / invited;
  signals.push({ weight: 3, score: rsvpScore });
  if (rsvpScore < 1) {
    blockers.push({
      key: "guest:rsvp",
      label: invited === 0 ? "Nobody has been invited yet" : `${counts.pending} guests haven't replied`,
      detail: invited === 0
        ? "Send invitations to start collecting RSVPs."
        : `${responded} of ${invited} invited guests have answered`,
      kind: "guest",
      severity: counts.pending > invited * 0.5 ? "important" : "attention",
      href: "/guests?rsvp=pending",
      _share: 0,
    });
  }

  // 2. Do the guests who need beds have them?
  const needRooms = counts.needAccommodation;
  const roomsNeeded = Math.ceil(needRooms / Math.max(1, snapshot.wedding.guestsPerRoom));
  const roomsHeld = snapshot.hotels.reduce((s, h) => s + h.contractedRooms, 0);
  const roomScore = roomsNeeded === 0 ? 1 : Math.min(1, roomsHeld / roomsNeeded);
  signals.push({ weight: 2, score: roomScore });
  if (roomScore < 1) {
    blockers.push({
      key: "logistics:rooms",
      label: "Not enough rooms held",
      detail: `${roomsNeeded} rooms needed, ${roomsHeld} contracted`,
      kind: "logistics",
      severity: roomScore < 0.5 ? "important" : "attention",
      href: "/logistics",
      _share: 0,
    });
  }

  // 3. Is everyone who needs a lift covered?
  const needPickup = snapshot.travel.filter(
    (t) => t.direction === "ARRIVAL" && t.pickupRequired,
  );
  const assignedPickups = needPickup.filter((t) => t.journeyId).length;
  const transportScore = needPickup.length === 0 ? 1 : assignedPickups / needPickup.length;
  signals.push({ weight: 2, score: transportScore });
  if (transportScore < 1) {
    blockers.push({
      key: "logistics:transport",
      label: "Airport pickups unassigned",
      detail: `${needPickup.length - assignedPickups} arrivals have no vehicle assigned`,
      kind: "logistics",
      severity: "attention",
      href: "/logistics",
      _share: 0,
    });
  }

  // 4. Does someone own every important responsibility?
  const important = snapshot.responsibilities.filter((r) => r.importance >= 3);
  const owned = important.filter((r) => r.ownerId).length;
  const ownershipScore = important.length === 0 ? 1 : owned / important.length;
  signals.push({ weight: 1, score: ownershipScore });
  if (ownershipScore < 1) {
    blockers.push({
      key: "ops:responsibility",
      label: "Unassigned responsibilities",
      detail: `${important.length - owned} important jobs have nobody's name against them`,
      kind: "logistics",
      severity: "attention",
      href: "/logistics?view=responsibilities",
      _share: 0,
    });
  }

  const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
  const score = signals.reduce((s, x) => s + x.weight * x.score, 0) / totalWeight;

  // Distribute each blocker's share proportionally to its signal's shortfall.
  const shortfalls = [
    { key: "guest:rsvp", weight: 3, score: rsvpScore },
    { key: "logistics:rooms", weight: 2, score: roomScore },
    { key: "logistics:transport", weight: 2, score: transportScore },
    { key: "ops:responsibility", weight: 1, score: ownershipScore },
  ];
  for (const blocker of blockers) {
    const match = shortfalls.find((s) => s.key === blocker.key);
    if (match) blocker._share = (match.weight * (1 - match.score)) / totalWeight;
  }

  return {
    score,
    summary: `${Math.round(rsvpScore * 100)}% of RSVPs in`,
    blockers,
  };
}

function scoreEventOperations(
  snapshot: WeddingSnapshot,
  event: EventNode,
  guests: EventGuestCounts,
): PartialComponent {
  const blockers: (Omit<ReadinessBlocker, "pointsCost"> & { _share: number })[] = [];
  const signals: { key: string; weight: number; score: number }[] = [];

  // Venue confirmed?
  const venue = event.venueId
    ? snapshot.venues.find((v) => v.id === event.venueId)
    : null;
  const venueScore = venue ? 1 : 0;
  signals.push({ key: "venue", weight: 4, score: venueScore });
  if (!venue) {
    blockers.push({
      key: `event:venue:${event.id}`,
      label: `${event.name} venue not confirmed`,
      detail: "No venue is attached to this event yet.",
      kind: "logistics",
      severity: "critical",
      href: `/events/${event.slug}`,
      _share: 0,
    });
  }

  // Capacity headroom.
  if (venue?.capacity) {
    const withinCapacity = guests.expected <= venue.capacity;
    signals.push({ key: "capacity", weight: 2, score: withinCapacity ? 1 : 0 });
    if (!withinCapacity) {
      blockers.push({
        key: `event:capacity:${event.id}`,
        label: `${event.name} may exceed venue capacity`,
        detail: `${guests.expected} expected vs ${venue.capacity} capacity at ${venue.name}`,
        kind: "logistics",
        severity: "critical",
        href: `/events/${event.slug}`,
        _share: 0,
      });
    }
  }

  // RSVPs for this event specifically.
  const rsvpScore = guests.invited === 0 ? 0 : (guests.confirmed + guests.declined) / guests.invited;
  signals.push({ key: "rsvp", weight: 3, score: rsvpScore });
  if (rsvpScore < 1) {
    blockers.push({
      key: `event:rsvp:${event.id}`,
      label: guests.invited === 0 ? "No guests invited yet" : `${guests.pending} guests haven't replied`,
      detail: `${guests.confirmed} confirmed of ${guests.invited} invited`,
      kind: "guest",
      severity: "attention",
      href: `/guests?event=${event.id}`,
      _share: 0,
    });
  }

  // Is there a run of show?
  const entries = snapshot.timeline.filter((t) => t.eventId === event.id);
  const timelineScore = entries.length === 0 ? 0 : Math.min(1, entries.length / 6);
  signals.push({ key: "timeline", weight: 2, score: timelineScore });
  if (timelineScore < 1) {
    blockers.push({
      key: `event:timeline:${event.id}`,
      label: entries.length === 0 ? "No run of show yet" : "Run of show is thin",
      detail: entries.length === 0
        ? "Build a minute-by-minute schedule for the day."
        : `Only ${entries.length} timeline entries so far`,
      kind: "logistics",
      severity: entries.length === 0 ? "attention" : "info",
      href: `/timeline?event=${event.id}`,
      _share: 0,
    });
  }

  const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
  const score = signals.reduce((s, x) => s + x.weight * x.score, 0) / totalWeight;

  const keyMap: Record<string, string> = {
    venue: `event:venue:${event.id}`,
    capacity: `event:capacity:${event.id}`,
    rsvp: `event:rsvp:${event.id}`,
    timeline: `event:timeline:${event.id}`,
  };
  for (const blocker of blockers) {
    const signal = signals.find((s) => keyMap[s.key] === blocker.key);
    if (signal) blocker._share = (signal.weight * (1 - signal.score)) / totalWeight;
  }

  return { score, summary: venue ? venue.name : "Venue not confirmed", blockers };
}

// ─────────────────────────────────────────────────────────────────── Assembly

function assemble(
  parts: (PartialComponent & { key: string; label: string; weight: number })[],
  tasks: AnalysedTask[],
): ReadinessResult {
  const components: ReadinessComponent[] = parts.map((part) => ({
    key: part.key,
    label: part.label,
    weight: part.weight,
    score: part.score,
    points: round1(part.weight * part.score * 100),
    maxPoints: round1(part.weight * 100),
    summary: part.summary,
  }));

  const raw = parts.reduce((sum, part) => sum + part.weight * part.score, 0);

  // Convert each component-local share into absolute percentage points of the
  // final score. This is what makes "costing you 4.2%" literally true.
  const blockers: ReadinessBlocker[] = [];
  for (const part of parts) {
    for (const blocker of part.blockers) {
      const share = (blocker as { _share?: number })._share ?? 0;
      const { _share, ...rest } = blocker as Omit<ReadinessBlocker, "pointsCost"> & {
        _share?: number;
      };
      void _share;
      blockers.push({ ...rest, pointsCost: round1(share * part.weight * 100) });
    }
  }
  blockers.sort((a, b) => b.pointsCost - a.pointsCost);

  return {
    percent: Math.round(raw * 100),
    components,
    blockers: blockers.filter((b) => b.pointsCost > 0.05).slice(0, 15),
    stats: {
      tasksTotal: tasks.length,
      tasksDone: tasks.filter((t) => t.isDone).length,
      tasksOpen: tasks.filter((t) => !t.isDone).length,
      tasksOverdue: tasks.filter((t) => t.isOverdue).length,
      tasksBlocked: tasks.filter((t) => t.isBlocked).length,
      criticalOpen: tasks.filter((t) => !t.isDone && t.priority === "CRITICAL").length,
    },
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
