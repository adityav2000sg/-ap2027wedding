/**
 * Change impact engine.
 *
 * Rather than hand-maintaining a list of "if X changes, warn about Y", this
 * applies the proposed change to a *copy* of the snapshot, recomputes the
 * derived world, and diffs it. The consequences therefore can never drift out
 * of sync with the forecasting rules — they're computed by the same code.
 *
 * Nothing here writes. It returns a report; the caller decides what to do with
 * it, and the user always sees it before anything is applied.
 */

import { formatMinute, formatMediumDate, toISODate } from "@/lib/dates";
import { formatMoney, round2 } from "@/lib/money";
import { buildBudgetView, type BudgetView } from "./budget";
import { analyseTasks } from "./tasks";
import { computeWeddingReadiness } from "./readiness";
import { proposeShift, type ProposedMove } from "./timeline";
import type {
  BudgetItemNode,
  EntityRef,
  RsvpStatus,
  Severity,
  VendorStatus,
  WeddingSnapshot,
} from "./types";

export type PlannedChange =
  | { type: "event.time"; eventId: string; startMinute: number; endMinute: number }
  | { type: "event.date"; eventId: string; date: Date }
  | { type: "event.venue"; eventId: string; venueId: string | null }
  | { type: "event.guests"; eventId: string; estimatedGuests: number }
  | { type: "guest.rsvp"; guestId: string; eventId: string; status: RsvpStatus }
  | { type: "guest.accommodation"; guestId: string; needsAccommodation: boolean }
  | { type: "wedding.guests"; estimatedGuests: number }
  | { type: "wedding.budget"; totalBudget: number }
  | { type: "vendor.quote"; vendorId: string; amount: number }
  | { type: "vendor.status"; vendorId: string; status: VendorStatus }
  | { type: "budgetItem.update"; itemId: string; patch: Partial<BudgetItemNode> };

/**
 * What kind of consequence this is. The distinction matters — a number that
 * deterministically recalculates is not the same as something that has just
 * become a problem, and neither is a suggestion.
 */
export type ImpactKind =
  /** What the user explicitly changed. */
  | "direct"
  /** A figure that updates deterministically as a result. */
  | "automatic"
  /** Something that becomes problematic because of the change. */
  | "risk"
  /** Something the system thinks they should now do. */
  | "suggestion";

export interface Impact {
  type: "budget" | "readiness" | "timeline" | "vendor" | "guest" | "logistics" | "task";
  kind: ImpactKind;
  severity: Severity;
  message: string;
  detail?: string;
  entity?: EntityRef;
  /** Signed change in the wedding's base currency, when financial. */
  delta?: number;
}

export interface ImpactReport {
  source: { label: string; description: string };
  /** True when this is big enough that a human should confirm it. */
  material: boolean;
  impacts: Impact[];
  finance: { before: number; after: number; delta: number } | null;
  readiness: { before: number; after: number; delta: number } | null;
  timelineMoves: ProposedMove[];
}

/** Financial moves above this deserve an explicit confirmation. */
const MATERIAL_MONEY_THRESHOLD = 25_000;

