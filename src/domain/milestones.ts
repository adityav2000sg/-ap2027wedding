/**
 * Milestones.
 *
 * Restrained gamification: real planning achievements, evaluated from live
 * data. No points, no badges, no streaks — just the handful of moments that
 * genuinely feel like progress when you're planning a wedding.
 *
 * Each milestone's condition is a pure predicate over the snapshot, so a
 * milestone can never be "achieved" while the underlying fact isn't true.
 */

import { daysBetween } from "@/lib/dates";
import type { BudgetView } from "./budget";
import type { AnalysedTask } from "./tasks";
import type { WeddingSnapshot } from "./types";

export interface MilestoneDefinition {
  key: string;
  title: string;
  description: string;
  sortOrder: number;
  /** Whether the milestone is currently true. */
  isMet(context: MilestoneContext): boolean;
  /** Optional progress towards it, 0–1, for the ones worth showing a bar for. */
  progress?(context: MilestoneContext): number;
}

export interface MilestoneContext {
  snapshot: WeddingSnapshot;
  tasks: AnalysedTask[];
  budget: BudgetView;
}

const ESSENTIAL_VENDOR_CATEGORIES = [
  "VENUE", "CATERING", "PHOTOGRAPHY", "DECOR", "PRIEST", "MAKEUP",
] as const;

export const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  {
    key: "events-defined",
    title: "Events Defined",
    description: "Every function across the wedding has a date and a slot.",
    sortOrder: 10,
    isMet: ({ snapshot }) => snapshot.events.length >= 3,
  },
  {
    key: "budget-created",
    title: "Budget Created",
    description: "A real budget with categories and allocations, not a guess.",
    sortOrder: 20,
    isMet: ({ budget }) =>
      budget.finance.totalBudget > 0 && budget.categories.length >= 5,
  },
  {
    key: "venue-locked",
    title: "Venue Locked",
    description: "Every event has a confirmed venue behind it.",
    sortOrder: 30,
    isMet: ({ snapshot }) =>
      snapshot.events.length > 0 && snapshot.events.every((e) => e.venueId !== null),
    progress: ({ snapshot }) =>
      snapshot.events.length === 0
        ? 0
        : snapshot.events.filter((e) => e.venueId).length / snapshot.events.length,
  },
  {
    key: "major-vendors-booked",
    title: "All Major Vendors Booked",
    description: "Venue, catering, photography, decor, pandit and makeup all contracted.",
    sortOrder: 40,
    isMet: ({ snapshot }) =>
      ESSENTIAL_VENDOR_CATEGORIES.every((category) =>
        snapshot.vendors.some(
          (v) =>
            v.category === category &&
            ["CONTRACTED", "ACTIVE", "COMPLETED"].includes(v.status),
        ),
      ),
    progress: ({ snapshot }) =>
      ESSENTIAL_VENDOR_CATEGORIES.filter((category) =>
        snapshot.vendors.some(
          (v) =>
            v.category === category &&
            ["CONTRACTED", "ACTIVE", "COMPLETED"].includes(v.status),
        ),
      ).length / ESSENTIAL_VENDOR_CATEGORIES.length,
  },
  {
    key: "invitations-sent",
    title: "Invitations Sent",
    description: "The invitations are out and RSVPs can start coming in.",
    sortOrder: 50,
    isMet: ({ snapshot }) => {
      const total = snapshot.households.length;
      if (total === 0) return false;
      const sent = snapshot.households.filter(
        (h) => h.invitationStatus === "INVITED" || h.invitationStatus === "DELIVERED",
      ).length;
      return sent / total >= 0.9;
    },
    progress: ({ snapshot }) => {
      const total = snapshot.households.length;
      if (total === 0) return 0;
      return (
        snapshot.households.filter(
          (h) => h.invitationStatus === "INVITED" || h.invitationStatus === "DELIVERED",
        ).length / total
      );
    },
  },
  {
    key: "halfway-there",
    title: "Halfway There",
    description: "Overall wedding readiness passed 50%.",
    sortOrder: 60,
    isMet: ({ snapshot, tasks }) => {
      const active = tasks.filter((t) => t.status !== "CANCELLED");
      if (active.length === 0) return false;
      void snapshot;
      const weighted = active.reduce(
        (acc, t) => ({
          earned: acc.earned + t.weight * t.progress,
          possible: acc.possible + t.weight,
        }),
        { earned: 0, possible: 0 },
      );
      return weighted.possible > 0 && weighted.earned / weighted.possible >= 0.5;
    },
  },
  {
    key: "rsvp-half",
    title: "Half the Replies In",
    description: "50% of invited guests have told you whether they're coming.",
    sortOrder: 70,
    isMet: ({ budget }) => {
      const c = budget.drivers.guestCounts;
      return c.invited > 0 && (c.confirmed + c.declined) / c.invited >= 0.5;
    },
    progress: ({ budget }) => {
      const c = budget.drivers.guestCounts;
      return c.invited === 0 ? 0 : Math.min(1, ((c.confirmed + c.declined) / c.invited) / 0.5);
    },
  },
  {
    key: "guest-list-final",
    title: "Guest List Finalised",
    description: "Every invited guest has answered — the final headcount is real.",
    sortOrder: 80,
    isMet: ({ budget }) => {
      const c = budget.drivers.guestCounts;
      return c.invited > 0 && c.pending === 0;
    },
  },
  {
    key: "outfits-ready",
    title: "Outfits Ready",
    description: "Every outfit is through alterations and ready to wear.",
    sortOrder: 90,
    isMet: ({ snapshot }) =>
      snapshot.outfits.length > 0 &&
      snapshot.outfits.every((o) => ["READY", "WORN", "RETURNED"].includes(o.status)),
    progress: ({ snapshot }) =>
      snapshot.outfits.length === 0
        ? 0
        : snapshot.outfits.filter((o) => ["READY", "WORN", "RETURNED"].includes(o.status))
            .length / snapshot.outfits.length,
  },
  {
    key: "logistics-ready",
    title: "Logistics Ready",
    description: "Everyone who needs a room has one, and every arrival has a lift.",
    sortOrder: 100,
    isMet: ({ snapshot, budget }) => {
      const needRooms = snapshot.guests.filter((g) => g.needsAccommodation);
      const allHoused = needRooms.every((g) =>
        snapshot.stays.some((s) => s.guestId === g.id),
      );
      const pickups = snapshot.travel.filter(
        (t) => t.direction === "ARRIVAL" && t.pickupRequired,
      );
      const allCollected = pickups.every((t) => t.journeyId);
      void budget;
      return needRooms.length > 0 && allHoused && allCollected;
    },
  },
  {
    key: "payments-scheduled",
    title: "Final Payments Scheduled",
    description: "Every remaining rupee has a date against it.",
    sortOrder: 110,
    isMet: ({ snapshot, budget }) => {
      if (snapshot.payments.length === 0) return false;
      const outstanding = budget.finance.forecast - budget.finance.paid;
      const scheduled = budget.finance.scheduledUnpaid;
      return outstanding <= 0 || scheduled >= outstanding * 0.95;
    },
  },
  {
    key: "thirty-days",
    title: "30 Days To Go",
    description: "One month out. The wedding is close enough to touch.",
    sortOrder: 120,
    isMet: ({ snapshot }) => {
      const days = daysBetween(snapshot.today, snapshot.wedding.startDate);
      return days <= 30;
    },
  },
  {
    key: "wedding-week-ready",
    title: "Wedding Week Ready",
    description: "No overdue important tasks, no unsigned contracts, nothing overdue to pay.",
    sortOrder: 130,
    isMet: ({ snapshot, tasks, budget }) => {
      const criticalOverdue = tasks.some((t) => t.isOverdue && t.importance >= 4);
      const unsigned = snapshot.vendors.some((v) => v.status === "SELECTED");
      return !criticalOverdue && !unsigned && budget.finance.overdueAmount === 0;
    },
  },
];

