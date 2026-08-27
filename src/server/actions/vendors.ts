"use server";

import { z } from "zod";

import { formatMoney } from "@/lib/money";
import { analyseChange, VENDOR_CATEGORY_LABEL, VENDOR_STATUS_TEXT } from "@/domain/impact";
import { logViewerActivity } from "@/server/activity";
import { db } from "@/server/db";
import { fetchSnapshot } from "@/server/snapshot-query";
import {
  optionalCivilDate,
  optionalId,
  optionalMoney,
  optionalString,
  revalidateWedding,
  withAction,
} from "./shared";

const CATEGORIES = [
  "VENUE", "CATERING", "DECOR", "PHOTOGRAPHY", "VIDEOGRAPHY", "MAKEUP", "MEHENDI",
  "DJ", "ENTERTAINMENT", "CHOREOGRAPHY", "PLANNER", "PRIEST", "INVITATIONS",
  "TRANSPORTATION", "HOTELS", "JEWELLERY", "OUTFITS", "GIFTS", "RENTALS",
  "SECURITY", "HOSPITALITY", "AV", "LIGHTING", "OTHER",
] as const;

const STATUSES = [
  "RESEARCHING", "CONTACTED", "QUOTE_RECEIVED", "SHORTLISTED", "NEGOTIATING",
  "SELECTED", "CONTRACTED", "ACTIVE", "COMPLETED", "REJECTED",
] as const;

const vendorSchema = z.object({
  businessName: z.string().trim().min(1, "Give the vendor a name.").max(160),
  category: z.enum(CATEGORIES),
  status: z.enum(STATUSES).default("RESEARCHING"),
  contactName: optionalString.optional(),
  phone: optionalString.optional(),
  email: optionalString.optional(),
  website: optionalString.optional(),
  city: optionalString.optional(),
  rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  packageInfo: optionalString.optional(),
  notes: optionalString.optional(),
  currency: z.string().length(3).default("INR"),
  quoteAmount: optionalMoney.optional(),
  negotiatedAmount: optionalMoney.optional(),
  contractedAmount: optionalMoney.optional(),
  depositAmount: optionalMoney.optional(),
  ownerId: optionalId.optional(),
  eventIds: z.array(z.string()).default([]),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
});

export async function createVendor(input: unknown) {
  return withAction("vendors.edit", async (viewer) => {
    const data = vendorSchema.parse(input);

    const vendor = await db.vendor.create({
      data: {
        weddingId: viewer.weddingId,
        businessName: data.businessName,
        category: data.category,
        status: data.status,
        contactName: data.contactName ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        website: data.website ?? null,
        city: data.city ?? null,
        rating: data.rating ?? null,
        packageInfo: data.packageInfo ?? null,
        notes: data.notes ?? null,
        currency: data.currency,
        quoteAmount: data.quoteAmount ?? null,
        negotiatedAmount: data.negotiatedAmount ?? null,
        contractedAmount: data.contractedAmount ?? null,
        depositAmount: data.depositAmount ?? null,
        ownerId: data.ownerId ?? null,
        pros: data.pros,
        cons: data.cons,
        events: { create: data.eventIds.map((eventId) => ({ eventId })) },
      },
      select: { id: true, businessName: true },
    });

    if (data.quoteAmount) {
      await db.vendorQuote.create({
        data: {
          vendorId: vendor.id,
          label: "Initial quote",
          amount: data.quoteAmount,
          currency: data.currency,
          isCurrent: true,
        },
      });
    }

    await logViewerActivity(viewer, {
      entityType: "vendor",
      entityId: vendor.id,
      entityLabel: vendor.businessName,
      action: "created",
      summary: `${viewer.name} added ${vendor.businessName} as a ${(VENDOR_CATEGORY_LABEL[data.category] ?? data.category).toLowerCase()} option.`,
    });

    revalidateWedding();
    return { id: vendor.id };
  });
}

const updateVendorSchema = vendorSchema
  .partial()
  .extend({ id: z.string().min(1), isFavourite: z.coerce.boolean().optional(), decisionReason: optionalString.optional() });