export function analyseChange(
  snapshot: WeddingSnapshot,
  change: PlannedChange,
): ImpactReport {
  const before = { budget: buildBudgetView(snapshot), snapshot };
  const afterSnapshot = applyChange(snapshot, change);
  const afterBudget = buildBudgetView(afterSnapshot);

  const impacts: Impact[] = [];
  const timelineMoves: ProposedMove[] = [];

  /** Most consequences are deterministic recalculations. */
  const add = (impact: Omit<Impact, "kind"> & { kind?: ImpactKind }) =>
    impacts.push({ kind: "automatic", ...impact });

  // ── Financial consequences, computed not guessed ──────────────────────────
  const forecastDelta = round2(afterBudget.finance.forecast - before.budget.finance.forecast);
  const base = snapshot.wedding.baseCurrency;

  if (Math.abs(forecastDelta) >= 1) {
    add({
      type: "budget",
      severity: severityForMoney(forecastDelta, snapshot.wedding.totalBudget),
      message: `Wedding forecast ${forecastDelta > 0 ? "increases" : "decreases"} by ${formatMoney(Math.abs(forecastDelta), base)}`,
      detail: `${formatMoney(before.budget.finance.forecast, base)} → ${formatMoney(afterBudget.finance.forecast, base)}`,
      delta: forecastDelta,
    });

    // Which categories actually moved?
    const beforeByCategory = new Map(before.budget.categories.map((c) => [c.categoryId, c]));
    for (const category of afterBudget.categories) {
      const previous = beforeByCategory.get(category.categoryId);
      if (!previous) continue;
      const delta = round2(category.forecast - previous.forecast);
      if (Math.abs(delta) < 1) continue;
      add({
        type: "budget",
        severity: "info",
        message: `${category.name} forecast ${delta > 0 ? "up" : "down"} ${formatMoney(Math.abs(delta), base)}`,
        detail: `Now ${formatMoney(category.forecast, base)} against ${formatMoney(category.allocated, base)} allocated`,
        entity: { type: "category", id: category.categoryId, label: category.name, href: "/budget" },
        delta,
      });
    }
  }

  // Crossing the budget ceiling is a state change worth calling out on its own.
  if (!before.budget.finance.isOverBudget && afterBudget.finance.isOverBudget) {
    add({
      type: "budget",
      kind: "risk",
      severity: "critical",
      message: `This pushes the wedding over budget by ${formatMoney(afterBudget.finance.variance, base)}`,
      detail: `Total budget is ${formatMoney(snapshot.wedding.totalBudget, base)}`,
    });
  } else if (before.budget.finance.isOverBudget && !afterBudget.finance.isOverBudget) {
    add({
      type: "budget",
      severity: "info",
      message: "This brings the wedding back within budget",
    });
  }

  // ── Change-specific consequences ──────────────────────────────────────────
  switch (change.type) {
    case "event.time": {
      const event = snapshot.events.find((e) => e.id === change.eventId);
      if (event) {
        const delta = change.startMinute - event.startMinute;
        if (delta !== 0) {
          // Anything scheduled inside this event shifts with it.
          const anchors = snapshot.timeline.filter((t) => t.eventId === event.id);
          for (const anchor of anchors) {
            const proposal = proposeShift(
              snapshot.timeline,
              snapshot.timelineDeps,
              anchor.id,
              delta,
            );
            for (const move of proposal.moves) {
              if (!timelineMoves.some((m) => m.entryId === move.entryId)) {
                timelineMoves.push(move);
              }
            }
          }

          add({
            type: "timeline",
            kind: "direct",
            severity: Math.abs(delta) >= 30 ? "important" : "attention",
            message: `${event.name} moves ${Math.abs(delta)} minutes ${delta > 0 ? "later" : "earlier"}`,
            detail: `${formatMinute(event.startMinute)} → ${formatMinute(change.startMinute)}`,
            entity: { type: "event", id: event.id, label: event.name, href: `/events/${event.slug}` },
          });

          // Every vendor working this event has a call time keyed to it.
          const affectedVendors = snapshot.vendors.filter((v) => v.eventIds.includes(event.id));
          for (const vendor of affectedVendors) {
            add({
              type: "vendor",
              kind: "suggestion",
              severity: "attention",
              message: `${vendor.businessName} needs a new call time`,
              detail: `${VENDOR_CATEGORY_LABEL[vendor.category] ?? vendor.category} for ${event.name}`,
              entity: { type: "vendor", id: vendor.id, label: vendor.businessName, href: `/vendors/${vendor.id}` },
            });
          }

          const venue = event.venueId
            ? snapshot.venues.find((v) => v.id === event.venueId)
            : null;
          if (venue?.curfewMinute && change.endMinute > venue.curfewMinute) {
            add({
              type: "timeline",
              kind: "risk",
              severity: "critical",
              message: `${event.name} would run past ${venue.name}'s curfew`,
              detail: `Curfew is ${formatMinute(venue.curfewMinute)}; the event would end at ${formatMinute(change.endMinute)}.`,
            });
          }
        }
      }
      break;
    }

    case "event.date": {
      const event = snapshot.events.find((e) => e.id === change.eventId);
      if (event) {
        add({
          type: "timeline",
          kind: "direct",
          severity: "important",
          message: `${event.name} moves to ${formatMediumDate(change.date)}`,
          detail: `Was ${formatMediumDate(event.date)}`,
          entity: { type: "event", id: event.id, label: event.name, href: `/events/${event.slug}` },
        });

        const entries = snapshot.timeline.filter((t) => t.eventId === event.id);
        if (entries.length) {
          add({
            kind: "suggestion",
            type: "timeline",
            severity: "attention",
            message: `${entries.length} run-of-show ${entries.length === 1 ? "entry" : "entries"} need moving to the new date`,
          });
        }

        const openTasks = snapshot.tasks.filter(
          (t) => t.eventId === event.id && t.status !== "DONE" && t.status !== "CANCELLED",
        );
        if (openTasks.length) {
          add({
            kind: "suggestion",
            type: "task",
            severity: "attention",
            message: `${openTasks.length} open ${openTasks.length === 1 ? "task" : "tasks"} are dated against this event`,
            detail: "Their deadlines may need shifting too.",
          });
        }

        const vendors = snapshot.vendors.filter((v) => v.eventIds.includes(event.id));
        if (vendors.length) {
          add({
            kind: "suggestion",
            type: "vendor",
            severity: "important",
            message: `${vendors.length} ${vendors.length === 1 ? "vendor needs" : "vendors need"} to confirm the new date`,
            detail: vendors.slice(0, 4).map((v) => v.businessName).join(", "),
          });
        }
      }
      break;
    }

    case "event.venue": {
      const event = snapshot.events.find((e) => e.id === change.eventId);
      const venue = change.venueId ? snapshot.venues.find((v) => v.id === change.venueId) : null;
      if (event) {
        const counts = afterBudget.drivers.eventCounts.get(event.id);
        if (venue?.capacity && counts && counts.expected > venue.capacity) {
          add({
            type: "logistics",
            kind: "risk",
            severity: "critical",
            message: `${venue.name} may be too small for ${event.name}`,
            detail: `${counts.expected} guests expected against a capacity of ${venue.capacity}.`,
          });
        }
        if (venue && !venue.hasRainBackup) {
          add({
            type: "logistics",
            kind: "risk",
            severity: "attention",
            message: `${venue.name} has no rain backup recorded`,
            detail: "June in North India — worth confirming a wet-weather plan.",
          });
        }
        add({
          type: "timeline",
          kind: "suggestion",
          severity: "attention",
          message: "Transport routes and vendor load-in times will need revisiting",
        });
      }
      break;
    }

    case "guest.rsvp":
    case "wedding.guests":
    case "event.guests": {
      const beforeDrivers = before.budget.drivers;
      const afterDrivers = afterBudget.drivers;
      const beforeCount = beforeDrivers.guestCounts.confirmed + beforeDrivers.guestCounts.pending;
      const afterCount = afterDrivers.guestCounts.confirmed + afterDrivers.guestCounts.pending;

      if (afterCount !== beforeCount) {
        add({
          type: "guest",
          kind: "direct",
          severity: "info",
          message: `Expected headcount ${afterCount > beforeCount ? "rises" : "falls"} from ${beforeCount} to ${afterCount}`,
        });
      }

      addCapacityImpacts(snapshot, afterBudget, impacts);
      addRoomImpacts(snapshot, afterBudget, impacts);
      break;
    }

    case "guest.accommodation": {
      addRoomImpacts(afterSnapshot, afterBudget, impacts);
      break;
    }

    case "vendor.status": {
      const vendor = snapshot.vendors.find((v) => v.id === change.vendorId);
      if (vendor) {
        add({
          kind: "direct",
          type: "vendor",
          severity: "info",
          message: `${vendor.businessName}: ${VENDOR_STATUS_TEXT[vendor.status]} → ${VENDOR_STATUS_TEXT[change.status]}`,
          entity: { type: "vendor", id: vendor.id, label: vendor.businessName, href: `/vendors/${vendor.id}` },
        });

        if (change.status === "SELECTED" || change.status === "CONTRACTED") {
          const rivals = snapshot.vendors.filter(
            (v) =>
              v.id !== vendor.id &&
              v.category === vendor.category &&
              !["REJECTED", "COMPLETED"].includes(v.status),
          );
          if (rivals.length) {
            add({
              type: "vendor",
              kind: "suggestion",
              severity: "info",
              message: `${rivals.length} other ${VENDOR_CATEGORY_LABEL[vendor.category]?.toLowerCase() ?? "vendor"} option${rivals.length === 1 ? "" : "s"} can be closed out`,
              detail: rivals.map((v) => v.businessName).join(", "),
            });
          }
          if (!snapshot.budgetItems.some((i) => i.vendorId === vendor.id)) {
            add({
              type: "budget",
              kind: "risk",
              severity: "attention",
              message: "No budget line is linked to this vendor yet",
              detail: "Selecting them without a budget line leaves the forecast understated.",
            });
          }
        }
      }
      break;
    }

    case "vendor.quote": {
      const vendor = snapshot.vendors.find((v) => v.id === change.vendorId);
      if (vendor) {
        const previous = vendor.quoteAmount ?? 0;
        add({
          kind: "direct",
          type: "vendor",
          severity: "info",
          message: `${vendor.businessName} quote ${change.amount > previous ? "rises" : "falls"} to ${formatMoney(change.amount, vendor.currency)}`,
          detail: previous ? `Was ${formatMoney(previous, vendor.currency)}` : "First quote recorded",
          entity: { type: "vendor", id: vendor.id, label: vendor.businessName, href: `/vendors/${vendor.id}` },
        });
      }
      break;
    }

    default:
      break;
  }

  // ── Readiness consequences ────────────────────────────────────────────────
  const beforeReadiness = computeWeddingReadiness(
    snapshot,
    analyseTasks(snapshot),
    before.budget,
  ).percent;
  const afterReadiness = computeWeddingReadiness(
    afterSnapshot,
    analyseTasks(afterSnapshot),
    afterBudget,
  ).percent;

  if (afterReadiness !== beforeReadiness) {
    const delta = afterReadiness - beforeReadiness;
    add({
      type: "readiness",
      severity: delta < -3 ? "important" : "info",
      message: `Wedding readiness ${delta > 0 ? "rises" : "falls"} ${Math.abs(delta)} point${Math.abs(delta) === 1 ? "" : "s"} to ${afterReadiness}%`,
    });
  }

  const material =
    Math.abs(forecastDelta) >= MATERIAL_MONEY_THRESHOLD ||
    timelineMoves.length > 1 ||
    impacts.some((i) => i.severity === "critical" || i.severity === "important");

  return {
    source: describeChange(snapshot, change),
    material,
    impacts: dedupe(impacts),
    finance: {
      before: before.budget.finance.forecast,
      after: afterBudget.finance.forecast,
      delta: forecastDelta,
    },
    readiness: { before: beforeReadiness, after: afterReadiness, delta: afterReadiness - beforeReadiness },
    timelineMoves,
  };
}

