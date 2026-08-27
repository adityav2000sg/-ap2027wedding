"use server";

import { z } from "zod";

import { formatMediumDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { buildBudgetView } from "@/domain/budget";
import { buildConverter } from "@/domain/currency";
import { analyseChange } from "@/domain/impact";
import { logViewerActivity } from "@/server/activity";
import { db } from "@/server/db";
import { fetchSnapshot } from "@/server/snapshot-query";
import {
  civilDate,
  moneyAmount,
  optionalCivilDate,
  optionalId,
  optionalMoney,
  optionalString,
  revalidateWedding,
  withAction,
} from "./shared";

const COST_MODELS = ["FIXED", "PER_GUEST", "PER_HOUSEHOLD", "PER_ROOM", "PER_UNIT"] as const;
const GUEST_BASES = ["ESTIMATED", "INVITED", "CONFIRMED", "CONFIRMED_PLUS_PENDING"] as const;
const PAYMENT_STATUSES = ["UPCOMING", "DUE", "PAID", "OVERDUE", "CANCELLED"] as const;

/**
 * Record a forecast snapshot whenever the total moves. This is what makes the
 * forecast history graph — and "why did the number change?" — possible.
 */
async function captureForecast(
  weddingId: string,
  reason: string,
  actor: string,
): Promise<{ before: number; after: number } | null> {
  const snapshot = await fetchSnapshot(weddingId);
  const view = buildBudgetView(snapshot);

  const latest = await db.forecastSnapshot.findFirst({
    where: { weddingId, budgetItemId: null },
    orderBy: { capturedAt: "desc" },
    select: { forecastTotal: true },
  });

  const before = latest ? Number(latest.forecastTotal) : view.finance.forecast;
  const after = view.finance.forecast;

  if (Math.abs(after - before) < 1) return null;

  await db.forecastSnapshot.create({
    data: {
      weddingId,
      forecastTotal: after,
      allocatedTotal: view.finance.allocated,
      reason,
      triggeredBy: actor,
    },
  });

  return { before, after };
}

// ───────────────────────────────────────────────────────────── Budget items

const itemSchema = z.object({
  name: z.string().trim().min(1, "Give this line a name.").max(160),
  categoryId: z.string().min(1, "Choose a category."),
  description: optionalString.optional(),
  eventId: optionalId.optional(),
  vendorId: optionalId.optional(),
  costModel: z.enum(COST_MODELS).default("FIXED"),
  guestBasis: z.enum(GUEST_BASES).default("CONFIRMED_PLUS_PENDING"),
  currency: z.string().length(3).default("INR"),
  allocatedAmount: moneyAmount.default(0),
  fixedAmount: optionalMoney.optional(),
  unitRate: optionalMoney.optional(),
  unitQuantity: optionalMoney.optional(),
  estimateAmount: optionalMoney.optional(),
  quoteAmount: optionalMoney.optional(),
  negotiatedAmount: optionalMoney.optional(),
  contractedAmount: optionalMoney.optional(),
  notes: optionalString.optional(),
});

export async function createBudgetItem(input: unknown) {
  return withAction("budget.edit", async (viewer) => {
    const data = itemSchema.parse(input);

    const category = await db.budgetCategory.findFirst({
      where: { id: data.categoryId, weddingId: viewer.weddingId },
      select: { id: true, name: true },
    });
    if (!category) throw new Error("That budget category no longer exists.");

    const item = await db.budgetItem.create({
      data: {
        weddingId: viewer.weddingId,
        categoryId: data.categoryId,
        name: data.name,
        description: data.description ?? null,
        eventId: data.eventId ?? null,
        vendorId: data.vendorId ?? null,
        costModel: data.costModel,
        guestBasis: data.guestBasis,
        currency: data.currency,
        allocatedAmount: data.allocatedAmount,
        fixedAmount: data.fixedAmount ?? null,
        unitRate: data.unitRate ?? null,
        unitQuantity: data.unitQuantity ?? null,
        estimateAmount: data.estimateAmount ?? null,
        quoteAmount: data.quoteAmount ?? null,
        negotiatedAmount: data.negotiatedAmount ?? null,
        contractedAmount: data.contractedAmount ?? null,
        notes: data.notes ?? null,
      },
      select: { id: true, name: true },
    });

    const movement = await captureForecast(
      viewer.weddingId,
      `Added budget line “${item.name}”`,
      viewer.name,
    );

    await logViewerActivity(viewer, {
      entityType: "budgetItem",
      entityId: item.id,
      entityLabel: item.name,
      action: "created",
      summary:
        `${viewer.name} added “${item.name}” to ${category.name}` +
        (movement
          ? `, taking the forecast to ${formatMoney(movement.after, data.currency)}.`
          : "."),
    });

    revalidateWedding();
    return { id: item.id };
  });
}

const updateItemSchema = itemSchema.partial().extend({ id: z.string().min(1) });

export async function updateBudgetItem(input: unknown) {
  return withAction("budget.edit", async (viewer) => {
    const { id, ...patch } = updateItemSchema.parse(input);

    const existing = await db.budgetItem.findFirst({
      where: { id, weddingId: viewer.weddingId },
    });
    if (!existing) throw new Error("That budget line no longer exists.");

    const updated = await db.budgetItem.update({
      where: { id },
      data: patch,
      select: { id: true, name: true, currency: true },
    });

    const movement = await captureForecast(
      viewer.weddingId,
      `Updated “${updated.name}”`,
      viewer.name,
    );

    await logViewerActivity(viewer, {
      entityType: "budgetItem",
      entityId: updated.id,
      entityLabel: updated.name,
      action: "updated",
      summary:
        `${viewer.name} updated “${updated.name}”` +
        (movement
          ? `. Wedding forecast ${movement.after > movement.before ? "rose" : "fell"} to ${formatMoney(movement.after, updated.currency)}.`
          : "."),
      before: {
        allocatedAmount: Number(existing.allocatedAmount),
        quoteAmount: existing.quoteAmount ? Number(existing.quoteAmount) : null,
        contractedAmount: existing.contractedAmount ? Number(existing.contractedAmount) : null,
        unitRate: existing.unitRate ? Number(existing.unitRate) : null,
      },
      after: patch as Record<string, unknown>,
      undoable: true,
    });

    revalidateWedding();
    return { id: updated.id };
  });
}

/** Show what a budget edit would do before it's saved. */
export async function previewBudgetItemChange(id: string, patch: Record<string, unknown>) {
  return withAction("budget.view", async (viewer) => {
    const snapshot = await fetchSnapshot(viewer.weddingId);
    return analyseChange(
      snapshot,
      { type: "budgetItem.update", itemId: id, patch },
      viewer.displayCurrency,
    );
  });
}

export async function archiveBudgetItem(id: string) {
  return withAction("budget.edit", async (viewer) => {
    const item = await db.budgetItem.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, name: true },
    });
    if (!item) throw new Error("That budget line no longer exists.");

    await db.budgetItem.update({ where: { id }, data: { archivedAt: new Date() } });
    await captureForecast(viewer.weddingId, `Removed “${item.name}”`, viewer.name);

    await logViewerActivity(viewer, {
      entityType: "budgetItem",
      entityId: item.id,
      entityLabel: item.name,
      action: "archived",
      summary: `${viewer.name} removed the budget line “${item.name}”.`,
      undoable: true,
    });

    revalidateWedding();
    return { id: item.id };
  });
}

