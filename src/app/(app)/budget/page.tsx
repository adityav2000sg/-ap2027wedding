import { redirect } from "next/navigation";

import { buildBudgetView, paymentsByPayer, spendByPayer } from "@/domain/budget";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { variantUrl } from "@/server/media";
import { loadSnapshot } from "@/server/snapshot";
import { BudgetWorkspace } from "./workspace";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; filter?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.permissions.has("budget.view")) {
    // Contributors genuinely can't see money — say so rather than 404.
    return (
      <div className="mx-auto max-w-lg px-5 py-20 text-center">
        <h1 className="font-display text-[26px] text-ink">Budget is private</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
          Your account can work on tasks and logistics, but financial details are
          limited to the couple, both sets of parents and the planner.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const snapshot = await loadSnapshot(viewer.weddingId);
  const budget = buildBudgetView(snapshot, viewer.displayCurrency);
  const currency = viewer.displayCurrency;
  const payerShares = spendByPayer(budget, snapshot);

  // Quotes, invoices and receipts attached to budget lines. Loaded in full
  // rather than counted: a wedding has a few dozen of these, and fetching them
  // on demand would mean a spinner inside a drawer that is already open.
  const attachmentLinks = await db.mediaLink.findMany({
    where: { entityType: "budgetItem", media: { archivedAt: null } },
    orderBy: { sortOrder: "asc" },
    select: {
      entityId: true,
      media: {
        select: {
          id: true,
          filename: true,
          mimeType: true,
          sizeBytes: true,
          storageKey: true,
          derivatives: true,
        },
      },
    },
  });
  const attachmentsByItem = new Map<
    string,
    { id: string; filename: string; mimeType: string; sizeBytes: number; url: string; previewUrl: string | null }[]
  >();
  for (const link of attachmentLinks) {
    const list = attachmentsByItem.get(link.entityId) ?? [];
    list.push({
      id: link.media.id,
      filename: link.media.filename,
      mimeType: link.media.mimeType,
      sizeBytes: link.media.sizeBytes,
      url: variantUrl(link.media, "original"),
      previewUrl: link.media.mimeType.startsWith("image/")
        ? variantUrl(link.media, "thumb")
        : null,
    });
    attachmentsByItem.set(link.entityId, list);
  }

  const history = await db.forecastSnapshot.findMany({
    where: { weddingId: viewer.weddingId, budgetItemId: null },
    orderBy: { capturedAt: "asc" },
    take: 40,
  });

  const vendorById = new Map(snapshot.vendors.map((v) => [v.id, v.businessName]));
  const eventById = new Map(snapshot.events.map((e) => [e.id, e.name]));
  const payerById = new Map(snapshot.payers.map((p) => [p.id, p.name]));
  const rawItemById = new Map(snapshot.budgetItems.map((i) => [i.id, i]));
  const rawCategoryById = new Map(snapshot.categories.map((c) => [c.id, c]));

  return (
    <BudgetWorkspace
      canEdit={viewer.permissions.has("budget.edit")}
      canPay={viewer.permissions.has("payments.approve")}
      currency={currency}
      initialView={params.view ?? "categories"}
      finance={budget.finance}
      categories={budget.categories.map((category) => ({
        id: category.categoryId,
        name: category.name,
        tone: category.accentTone,
        allocatedNative: rawCategoryById.get(category.categoryId)?.allocatedAmount ?? 0,
        allocated: category.allocated,
        forecast: category.forecast,
        variance: category.variance,
        variancePercent: category.variancePercent,
        paid: category.paid,
        committed: category.committed,
        items: category.items.map((item) => ({
          id: item.itemId,
          name: item.name,
          allocated: item.allocated,
          forecast: item.forecast,
          variance: item.variance,
          source: item.source,
          explanation: item.explanation,
          isVariable: item.isVariable,
          quantity: item.quantity,
          paid: item.paid,
          payerId: item.payerId,
          payerName: item.payerId ? payerById.get(item.payerId) ?? null : null,
          attachments: attachmentsByItem.get(item.itemId)?.length ?? 0,
          vendorName: item.vendorId ? vendorById.get(item.vendorId) ?? null : null,
          eventName: item.eventId ? eventById.get(item.eventId) ?? null : null,
          nativeCurrency: item.currency,
          nativeForecast: item.nativeForecast,
          edit: (() => {
            const raw = rawItemById.get(item.itemId);
            if (!raw) return null;
            return {
              id: raw.id,
              categoryId: raw.categoryId,
              name: raw.name,
              description: raw.description,
              eventId: raw.eventId,
              vendorId: raw.vendorId,
              payerId: raw.payerId,
              costModel: raw.costModel,
              guestBasis: raw.guestBasis,
              currency: raw.currency,
              allocatedAmount: raw.allocatedAmount,
              fixedAmount: raw.fixedAmount,
              unitRate: raw.unitRate,
              unitQuantity: raw.unitQuantity,
              estimateAmount: raw.estimateAmount,
              quoteAmount: raw.quoteAmount,
              negotiatedAmount: raw.negotiatedAmount,
              contractedAmount: raw.contractedAmount,
              attachments: attachmentsByItem.get(item.itemId) ?? [],
            };
          })(),
        })),
      }))}
      events={snapshot.events.map((e) => ({ id: e.id, name: e.name }))}
      vendors={snapshot.vendors.map((v) => ({ id: v.id, name: v.businessName }))}
      baseCurrency={snapshot.wedding.baseCurrency}
      payments={snapshot.payments
        .slice()
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .map((payment) => ({
          id: payment.id,
          label: payment.label,
          amount: budget.converter.toBase(payment.amount, payment.currency),
          nativeAmount: payment.amount,
          nativeCurrency: payment.currency,
          status: payment.status,
          dueDate: payment.dueDate.toISOString(),
          paidDate: payment.paidDate?.toISOString() ?? null,
          vendorId: payment.vendorId,
          vendorName: payment.vendorId ? vendorById.get(payment.vendorId) ?? null : null,
          payerId: payment.payerId,
          payerName: payment.payerId ? payerById.get(payment.payerId) ?? null : null,
          notes: payment.notes ?? null,
          isOverdue:
            payment.status !== "PAID" &&
            payment.status !== "CANCELLED" &&
            new Date(payment.dueDate) < snapshot.today,
        }))}
      payers={paymentsByPayer(snapshot, budget.converter)}
      payerShares={payerShares}
      // Only the people, not the two family units: the parents are who the
      // couple asked to be able to tag, and a four-item list stays a glance.
      payerOptions={snapshot.payers
        .filter((payer) => payer.kind === "person")
        .map((payer) => ({ id: payer.id, name: payer.name }))}
      history={history.map((point) => ({
        forecast: Number(point.forecastTotal),
        reason: point.reason,
        at: point.capturedAt.toISOString(),
      }))}
      drivers={{
        guests: budget.drivers.guestCounts.confirmed + budget.drivers.guestCounts.pending,
        rooms: budget.drivers.rooms,
        households: budget.drivers.households,
      }}
    />
  );
}