function addCapacityImpacts(
  snapshot: WeddingSnapshot,
  budget: BudgetView,
  impacts: Impact[],
): void {
  for (const event of snapshot.events) {
    if (!event.venueId) continue;
    const venue = snapshot.venues.find((v) => v.id === event.venueId);
    if (!venue?.capacity) continue;
    const counts = budget.drivers.eventCounts.get(event.id);
    if (!counts) continue;
    if (counts.expected > venue.capacity) {
      impacts.push({
        type: "logistics",
        kind: "risk",
        severity: "critical",
        message: `${event.name} would exceed ${venue.name}'s capacity`,
        detail: `${counts.expected} expected against ${venue.capacity} capacity.`,
        entity: { type: "event", id: event.id, label: event.name, href: `/events/${event.slug}` },
      });
    } else if (counts.expected > venue.capacity * 0.92) {
      impacts.push({
        type: "logistics",
        kind: "risk",
        severity: "attention",
        message: `${event.name} is close to ${venue.name}'s capacity`,
        detail: `${counts.expected} of ${venue.capacity}.`,
      });
    }
  }
}

function addRoomImpacts(
  snapshot: WeddingSnapshot,
  budget: BudgetView,
  impacts: Impact[],
): void {
  const needed = budget.drivers.rooms;
  const held = snapshot.hotels.reduce((sum, h) => sum + h.contractedRooms, 0);
  if (needed > held) {
    impacts.push({
      type: "logistics",
      kind: "risk",
      severity: needed - held > 10 ? "important" : "attention",
      message: `${needed - held} more hotel rooms needed`,
      detail: `${needed} rooms required, ${held} currently contracted.`,
      entity: { type: "logistics", id: "rooms", label: "Accommodation", href: "/logistics" },
    });
  }
}

