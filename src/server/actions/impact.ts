"use server";

/**
 * The propagation layer.
 *
 * One entry point for "what would this change do?", and one for "do it". Both
 * run the same impact engine, so the preview a user approves is computed by the
 * same code that then executes.
 *
 * Three guarantees this layer provides:
 *
 *   Staleness — a preview carries a fingerprint of the state it was computed
 *   against. If somebody else changes something in between, Apply recalculates
 *   and shows the new consequences instead of silently applying old ones.
 *
 *   Atomicity — the write and its activity trail happen in one transaction.
 *   There is no half-applied state.
 *
 *   Idempotency — a double-clicked Apply, a retry or a resubmitted AI proposal
 *   returns the first result rather than writing twice.
 */

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  analyseChange,
  impactFingerprint,
  type ImpactReport,
  type PlannedChange,
} from "@/domain/impact";
import { db } from "@/server/db";
import { fetchSnapshot } from "@/server/snapshot-query";
import { requirePermission, type Permission, type Viewer } from "@/server/permissions";
import { revalidateWedding, withAction } from "./shared";

const CHANGE_SCHEMA = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("wedding.guests"),
    estimatedGuests: z.coerce.number().int().min(1).max(5000),
  }),
  z.object({
    type: z.literal("wedding.budget"),
    totalBudget: z.coerce.number().min(0),
  }),
  z.object({
    type: z.literal("event.time"),
    eventId: z.string().min(1),
    startMinute: z.coerce.number().int().min(0).max(2879),
    endMinute: z.coerce.number().int().min(0).max(2879),
  }),
  z.object({
    type: z.literal("event.date"),
    eventId: z.string().min(1),
    date: z.coerce.date(),
  }),
  z.object({
    type: z.literal("event.venue"),
    eventId: z.string().min(1),
    venueId: z.string().nullable(),
  }),
  z.object({
    type: z.literal("event.guests"),
    eventId: z.string().min(1),
    estimatedGuests: z.coerce.number().int().min(0).max(5000),
  }),
  z.object({
    type: z.literal("guest.rsvp"),
    guestId: z.string().min(1),
    eventId: z.string().min(1),
    status: z.enum(["NOT_INVITED", "PENDING", "CONFIRMED", "DECLINED", "TENTATIVE"]),
  }),
  z.object({
    type: z.literal("guest.accommodation"),
    guestId: z.string().min(1),
    needsAccommodation: z.coerce.boolean(),
  }),
  z.object({
    type: z.literal("vendor.quote"),
    vendorId: z.string().min(1),
    amount: z.coerce.number().min(0),
  }),
  z.object({
    type: z.literal("vendor.status"),
    vendorId: z.string().min(1),
    status: z.enum([
      "RESEARCHING", "CONTACTED", "QUOTE_RECEIVED", "SHORTLISTED", "NEGOTIATING",
      "SELECTED", "CONTRACTED", "ACTIVE", "COMPLETED", "REJECTED",
    ]),
  }),
]);

const PERMISSION_FOR: Record<string, Permission> = {
  "wedding.guests": "wedding.configure",
  "wedding.budget": "budget.edit",
  "event.time": "events.edit",
  "event.date": "events.edit",
  "event.venue": "events.edit",
  "event.guests": "events.edit",
  "guest.rsvp": "guests.edit",
  "guest.accommodation": "guests.edit",
  "vendor.quote": "vendors.edit",
  "vendor.status": "vendors.edit",
};

export interface PreviewResult {
  report: ImpactReport;
  /** Proves which state the report was computed against. */
  fingerprint: string;
  /** Pass back to `applyChange` so a retry can't write twice. */
  idempotencyKey: string;
}

export interface ApplyResult {
  applied: boolean;
  /** True when the world moved and the user needs to look again. */
  stale?: boolean;
  report?: ImpactReport;
  fingerprint?: string;
  alreadyApplied?: boolean;
}