export interface EvaluatedMilestone {
  key: string;
  title: string;
  description: string;
  sortOrder: number;
  isMet: boolean;
  progress: number;
  achievedAt: Date | null;
}

export function evaluateMilestones(context: MilestoneContext): EvaluatedMilestone[] {
  const stored = new Map(context.snapshot.milestones.map((m) => [m.key, m]));

  return MILESTONE_DEFINITIONS.map((definition) => {
    const isMet = definition.isMet(context);
    const record = stored.get(definition.key);
    return {
      key: definition.key,
      title: definition.title,
      description: definition.description,
      sortOrder: definition.sortOrder,
      isMet,
      progress: isMet ? 1 : Math.min(1, Math.max(0, definition.progress?.(context) ?? 0)),
      achievedAt: record?.achievedAt ?? null,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Milestones whose truth has changed since we last recorded them. The caller
 * persists these and writes activity entries, so "Venue Locked" is celebrated
 * exactly once.
 */
export function newlyAchieved(context: MilestoneContext): EvaluatedMilestone[] {
  return evaluateMilestones(context).filter((m) => m.isMet && !m.achievedAt);
}

/** The next milestone worth chasing — shown on Home as "Next milestone". */
export function nextMilestone(context: MilestoneContext): EvaluatedMilestone | null {
  const pending = evaluateMilestones(context).filter((m) => !m.isMet);
  if (pending.length === 0) return null;
  // Whichever is closest to done, tie-broken by natural planning order.
  return pending.sort(
    (a, b) => b.progress - a.progress || a.sortOrder - b.sortOrder,
  )[0];
}