/**
 * Produce the post-change snapshot. Pure — the input snapshot is never mutated,
 * so callers can safely analyse speculative changes.
 */
export function applyChange(
  snapshot: WeddingSnapshot,
  change: PlannedChange,
): WeddingSnapshot {
  switch (change.type) {
    case "event.time":
      return {
        ...snapshot,
        events: snapshot.events.map((e) =>
          e.id === change.eventId
            ? { ...e, startMinute: change.startMinute, endMinute: change.endMinute }
            : e,
        ),
      };
    case "event.date":
      return {
        ...snapshot,
        events: snapshot.events.map((e) =>
          e.id === change.eventId ? { ...e, date: change.date } : e,
        ),
      };
    case "event.venue":
      return {
        ...snapshot,
        events: snapshot.events.map((e) =>
          e.id === change.eventId ? { ...e, venueId: change.venueId } : e,
        ),
      };
    case "event.guests":
      return {
        ...snapshot,
        events: snapshot.events.map((e) =>
          e.id === change.eventId ? { ...e, estimatedGuests: change.estimatedGuests } : e,
        ),
      };
    case "guest.rsvp": {
      const exists = snapshot.invitations.some(
        (i) => i.guestId === change.guestId && i.eventId === change.eventId,
      );
      return {
        ...snapshot,
        invitations: exists
          ? snapshot.invitations.map((i) =>
              i.guestId === change.guestId && i.eventId === change.eventId
                ? { ...i, status: change.status }
                : i,
            )
          : [
              ...snapshot.invitations,
              {
                id: `simulated-${change.guestId}-${change.eventId}`,
                guestId: change.guestId,
                eventId: change.eventId,
                status: change.status,
                respondedAt: null,
              },
            ],
      };
    }
    case "guest.accommodation":
      return {
        ...snapshot,
        guests: snapshot.guests.map((g) =>
          g.id === change.guestId
            ? { ...g, needsAccommodation: change.needsAccommodation }
            : g,
        ),
      };
    case "wedding.guests":
      return {
        ...snapshot,
        wedding: { ...snapshot.wedding, estimatedGuests: change.estimatedGuests },
      };
    case "wedding.budget":
      return {
        ...snapshot,
        wedding: { ...snapshot.wedding, totalBudget: change.totalBudget },
      };
    case "vendor.quote":
      return {
        ...snapshot,
        vendors: snapshot.vendors.map((v) =>
          v.id === change.vendorId ? { ...v, quoteAmount: change.amount } : v,
        ),
        // A vendor's quote only reaches the forecast through its budget lines.
        budgetItems: snapshot.budgetItems.map((item) =>
          item.vendorId === change.vendorId && item.contractedAmount === null
            ? { ...item, quoteAmount: change.amount }
            : item,
        ),
      };
    case "vendor.status":
      return {
        ...snapshot,
        vendors: snapshot.vendors.map((v) =>
          v.id === change.vendorId ? { ...v, status: change.status } : v,
        ),
      };
    case "budgetItem.update":
      return {
        ...snapshot,
        budgetItems: snapshot.budgetItems.map((item) =>
          item.id === change.itemId ? { ...item, ...change.patch } : item,
        ),
      };
    default:
      return snapshot;
  }
}