const categorySchema = z.object({
  name: z.string().trim().min(1, "Give the category a name.").max(120),
  allocatedAmount: moneyAmount.default(0),
  accentTone: z.string().default("saffron"),
});

export async function createBudgetCategory(input: unknown) {
  return withAction("budget.edit", async (viewer) => {
    const data = categorySchema.parse(input);
    const count = await db.budgetCategory.count({ where: { weddingId: viewer.weddingId } });

    const category = await db.budgetCategory.create({
      data: {
        weddingId: viewer.weddingId,
        name: data.name,
        allocatedAmount: data.allocatedAmount,
        accentTone: data.accentTone,
        sortOrder: count,
      },
      select: { id: true, name: true },
    });

    await logViewerActivity(viewer, {
      entityType: "budgetCategory",
      entityId: category.id,
      entityLabel: category.name,
      action: "created",
      summary: `${viewer.name} created the ${category.name} budget category.`,
    });

    revalidateWedding();
    return { id: category.id };
  });
}

export async function updateBudgetCategory(input: unknown) {
  return withAction("budget.edit", async (viewer) => {
    const data = categorySchema
      .partial()
      .extend({ id: z.string().min(1) })
      .parse(input);
    const { id, ...patch } = data;

    const existing = await db.budgetCategory.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, name: true, allocatedAmount: true },
    });
    if (!existing) throw new Error("That category no longer exists.");

    await db.budgetCategory.update({ where: { id }, data: patch });

    await logViewerActivity(viewer, {
      entityType: "budgetCategory",
      entityId: id,
      entityLabel: existing.name,
      action: "updated",
      summary:
        patch.allocatedAmount !== undefined
          ? `${viewer.name} changed the ${existing.name} allocation to ${formatMoney(patch.allocatedAmount, "INR")}.`
          : `${viewer.name} updated the ${existing.name} category.`,
      before: { allocatedAmount: Number(existing.allocatedAmount) },
      after: patch as Record<string, unknown>,
      undoable: true,
    });

    revalidateWedding();
    return { id };
  });
}

