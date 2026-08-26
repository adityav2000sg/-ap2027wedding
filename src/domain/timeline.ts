/**
 * Timeline engine.
 *
 * Two jobs:
 *   1. Find what's already wrong with a run of show (overlaps, violated gaps,
 *      entries running past the venue curfew, vendors double-booked).
 *   2. Given a proposed move, work out what *else* would have to move — and
 *      return it as a proposal, never as a silent write.
 *
 * Times are minutes-from-midnight, so everything here is integer arithmetic.
 */

import { formatMinute, toISODate } from "@/lib/dates";
import type {
  Severity,
  TimelineEdge,
  TimelineNode,
  VendorNode,
  VenueNode,
  WeddingSnapshot,
} from "./types";

export interface TimelineConflict {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  entryIds: string[];
  kind: "overlap" | "dependency" | "curfew" | "vendor" | "owner";
}

export interface ProposedMove {
  entryId: string;
  title: string;
  fromStart: number;
  toStart: number;
  fromEnd: number;
  toEnd: number;
  /** Why this entry has to move — shown next to each proposed change. */
  reason: string;
}

export interface ShiftProposal {
  moves: ProposedMove[];
  conflicts: TimelineConflict[];
  /** Entries that would need to move but are locked (muhurat, flight times). */
  blockedByLock: { entryId: string; title: string; reason: string }[];
}

/** Everything wrong with the schedule as it currently stands. */
export function detectConflicts(
  entries: TimelineNode[],
  edges: TimelineEdge[],
  context: {
    vendors?: VendorNode[];
    venues?: VenueNode[];
    eventVenue?: Map<string, string | null>;
  } = {},
): TimelineConflict[] {
  const conflicts: TimelineConflict[] = [];
  const byId = new Map(entries.map((e) => [e.id, e]));

  // 1. Dependency gaps that are no longer satisfied.
  for (const edge of edges) {
    const entry = byId.get(edge.entryId);
    const prerequisite = byId.get(edge.dependsOnId);
    if (!entry || !prerequisite) continue;
    if (toISODate(entry.date) !== toISODate(prerequisite.date)) continue;

    const earliestStart = prerequisite.endMinute + edge.gapMinutes;
    if (entry.startMinute < earliestStart) {
      const shortfall = earliestStart - entry.startMinute;
      conflicts.push({
        key: `dep:${edge.entryId}:${edge.dependsOnId}`,
        severity: shortfall > 30 ? "critical" : "important",
        title: `${entry.title} starts too early`,
        detail: `It needs to begin at least ${edge.gapMinutes} min after ${prerequisite.title} ends (${formatMinute(prerequisite.endMinute)}), but it's scheduled for ${formatMinute(entry.startMinute)} — ${shortfall} min too soon.`,
        entryIds: [entry.id, prerequisite.id],
        kind: "dependency",
      });
    }
  }

  // 2. The same person or vendor in two places at once.
  const vendorById = new Map((context.vendors ?? []).map((v) => [v.id, v]));
  const groups = new Map<string, TimelineNode[]>();
  for (const entry of entries) {
    if (!entry.vendorId) continue;
    const key = `${entry.vendorId}:${toISODate(entry.date)}`;
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (current.startMinute < previous.endMinute) {
        const vendorId = key.split(":")[0];
        const vendor = vendorById.get(vendorId);
        conflicts.push({
          key: `vendor:${previous.id}:${current.id}`,
          severity: "important",
          title: `${vendor?.businessName ?? "A vendor"} is double-booked`,
          detail: `“${previous.title}” runs until ${formatMinute(previous.endMinute)} but “${current.title}” starts at ${formatMinute(current.startMinute)}.`,
          entryIds: [previous.id, current.id],
          kind: "vendor",
        });
      }
    }
  }

  // 3. The same *person* in two places at once. Unlike a shared room, this is
  //    always a genuine problem.
  const byDayOwner = new Map<string, TimelineNode[]>();
  for (const entry of entries) {
    if (!entry.ownerId) continue;
    const key = `${entry.ownerId}:${toISODate(entry.date)}`;
    const list = byDayOwner.get(key);
    if (list) list.push(entry);
    else byDayOwner.set(key, [entry]);
  }
  for (const group of byDayOwner.values()) {
    const sorted = [...group].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (current.startMinute < previous.endMinute) {
        conflicts.push({
          key: `owner:${previous.id}:${current.id}`,
          severity: "important",
          title: "The same person is needed in two places",
          detail: `“${previous.title}” runs until ${formatMinute(previous.endMinute)} but “${current.title}” starts at ${formatMinute(current.startMinute)}.`,
          entryIds: [previous.id, current.id],
          kind: "owner",
        });
      }
    }
  }

  // 4. Overlapping entries in the same place.
  //    Weddings are full of legitimate concurrency — photography covers the
  //    whole day, mehendi stations stay open through dinner. So a block that
  //    *contains* another is treated as background activity, not a clash; only
  //    partial overlaps between two discrete activities are worth mentioning,
  //    and even then only as a note.
  const byDayLocation = new Map<string, TimelineNode[]>();
  for (const entry of entries) {
    if (!entry.location) continue;
    const key = `${toISODate(entry.date)}:${entry.location.toLowerCase().trim()}`;
    const list = byDayLocation.get(key);
    if (list) list.push(entry);
    else byDayLocation.set(key, [entry]);
  }
  for (const group of byDayLocation.values()) {
    const sorted = [...group].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (current.startMinute >= previous.endMinute) continue;

      const contains =
        previous.startMinute <= current.startMinute &&
        previous.endMinute >= current.endMinute;
      if (contains) continue;

      conflicts.push({
        key: `overlap:${previous.id}:${current.id}`,
        severity: "info",
        title: `${current.location} is double-booked`,
        detail: `“${previous.title}” runs until ${formatMinute(previous.endMinute)} while “${current.title}” starts at ${formatMinute(current.startMinute)}. Often fine — worth a glance.`,
        entryIds: [previous.id, current.id],
        kind: "overlap",
      });
    }
  }

  // 4. Running past the venue curfew.
  if (context.eventVenue && context.venues) {
    const venueById = new Map(context.venues.map((v) => [v.id, v]));
    for (const entry of entries) {
      if (!entry.eventId) continue;
      const venueId = context.eventVenue.get(entry.eventId);
      if (!venueId) continue;
      const venue = venueById.get(venueId);
      if (!venue?.curfewMinute) continue;
      if (entry.endMinute > venue.curfewMinute) {
        conflicts.push({
          key: `curfew:${entry.id}`,
          severity: "important",
          title: `${entry.title} runs past the venue curfew`,
          detail: `${venue.name} requires everything to finish by ${formatMinute(venue.curfewMinute)}, but this runs until ${formatMinute(entry.endMinute)}.`,
          entryIds: [entry.id],
          kind: "curfew",
        });
      }
    }
  }

  return conflicts;
}