function describeChange(
  snapshot: WeddingSnapshot,
  change: PlannedChange,
): { label: string; description: string } {
  switch (change.type) {
    case "event.time": {
      const event = snapshot.events.find((e) => e.id === change.eventId);
      return {
        label: `${event?.name ?? "Event"} time change`,
        description: `Moving to ${formatMinute(change.startMinute)}–${formatMinute(change.endMinute)}`,
      };
    }
    case "event.date": {
      const event = snapshot.events.find((e) => e.id === change.eventId);
      return {
        label: `${event?.name ?? "Event"} date change`,
        description: `Moving to ${formatMediumDate(change.date)}`,
      };
    }
    case "event.venue":
      return { label: "Venue change", description: "Changing where this event happens" };
    case "guest.rsvp":
      return { label: "RSVP update", description: "Recording a guest's response" };
    case "wedding.guests":
      return {
        label: "Guest estimate change",
        description: `Planning for ${change.estimatedGuests} guests`,
      };
    case "wedding.budget":
      return {
        label: "Budget change",
        description: `Total budget set to ${formatMoney(change.totalBudget, snapshot.wedding.baseCurrency)}`,
      };
    case "vendor.quote": {
      const vendor = snapshot.vendors.find((v) => v.id === change.vendorId);
      return {
        label: `${vendor?.businessName ?? "Vendor"} quote change`,
        description: `New quote of ${formatMoney(change.amount, vendor?.currency ?? snapshot.wedding.baseCurrency)}`,
      };
    }
    case "vendor.status": {
      const vendor = snapshot.vendors.find((v) => v.id === change.vendorId);
      return {
        label: `${vendor?.businessName ?? "Vendor"} status change`,
        description: VENDOR_STATUS_TEXT[change.status],
      };
    }
    case "event.guests": {
      const event = snapshot.events.find((e) => e.id === change.eventId);
      return {
        label: `${event?.name ?? "Event"} attendance change`,
        description: `Planning for ${change.estimatedGuests} guests`,
      };
    }
    case "guest.accommodation":
      return { label: "Accommodation change", description: "Updating a guest's room requirement" };
    default:
      return { label: "Change", description: "" };
  }
}