// ───────────────────────────────────────────────────────────────── Payments

const paymentSchema = z.object({
  label: z.string().trim().min(1, "What is this payment for?").max(160),
  amount: moneyAmount,
  currency: z.string().length(3).default("INR"),
  dueDate: civilDate,
  paidDate: optionalCivilDate.optional(),
  status: z.enum(PAYMENT_STATUSES).default("UPCOMING"),
  vendorId: optionalId.optional(),
  budgetItemId: optionalId.optional(),
  payerId: optionalId.optional(),
  method: optionalString.optional(),
  reference: optionalString.optional(),
  notes: optionalString.optional(),
  documentId: optionalId.optional(),
});

export async function createPayment(input: unknown) {
  return withAction("payments.approve", async (viewer) => {
    const data = paymentSchema.parse(input);

    const snapshot = await fetchSnapshot(viewer.weddingId);
    const converter = buildConverter(
      snapshot.rates,
      snapshot.wedding.baseCurrency,
      new Date(),
    );
    // Freeze the rate at entry time so history stays truthful.
    const rate = converter.rateFor(data.currency) ?? 1;

    const payment = await db.payment.create({
      data: {
        weddingId: viewer.weddingId,
        label: data.label,
        amount: data.amount,
        currency: data.currency,
        conversionRate: rate,
        dueDate: data.dueDate,
        paidDate: data.paidDate ?? (data.status === "PAID" ? new Date() : null),
        status: data.status,
        vendorId: data.vendorId ?? null,
        budgetItemId: data.budgetItemId ?? null,
        payerId: data.payerId ?? null,
        method: data.method ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        documentId: data.documentId ?? null,
      },
      select: { id: true, label: true },
    });

    const vendor = data.vendorId
      ? snapshot.vendors.find((v) => v.id === data.vendorId)
      : null;
    const payer = data.payerId
      ? snapshot.payers.find((p) => p.id === data.payerId)
      : null;

    await logViewerActivity(viewer, {
      entityType: "payment",
      entityId: payment.id,
      entityLabel: payment.label,
      action: data.status === "PAID" ? "logged" : "scheduled",
      summary:
        data.status === "PAID"
          ? `${formatMoney(data.amount, data.currency)} paid to ${vendor?.businessName ?? payment.label}${payer ? ` by ${payer.name}` : ""}.`
          : `${viewer.name} scheduled ${formatMoney(data.amount, data.currency)} to ${vendor?.businessName ?? payment.label}, due ${formatMediumDate(data.dueDate)}.`,
      after: { amount: data.amount, status: data.status },
    });

    revalidateWedding();
    return { id: payment.id };
  });
}