/**
 * Work out the full consequence of moving one entry by `deltaMinutes`.
 *
 * Propagation follows dependency edges only — we don't shove unrelated entries
 * around just because they happen to sit nearby. Locked entries stop the cascade
 * and are reported back so the user can decide what to do.
 */
export function proposeShift(
  entries: TimelineNode[],
  edges: TimelineEdge[],
  movedEntryId: string,
  deltaMinutes: number,
): ShiftProposal {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const root = byId.get(movedEntryId);
  if (!root || deltaMinutes === 0) {
    return { moves: [], conflicts: [], blockedByLock: [] };
  }

  const dependents = new Map<string, TimelineEdge[]>();
  for (const edge of edges) {
    const list = dependents.get(edge.dependsOnId);
    if (list) list.push(edge);
    else dependents.set(edge.dependsOnId, [edge]);
  }

  const moves = new Map<string, ProposedMove>();
  const blockedByLock: { entryId: string; title: string; reason: string }[] = [];

  moves.set(root.id, {
    entryId: root.id,
    title: root.title,
    fromStart: root.startMinute,
    toStart: root.startMinute + deltaMinutes,
    fromEnd: root.endMinute,
    toEnd: root.endMinute + deltaMinutes,
    reason: "You moved this",
  });

  // Breadth-first along dependency edges. Only push a dependent later if the
  // new prerequisite end time actually forces it.
  const queue: string[] = [root.id];
  const visited = new Set<string>();

  while (queue.length) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentMove = moves.get(currentId);
    const current = byId.get(currentId);
    if (!current || !currentMove) continue;

    for (const edge of dependents.get(currentId) ?? []) {
      const dependent = byId.get(edge.entryId);
      if (!dependent) continue;
      if (toISODate(dependent.date) !== toISODate(current.date)) continue;

      const existing = moves.get(dependent.id);
      const currentStart = existing ? existing.toStart : dependent.startMinute;
      const requiredStart = currentMove.toEnd + edge.gapMinutes;

      if (requiredStart <= currentStart) continue; // Still fine where it is.

      if (dependent.isLocked) {
        blockedByLock.push({
          entryId: dependent.id,
          title: dependent.title,
          reason: `Fixed at ${formatMinute(dependent.startMinute)} — it would need to move to ${formatMinute(requiredStart)}`,
        });
        continue;
      }

      const shift = requiredStart - dependent.startMinute;
      moves.set(dependent.id, {
        entryId: dependent.id,
        title: dependent.title,
        fromStart: dependent.startMinute,
        toStart: dependent.startMinute + shift,
        fromEnd: dependent.endMinute,
        toEnd: dependent.endMinute + shift,
        reason: `Must start ${edge.gapMinutes > 0 ? `${edge.gapMinutes} min ` : ""}after ${current.title}`,
      });
      queue.push(dependent.id);
    }
  }

  // Re-check the whole schedule as it *would* look after applying the moves.
  const projected = entries.map((entry) => {
    const move = moves.get(entry.id);
    return move
      ? { ...entry, startMinute: move.toStart, endMinute: move.toEnd }
      : entry;
  });

  return {
    moves: [...moves.values()].sort((a, b) => a.toStart - b.toStart),
    conflicts: detectConflicts(projected, edges),
    blockedByLock,
  };
}

/** Group a day's entries for rendering, in running order. */
export function groupTimelineByDay(
  entries: TimelineNode[],
): { date: string; entries: TimelineNode[] }[] {
  const byDay = new Map<string, TimelineNode[]>();
  for (const entry of entries) {
    const key = toISODate(entry.date);
    const list = byDay.get(key);
    if (list) list.push(entry);
    else byDay.set(key, [entry]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      entries: list.sort(
        (a, b) => a.startMinute - b.startMinute || a.sortOrder - b.sortOrder,
      ),
    }));
}

/** The next thing happening, used by wedding-week mode. */
export function nextEntry(
  entries: TimelineNode[],
  now: Date,
): TimelineNode | null {
  const todayKey = toISODate(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  const candidates = entries
    .filter((e) => toISODate(e.date) === todayKey)
    .filter((e) => e.endMinute >= minute && e.status !== "DONE" && e.status !== "CANCELLED")
    .sort((a, b) => a.startMinute - b.startMinute);
  return candidates[0] ?? null;
}

export function snapshotEventVenues(snapshot: WeddingSnapshot): Map<string, string | null> {
  return new Map(snapshot.events.map((e) => [e.id, e.venueId]));
}