export async function updateVendor(input: unknown) {
  return withAction("vendors.edit", async (viewer) => {
    const { id, eventIds, ...patch } = updateVendorSchema.parse(input);

    const existing = await db.vendor.findFirst({
      where: { id, weddingId: viewer.weddingId },
    });
    if (!existing) throw new Error("That vendor no longer exists.");

    const updated = await db.vendor.update({
      where: { id },
      data: {
        ...patch,
        ...(eventIds
          ? {
              events: {
                deleteMany: {},
                create: eventIds.map((eventId) => ({ eventId })),
              },
            }
          : {}),
      },
      select: { id: true, businessName: true, currency: true },
    });

    // A quote change is a new quote, not an edit — keep the history.
    if (
      patch.quoteAmount !== undefined &&
      patch.quoteAmount !== null &&
      Number(existing.quoteAmount ?? -1) !== patch.quoteAmount
    ) {
      await db.vendorQuote.updateMany({
        where: { vendorId: id },
        data: { isCurrent: false },
      });
      await db.vendorQuote.create({
        data: {
          vendorId: id,
          label: "Revised quote",
          amount: patch.quoteAmount,
          currency: updated.currency,
          isCurrent: true,
        },
      });

      // Keep dependent budget lines in step, unless they're already contracted.
      await db.budgetItem.updateMany({
        where: { vendorId: id, contractedAmount: null, archivedAt: null },
        data: { quoteAmount: patch.quoteAmount },
      });
    }

    if (patch.contractedAmount !== undefined && patch.contractedAmount !== null) {
      await db.budgetItem.updateMany({
        where: { vendorId: id, archivedAt: null },
        data: { contractedAmount: patch.contractedAmount },
      });
    }

    const summary = describeVendorChange(viewer.name, existing, patch, updated.currency);
    if (summary) {
      await logViewerActivity(viewer, {
        entityType: "vendor",
        entityId: updated.id,
        entityLabel: updated.businessName,
        action: patch.status ? "status_changed" : "updated",
        summary,
        before: {
          status: existing.status,
          quoteAmount: existing.quoteAmount ? Number(existing.quoteAmount) : null,
          contractedAmount: existing.contractedAmount ? Number(existing.contractedAmount) : null,
        },
        after: patch as Record<string, unknown>,
        undoable: true,
      });
    }

    revalidateWedding();
    return { id: updated.id };
  });
}

/**
 * Selecting a vendor is a consequential act — it should set up the money and
 * the follow-up work, not just change a label.
 */
export async function selectVendor(vendorId: string, reason?: string) {
  return withAction("vendors.edit", async (viewer) => {
    const vendor = await db.vendor.findFirst({
      where: { id: vendorId, weddingId: viewer.weddingId },
      include: { events: true },
    });
    if (!vendor) throw new Error("That vendor no longer exists.");

    const amount =
      vendor.contractedAmount ?? vendor.negotiatedAmount ?? vendor.quoteAmount ?? null;

    const result = await db.$transaction(async (tx) => {
      await tx.vendor.update({
        where: { id: vendorId },
        data: { status: "SELECTED", decisionReason: reason ?? vendor.decisionReason },
      });

      // Everyone else in this category who's still in the running is now out.
      const rejected = await tx.vendor.updateMany({
        where: {
          weddingId: viewer.weddingId,
          category: vendor.category,
          id: { not: vendorId },
          status: { in: ["SHORTLISTED", "NEGOTIATING", "QUOTE_RECEIVED", "CONTACTED", "RESEARCHING"] },
          archivedAt: null,
        },
        data: { status: "REJECTED" },
      });

      // A contract record to track, so the "unsigned contract" alert can fire.
      let contractId: string | null = null;
      const hasContract = await tx.contract.findFirst({
        where: { vendorId, weddingId: viewer.weddingId },
        select: { id: true },
      });
      if (!hasContract && amount) {
        const contract = await tx.contract.create({
          data: {
            weddingId: viewer.weddingId,
            vendorId,
            title: `${VENDOR_CATEGORY_LABEL[vendor.category] ?? vendor.category} Agreement`,
            amount,
            currency: vendor.currency,
            status: "DRAFT",
          },
          select: { id: true },
        });
        contractId = contract.id;
      }

      // And the task to actually get it signed.
      const taskTitle = `Sign the contract with ${vendor.businessName}`;
      const existingTask = await tx.task.findFirst({
        where: { weddingId: viewer.weddingId, title: taskTitle, archivedAt: null },
        select: { id: true },
      });
      if (!existingTask) {
        await tx.task.create({
          data: {
            weddingId: viewer.weddingId,
            title: taskTitle,
            description: "Selected but not yet contracted — the date isn't held until this is signed.",
            priority: "HIGH",
            importance: 5,
            phase: "THREE_MONTHS",
            vendorId,
            eventId: vendor.events[0]?.eventId ?? null,
            createdById: viewer.memberId,
            dueDate: new Date(Date.now() + 14 * 86_400_000),
          },
        });
      }

      return { rejectedCount: rejected.count, contractId };
    });

    await logViewerActivity(viewer, {
      entityType: "vendor",
      entityId: vendorId,
      entityLabel: vendor.businessName,
      action: "status_changed",
      summary:
        `${viewer.name} selected ${vendor.businessName}` +
        (amount ? ` at ${formatMoney(Number(amount), vendor.currency)}` : "") +
        (result.rejectedCount > 0
          ? `, closing out ${result.rejectedCount} other ${result.rejectedCount === 1 ? "option" : "options"}.`
          : "."),
      before: { status: vendor.status },
      after: { status: "SELECTED" },
      reason: reason ?? null,
    });

    revalidateWedding();
    return result;
  });
}

