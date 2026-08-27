import "server-only";

/**
 * Global search.
 *
 * Ranks across every entity type the user is allowed to see. Runs off the
 * snapshot rather than issuing per-type queries, so results are consistent with
 * whatever the rest of the page is showing.
 */

import { formatMediumDate } from "@/lib/dates";
import { formatCompactMoney } from "@/lib/money";
import { buildConverter } from "@/domain/currency";
import { VENDOR_CATEGORY_LABEL, VENDOR_STATUS_TEXT } from "@/domain/impact";
import { TASK_STATUS_LABEL } from "@/domain/tasks";
import type { WeddingSnapshot } from "@/domain/types";
import type { Viewer } from "./permissions";

export interface SearchResult {
  id: string;
  type: "guest" | "vendor" | "task" | "event" | "payment" | "document" | "outfit" | "timeline";
  title: string;
  subtitle: string;
  href: string;
  score: number;
}

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  guest: "Guest",
  vendor: "Vendor",
  task: "Task",
  event: "Event",
  payment: "Payment",
  document: "Document",
  outfit: "Outfit",
  timeline: "Run of show",
};

export function typeLabel(type: SearchResult["type"]): string {
  return TYPE_LABEL[type];
}

/**
 * Scores a candidate against the query. Prefix and word-start matches rank
 * above mid-string ones, so typing "rah" finds Rahul before Prahlad.
 */
function score(query: string, ...fields: (string | null | undefined)[]): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  let best = 0;
  for (const [index, field] of fields.entries()) {
    if (!field) continue;
    const value = field.toLowerCase();
    // Later fields matter less than the first (usually the name).
    const weight = 1 / (index + 1);

    if (value === q) best = Math.max(best, 100 * weight);
    else if (value.startsWith(q)) best = Math.max(best, 80 * weight);
    else if (new RegExp(`\\b${escapeRegex(q)}`).test(value)) best = Math.max(best, 60 * weight);
    else if (value.includes(q)) best = Math.max(best, 35 * weight);
  }
  return best;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function searchWedding(
  snapshot: WeddingSnapshot,
  viewer: Viewer,
  query: string,
  limit = 20,
): SearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];

  const results: SearchResult[] = [];
  const canSeeMoney = viewer.permissions.has("budget.view");
  const canSeeDocs = viewer.permissions.has("documents.view");
  // Results are read alongside the rest of the app, so they use the reader's
  // currency rather than whatever each payment was entered in.
  const converter = buildConverter(
    snapshot.rates,
    viewer.displayCurrency || snapshot.wedding.baseCurrency,
    snapshot.today,
  );

  const householdById = new Map(snapshot.households.map((h) => [h.id, h]));
  const eventById = new Map(snapshot.events.map((e) => [e.id, e]));
  const vendorById = new Map(snapshot.vendors.map((v) => [v.id, v]));
  const personById = new Map(snapshot.wardrobePeople.map((p) => [p.id, p]));

  for (const guest of snapshot.guests) {
    const name = `${guest.firstName} ${guest.lastName}`;
    const household = guest.householdId ? householdById.get(guest.householdId) : null;
    const value = score(trimmed, name, household?.name, guest.city, guest.email, guest.phone);
    if (value > 0) {
      results.push({
        id: guest.id,
        type: "guest",
        title: name,
        subtitle: [household?.name, guest.relationship, guest.city]
          .filter(Boolean)
          .join(" · "),
        href: `/guests?guest=${guest.id}`,
        score: value,
      });
    }
  }

  for (const vendor of snapshot.vendors) {
    const value = score(
      trimmed,
      vendor.businessName,
      VENDOR_CATEGORY_LABEL[vendor.category],
      vendor.contactName,
      vendor.city,
    );
    if (value > 0) {
      results.push({
        id: vendor.id,
        type: "vendor",
        title: vendor.businessName,
        subtitle: `${VENDOR_CATEGORY_LABEL[vendor.category] ?? vendor.category} · ${VENDOR_STATUS_TEXT[vendor.status]}`,
        href: `/vendors/${vendor.id}`,
        score: value,
      });
    }
  }

  for (const task of snapshot.tasks) {
    const value = score(trimmed, task.title, task.description, task.area);
    if (value > 0) {
      const event = task.eventId ? eventById.get(task.eventId) : null;
      results.push({
        id: task.id,
        type: "task",
        title: task.title,
        subtitle: [TASK_STATUS_LABEL[task.status], event?.name, task.area]
          .filter(Boolean)
          .join(" · "),
        href: `/tasks?task=${task.id}`,
        score: value * 0.9,
      });
    }
  }

  for (const event of snapshot.events) {
    const value = score(trimmed, event.name, event.description);
    if (value > 0) {
      results.push({
        id: event.id,
        type: "event",
        title: event.name,
        subtitle: formatMediumDate(event.date),
        href: `/events/${event.slug}`,
        score: value * 1.1,
      });
    }
  }

  if (canSeeMoney) {
    for (const payment of snapshot.payments) {
      const vendor = payment.vendorId ? vendorById.get(payment.vendorId) : null;
      const value = score(trimmed, payment.label, vendor?.businessName, payment.reference);
      if (value > 0) {
        results.push({
          id: payment.id,
          type: "payment",
          title: payment.label,
          subtitle: `${formatCompactMoney(converter.toBase(payment.amount, payment.currency), converter.base)} · due ${formatMediumDate(payment.dueDate)}${vendor ? ` · ${vendor.businessName}` : ""}`,
          href: `/budget?view=payments&payment=${payment.id}`,
          score: value,
        });
      }
    }
  }

  if (canSeeDocs) {
    for (const document of snapshot.documents) {
      // Respect per-document role restrictions in search, not just on the page.
      if (
        document.visibleToRoles.length > 0 &&
        !document.visibleToRoles.includes(viewer.role)
      ) {
        continue;
      }
      const value = score(trimmed, document.title, document.fileName);
      if (value > 0) {
        results.push({
          id: document.id,
          type: "document",
          title: document.title,
          subtitle: document.kind.toLowerCase(),
          href: `/documents?document=${document.id}`,
          score: value,
        });
      }
    }
  }

  for (const outfit of snapshot.outfits) {
    const person = personById.get(outfit.personId);
    const value = score(trimmed, outfit.outfitType, outfit.designer, person?.name);
    if (value > 0) {
      results.push({
        id: outfit.id,
        type: "outfit",
        title: outfit.outfitType,
        subtitle: [person?.name, outfit.designer].filter(Boolean).join(" · "),
        href: `/wardrobe?outfit=${outfit.id}`,
        score: value * 0.8,
      });
    }
  }

  for (const entry of snapshot.timeline) {
    const value = score(trimmed, entry.title, entry.location);
    if (value > 0) {
      results.push({
        id: entry.id,
        type: "timeline",
        title: entry.title,
        subtitle: `${formatMediumDate(entry.date)}${entry.location ? ` · ${entry.location}` : ""}`,
        href: `/timeline?entry=${entry.id}`,
        score: value * 0.75,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