export async function updatePayment(input: unknown) {
  return withAction("payments.approve", async (viewer) => {
    const data = paymentSchema
      .partial()
      .extend({ id: z.string().min(1) })
      .parse(input);
    const { id, ...patch } = data;

    const existing = await db.payment.findFirst({
      where: { id, weddingId: viewer.weddingId },
      include: { vendor: { select: { businessName: true } }, payer: true },
    });
    if (!existing) throw new Error("That payment no longer exists.");

    const updated = await db.payment.update({
      where: { id },
      data: {
        ...patch,
        ...(patch.status === "PAID" && !existing.paidDate
          ? { paidDate: patch.paidDate ?? new Date() }
          : {}),
        ...(patch.status && patch.status !== "PAID" ? { paidDate: null } : {}),
      },
      select: { id: true, label: true, amount: true, currency: true, status: true },
    });

    await logViewerActivity(viewer, {
      entityType: "payment",
      entityId: updated.id,
      entityLabel: updated.label,
      action: patch.status === "PAID" ? "logged" : "updated",
      summary:
        patch.status === "PAID"
          ? `${formatMoney(Number(updated.amount), updated.currency)} paid to ${existing.vendor?.businessName ?? updated.label}${existing.payer ? ` by ${existing.payer.name}` : ""}.`
          : `${viewer.name} updated the payment “${updated.label}”.`,
      before: { status: existing.status, amount: Number(existing.amount) },
      after: patch as Record<string, unknown>,
      undoable: true,
    });

    revalidateWedding();
    return { id: updated.id };
  });
}

/** One-click "mark as paid" from the payments list. */
export async function markPaymentPaid(id: string) {
  return updatePayment({ id, status: "PAID" });
}

export async function archivePayment(id: string) {
  return withAction("payments.approve", async (viewer) => {
    const payment = await db.payment.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, label: true },
    });
    if (!payment) throw new Error("That payment no longer exists.");

    await db.payment.update({ where: { id }, data: { archivedAt: new Date() } });

    await logViewerActivity(viewer, {
      entityType: "payment",
      entityId: payment.id,
      entityLabel: payment.label,
      action: "archived",
      summary: `${viewer.name} removed the payment “${payment.label}”.`,
      undoable: true,
    });

    revalidateWedding();
    return { id: payment.id };
  });
}

// ─────────────────────────────────────────────────── Currency & wedding budget

const rateSchema = z.object({
  fromCurrency: z.string().length(3),
  toCurrency: z.string().length(3),
  rate: z.coerce.number().positive("Rate must be greater than zero."),
  effectiveDate: civilDate,
});

export async function setCurrencyRate(input: unknown) {
  return withAction("budget.edit", async (viewer) => {
    const data = rateSchema.parse(input);

    await db.currencyRate.upsert({
      where: {
        weddingId_fromCurrency_toCurrency_effectiveDate: {
          weddingId: viewer.weddingId,
          fromCurrency: data.fromCurrency,
          toCurrency: data.toCurrency,
          effectiveDate: data.effectiveDate,
        },
      },
      create: { weddingId: viewer.weddingId, ...data, source: "manual" },
      update: { rate: data.rate },
    });

    await logViewerActivity(viewer, {
      entityType: "currencyRate",
      action: "updated",
      summary: `${viewer.name} set 1 ${data.fromCurrency} = ${data.rate} ${data.toCurrency} from ${formatMediumDate(data.effectiveDate)}.`,
    });

    revalidateWedding();
    return { ok: true };
  });
}

export async function createPayer(name: string, kind = "person") {
  return withAction("budget.edit", async (viewer) => {
    const trimmed = z.string().trim().min(1, "Give the payer a name.").parse(name);
    const count = await db.payer.count({ where: { weddingId: viewer.weddingId } });

    const payer = await db.payer.create({
      data: { weddingId: viewer.weddingId, name: trimmed, kind, sortOrder: count },
      select: { id: true, name: true },
    });

    revalidateWedding();
    return { id: payer.id, name: payer.name };
  });
}