/** Preview the consequences of a quote change before committing it. */
export async function previewVendorQuote(vendorId: string, amount: number) {
  return withAction("vendors.edit", async (viewer) => {
    const snapshot = await fetchSnapshot(viewer.weddingId);
    return analyseChange(
      snapshot,
      { type: "vendor.quote", vendorId, amount },
      viewer.displayCurrency,
    );
  });
}

export async function archiveVendor(id: string) {
  return withAction("vendors.edit", async (viewer) => {
    const vendor = await db.vendor.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, businessName: true },
    });
    if (!vendor) throw new Error("That vendor no longer exists.");

    await db.vendor.update({ where: { id }, data: { archivedAt: new Date() } });

    await logViewerActivity(viewer, {
      entityType: "vendor",
      entityId: vendor.id,
      entityLabel: vendor.businessName,
      action: "archived",
      summary: `${viewer.name} removed ${vendor.businessName}.`,
      undoable: true,
    });

    revalidateWedding();
    return { id: vendor.id };
  });
}

// ─────────────────────────────────────────────────────────── Notes & contracts

const interactionSchema = z.object({
  vendorId: z.string().min(1),
  kind: z.enum(["NOTE", "CALL", "MEETING", "EMAIL", "SITE_VISIT"]).default("NOTE"),
  summary: z.string().trim().min(1, "Write something first.").max(1000),
});

export async function logVendorInteraction(input: unknown) {
  return withAction("vendors.edit", async (viewer) => {
    const data = interactionSchema.parse(input);

    const vendor = await db.vendor.findFirst({
      where: { id: data.vendorId, weddingId: viewer.weddingId },
      select: { id: true, businessName: true },
    });
    if (!vendor) throw new Error("That vendor no longer exists.");

    await db.vendorInteraction.create({
      data: {
        vendorId: vendor.id,
        kind: data.kind,
        summary: data.summary,
        authorId: viewer.memberId,
      },
    });

    await logViewerActivity(viewer, {
      entityType: "vendor",
      entityId: vendor.id,
      entityLabel: vendor.businessName,
      action: "note_added",
      summary: `${viewer.name} logged a ${data.kind.replace("_", " ").toLowerCase()} with ${vendor.businessName}.`,
    });

    revalidateWedding();
    return { id: vendor.id };
  });
}

const contractSchema = z.object({
  vendorId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  amount: z.coerce.number().min(0),
  currency: z.string().length(3).default("INR"),
  status: z.enum(["DRAFT", "SENT", "SIGNED", "EXPIRED", "CANCELLED"]).default("DRAFT"),
  signedDate: optionalCivilDate.optional(),
  expiryDate: optionalCivilDate.optional(),
  documentId: optionalId.optional(),
});

