import { redirect } from "next/navigation";

import { buildBudgetView, paymentsByPayer } from "@/domain/budget";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
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

  const history = await db.forecastSnapshot.findMany({
    where: { weddingId: viewer.weddingId, budgetItemId: null },
    orderBy: { capturedAt: "asc" },
    take: 40,
  });

  const vendorById = new Map(snapshot.vendors.map((v) => [v.id, v.businessName]));
  const eventById = new Map(snapshot.events.map((e) => [e.id, e.name]));
  const payerById = new Map(snapshot.payers.map((p) => [p.id, p.name]));

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
          vendorName: item.vendorId ? vendorById.get(item.vendorId) ?? null : null,
          eventName: item.eventId ? eventById.get(item.eventId) ?? null : null,
          nativeCurrency: item.currency,
          nativeForecast: item.nativeForecast,
        })),
      }))}
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
          vendorName: payment.vendorId ? vendorById.get(payment.vendorId) ?? null : null,
          payerName: payment.payerId ? payerById.get(payment.payerId) ?? null : null,
          isOverdue:
            payment.status !== "PAID" &&
            payment.status !== "CANCELLED" &&
            new Date(payment.dueDate) < snapshot.today,
        }))}
      payers={paymentsByPayer(snapshot, budget.converter)}
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