function severityForMoney(delta: number, totalBudget: number): Severity {
  const magnitude = Math.abs(delta);
  if (delta < 0) return "info";
  if (totalBudget > 0 && magnitude > totalBudget * 0.03) return "critical";
  if (magnitude >= 250_000) return "important";
  if (magnitude >= MATERIAL_MONEY_THRESHOLD) return "attention";
  return "info";
}

function dedupe(impacts: Impact[]): Impact[] {
  const seen = new Set<string>();
  return impacts.filter((impact) => {
    const key = `${impact.type}:${impact.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const VENDOR_STATUS_TEXT: Record<VendorStatus, string> = {
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

export const VENDOR_CATEGORY_LABEL: Record<string, string> = {
  VENUE: "Venue",
  CATERING: "Catering",
  DECOR: "Decor",
  PHOTOGRAPHY: "Photography",
  VIDEOGRAPHY: "Videography",
  MAKEUP: "Hair & makeup",
  MEHENDI: "Mehendi",
  DJ: "DJ",
  ENTERTAINMENT: "Entertainment",
  CHOREOGRAPHY: "Choreography",
  PLANNER: "Planner",
  PRIEST: "Pandit",
  INVITATIONS: "Invitations",
  TRANSPORTATION: "Transport",
  HOTELS: "Hotels",
  JEWELLERY: "Jewellery",
  OUTFITS: "Outfits",
  GIFTS: "Gifts",
  RENTALS: "Rentals",
  SECURITY: "Security",
  HOSPITALITY: "Hospitality",
  AV: "AV",
  LIGHTING: "Lighting",
  OTHER: "Other",
};

/**
 * A cheap fingerprint of everything the impact engine reads.
 *
 * If this differs between preview and apply, somebody else changed something in
 * between and the consequences the user approved may no longer be the real ones.
 * Deliberately covers only the inputs that can move an impact — cosmetic edits
 * like a renamed note shouldn't invalidate a pending preview.
 */
export function impactFingerprint(snapshot: WeddingSnapshot): string {
  const parts: (string | number)[] = [
    snapshot.wedding.estimatedGuests,
    snapshot.wedding.totalBudget,
    snapshot.wedding.guestsPerRoom,
    snapshot.guests.length,
    snapshot.guests.reduce((n, g) => n + (g.needsAccommodation ? 1 : 0), 0),
    snapshot.guests.reduce((n, g) => n + (g.needsTransport ? 1 : 0), 0),
    snapshot.invitations.reduce((n, i) => n + i.status.charCodeAt(0), 0),
    snapshot.hotels.reduce((n, h) => n + h.contractedRooms, 0),
    snapshot.stays.length,
  ];

  for (const event of snapshot.events) {
    parts.push(event.id, event.startMinute, event.endMinute, event.estimatedGuests, event.venueId ?? "-");
  }
  for (const item of snapshot.budgetItems) {
    parts.push(
      item.id, item.allocatedAmount, item.unitRate ?? 0, item.unitQuantity ?? 0,
      item.quoteAmount ?? 0, item.negotiatedAmount ?? 0, item.contractedAmount ?? 0,
    );
  }
  for (const vendor of snapshot.vendors) {
    parts.push(vendor.id, vendor.status, vendor.quoteAmount ?? 0, vendor.contractedAmount ?? 0);
  }
  for (const entry of snapshot.timeline) {
    parts.push(entry.id, entry.startMinute, entry.endMinute);
  }
  for (const rate of snapshot.rates) {
    parts.push(rate.fromCurrency, rate.toCurrency, rate.rate);
  }

  // FNV-1a — fast, stable, and we only need change detection, not security.
  let hash = 0x811c9dc5;
  const source = parts.join("|");
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export { toISODate };