export async function upsertContract(input: unknown) {
  return withAction("vendors.edit", async (viewer) => {
    const data = contractSchema.parse(input);

    const vendor = await db.vendor.findFirst({
      where: { id: data.vendorId, weddingId: viewer.weddingId },
      select: { id: true, businessName: true },
    });
    if (!vendor) throw new Error("That vendor no longer exists.");

    const existing = await db.contract.findFirst({
      where: { vendorId: vendor.id, weddingId: viewer.weddingId },
      select: { id: true },
    });

    const contract = existing
      ? await db.contract.update({
          where: { id: existing.id },
          data: {
            title: data.title,
            amount: data.amount,
            currency: data.currency,
            status: data.status,
            signedDate: data.signedDate ?? null,
            expiryDate: data.expiryDate ?? null,
            documentId: data.documentId ?? null,
          },
          select: { id: true },
        })
      : await db.contract.create({
          data: {
            weddingId: viewer.weddingId,
            vendorId: vendor.id,
            title: data.title,
            amount: data.amount,
            currency: data.currency,
            status: data.status,
            signedDate: data.signedDate ?? null,
            expiryDate: data.expiryDate ?? null,
            documentId: data.documentId ?? null,
          },
          select: { id: true },
        });

    // Signing a contract is what actually locks the money and the date.
    if (data.status === "SIGNED") {
      await db.vendor.update({
        where: { id: vendor.id },
        data: { status: "CONTRACTED", contractedAmount: data.amount },
      });
      await db.budgetItem.updateMany({
        where: { vendorId: vendor.id, archivedAt: null },
        data: { contractedAmount: data.amount },
      });
      await db.task.updateMany({
        where: {
          weddingId: viewer.weddingId,
          vendorId: vendor.id,
          title: { startsWith: "Sign the contract with" },
          status: { notIn: ["DONE", "CANCELLED"] },
        },
        data: { status: "DONE", completedAt: new Date() },
      });
    }

    await logViewerActivity(viewer, {
      entityType: "vendor",
      entityId: vendor.id,
      entityLabel: vendor.businessName,
      action: data.status === "SIGNED" ? "contracted" : "contract_updated",
      summary:
        data.status === "SIGNED"
          ? `${viewer.name} signed the ${formatMoney(data.amount, data.currency)} contract with ${vendor.businessName}.`
          : `${viewer.name} updated the contract with ${vendor.businessName}.`,
      after: { status: data.status, amount: data.amount },
    });

    revalidateWedding();
    return { id: contract.id };
  });
}

function describeVendorChange(
  actor: string,
  before: {
    businessName: string;
    status: string;
    quoteAmount: unknown;
    negotiatedAmount: unknown;
    contractedAmount: unknown;
  },
  patch: Record<string, unknown>,
  currency: string,
): string | null {
  if (patch.status && patch.status !== before.status) {
    return `${actor} moved ${before.businessName} from ${VENDOR_STATUS_TEXT[before.status as keyof typeof VENDOR_STATUS_TEXT]} to ${VENDOR_STATUS_TEXT[patch.status as keyof typeof VENDOR_STATUS_TEXT]}.`;
  }
  if (patch.quoteAmount !== undefined && patch.quoteAmount !== null) {
    const previous = before.quoteAmount ? Number(before.quoteAmount) : null;
    return previous
      ? `${actor} updated ${before.businessName}'s quote from ${formatMoney(previous, currency)} to ${formatMoney(patch.quoteAmount as number, currency)}.`
      : `${actor} recorded a ${formatMoney(patch.quoteAmount as number, currency)} quote from ${before.businessName}.`;
  }
  if (patch.negotiatedAmount !== undefined && patch.negotiatedAmount !== null) {
    return `${actor} negotiated ${before.businessName} to ${formatMoney(patch.negotiatedAmount as number, currency)}.`;
  }
  if (patch.contractedAmount !== undefined && patch.contractedAmount !== null) {
    return `${actor} contracted ${before.businessName} at ${formatMoney(patch.contractedAmount as number, currency)}.`;
  }
  if (patch.isFavourite !== undefined) {
    return patch.isFavourite
      ? `${actor} shortlisted ${before.businessName} as a favourite.`
      : `${actor} removed ${before.businessName} from favourites.`;
  }
  return `${actor} updated ${before.businessName}.`;
}