/** What would this do? Reads only. */
export async function previewChange(input: unknown) {
  return withAction("documents.view", async (viewer) => {
    const change = CHANGE_SCHEMA.parse(input) as PlannedChange;
    requirePermission(viewer, PERMISSION_FOR[change.type]);

    const snapshot = await fetchSnapshot(viewer.weddingId);
    const report = redactForViewer(analyseChange(snapshot, change), viewer);

    return {
      report,
      fingerprint: impactFingerprint(snapshot),
      idempotencyKey: randomUUID(),
    } satisfies PreviewResult;
  });
}

/**
 * Apply a previewed change.
 *
 * Pass the fingerprint and key from `previewChange`. Without a fingerprint the
 * staleness check is skipped, which is fine for changes with no consequences.
 */
export async function applyChange(
  input: unknown,
  options: { fingerprint?: string; idempotencyKey?: string; reason?: string } = {},
) {
  return withAction("documents.view", async (viewer) => {
    const change = CHANGE_SCHEMA.parse(input) as PlannedChange;
    requirePermission(viewer, PERMISSION_FOR[change.type]);

    // ── Idempotency ────────────────────────────────────────────────────────
    if (options.idempotencyKey) {
      const existing = await db.changeApplication.findUnique({
        where: {
          weddingId_idempotencyKey: {
            weddingId: viewer.weddingId,
            idempotencyKey: options.idempotencyKey,
          },
        },
      });
      if (existing) {
        return { applied: true, alreadyApplied: true } satisfies ApplyResult;
      }
    }

    const snapshot = await fetchSnapshot(viewer.weddingId);
    const current = impactFingerprint(snapshot);

    // ── Staleness ──────────────────────────────────────────────────────────
    if (options.fingerprint && options.fingerprint !== current) {
      // Somebody moved something. Don't apply consequences the user never saw —
      // hand back the recalculated ones and keep their intended change intact.
      return {
        applied: false,
        stale: true,
        report: redactForViewer(analyseChange(snapshot, change), viewer),
        fingerprint: current,
      } satisfies ApplyResult;
    }

    const report = analyseChange(snapshot, change);

    // ── Atomicity ──────────────────────────────────────────────────────────
    await db.$transaction(async (tx) => {
      await writeChange(change, viewer, tx);

      // One parent entry describing the change the person actually made, with
      // its consequences attached — rather than five disconnected entries.
      await tx.activityLog.create({
        data: {
          weddingId: viewer.weddingId,
          actorId: viewer.userId,
          source: options.reason?.includes("AI Planner") ? "AI" : "MANUAL",
          entityType: entityTypeFor(change),
          entityId: entityIdFor(change),
          action: "changed",
          summary: `${viewer.name} ${lowerFirst(report.source.label)}: ${report.source.description}.`,
          before: Prisma.JsonNull,
          after: {
            change: change as unknown as Prisma.InputJsonValue,
            consequences: report.impacts
              .filter((i) => i.kind !== "direct")
              .slice(0, 8)
              .map((i) => ({
                kind: i.kind,
                area: i.type,
                message: i.message,
                detail: i.detail ?? null,
              })),
            forecast: report.finance
              ? { before: report.finance.before, after: report.finance.after }
              : null,
            readiness: report.readiness
              ? { before: report.readiness.before, after: report.readiness.after }
              : null,
          } as unknown as Prisma.InputJsonValue,
          reason: options.reason ?? null,
          undoable: true,
        },
      });

      if (options.idempotencyKey) {
        await tx.changeApplication.create({
          data: {
            weddingId: viewer.weddingId,
            idempotencyKey: options.idempotencyKey,
            action: change.type,
            result: {
              impacts: report.impacts.length,
              moves: report.timelineMoves.length,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
    });

    revalidateWedding();
    return { applied: true } satisfies ApplyResult;
  });
}

/** Strip financial detail from anyone who can't see money. */
function redactForViewer(report: ImpactReport, viewer: Viewer): ImpactReport {
  if (viewer.permissions.has("budget.view")) return report;
  return {
    ...report,
    finance: null,
    impacts: report.impacts.filter((i) => i.type !== "budget"),
  };
}

type Tx = Prisma.TransactionClient;

async function writeChange(
  change: PlannedChange,
  viewer: Viewer,
  tx: Tx,
): Promise<void> {
  switch (change.type) {
    case "wedding.guests":
      await tx.wedding.update({
        where: { id: viewer.weddingId },
        data: { estimatedGuests: change.estimatedGuests },
      });
      return;

    case "wedding.budget":
      await tx.wedding.update({
        where: { id: viewer.weddingId },
        data: { totalBudget: change.totalBudget },
      });
      return;

    case "event.time":
      await tx.event.updateMany({
        where: { id: change.eventId, weddingId: viewer.weddingId },
        data: { startMinute: change.startMinute, endMinute: change.endMinute },
      });
      return;

    case "event.date":
      await tx.event.updateMany({
        where: { id: change.eventId, weddingId: viewer.weddingId },
        data: { date: change.date },
      });
      return;

    case "event.venue":
      await tx.event.updateMany({
        where: { id: change.eventId, weddingId: viewer.weddingId },
        data: { venueId: change.venueId },
      });
      return;

    case "event.guests":
      await tx.event.updateMany({
        where: { id: change.eventId, weddingId: viewer.weddingId },
        data: { estimatedGuests: change.estimatedGuests },
      });
      return;

    case "guest.rsvp": {
      const guest = await tx.guest.findFirst({
        where: { id: change.guestId, weddingId: viewer.weddingId },
        select: { id: true },
      });
      if (!guest) throw new Error("That guest no longer exists.");
      const answered = ["CONFIRMED", "DECLINED", "TENTATIVE"].includes(change.status);
      await tx.eventInvitation.upsert({
        where: {
          guestId_eventId: { guestId: change.guestId, eventId: change.eventId },
        },
        create: {
          guestId: change.guestId,
          eventId: change.eventId,
          status: change.status,
          respondedAt: answered ? new Date() : null,
        },
        update: {
          status: change.status,
          respondedAt: answered ? new Date() : null,
        },
      });
      return;
    }

    case "guest.accommodation":
      await tx.guest.updateMany({
        where: { id: change.guestId, weddingId: viewer.weddingId },
        data: { needsAccommodation: change.needsAccommodation },
      });
      return;

    case "vendor.quote": {
      const vendor = await tx.vendor.findFirst({
        where: { id: change.vendorId, weddingId: viewer.weddingId },
        select: { currency: true },
      });
      if (!vendor) throw new Error("That vendor no longer exists.");

      await tx.vendor.update({
        where: { id: change.vendorId },
        data: { quoteAmount: change.amount },
      });
      await tx.vendorQuote.updateMany({
        where: { vendorId: change.vendorId },
        data: { isCurrent: false },
      });
      await tx.vendorQuote.create({
        data: {
          vendorId: change.vendorId,
          label: "Revised quote",
          amount: change.amount,
          currency: vendor.currency,
          isCurrent: true,
        },
      });
      // Uncontracted budget lines follow the quote; contracted ones don't.
      await tx.budgetItem.updateMany({
        where: { vendorId: change.vendorId, contractedAmount: null, archivedAt: null },
        data: { quoteAmount: change.amount },
      });
      return;
    }

    case "vendor.status":
      await tx.vendor.updateMany({
        where: { id: change.vendorId, weddingId: viewer.weddingId },
        data: { status: change.status },
      });
      return;

    default:
      throw new Error("That change isn't supported.");
  }
}

function entityTypeFor(change: PlannedChange): string {
  if (change.type.startsWith("wedding")) return "wedding";
  if (change.type.startsWith("event")) return "event";
  if (change.type.startsWith("guest")) return "guest";
  return "vendor";
}

function entityIdFor(change: PlannedChange): string | null {
  if ("eventId" in change && change.type.startsWith("event")) return change.eventId;
  if ("vendorId" in change) return change.vendorId;
  if ("guestId" in change) return change.guestId;
  return null;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
