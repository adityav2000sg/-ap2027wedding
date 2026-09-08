import { redirect } from "next/navigation";

import { buildBudgetView } from "@/domain/budget";
import { computeAlerts } from "@/domain/risk";
import { analyseTasks } from "@/domain/tasks";
import { daysBetween, formatDateRange, toISODate } from "@/lib/dates";
import { AppShell } from "@/components/shell/app-shell";
import { visibleNavItems } from "@/components/shell/nav";
import { getViewer } from "@/server/auth";
import { loadSnapshot } from "@/server/snapshot";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const snapshot = await loadSnapshot(viewer.weddingId);
  const tasks = analyseTasks(snapshot);
  const budget = buildBudgetView(snapshot, viewer.displayCurrency);
  const alerts = computeAlerts(snapshot, tasks, budget);

  // Only genuinely pressing things earn a badge on the nav.
  const alertCount = alerts.filter(
    (alert) => alert.severity === "critical" || alert.severity === "important",
  ).length;

  const permissions = [...viewer.permissions];

  return (
    <AppShell
      items={visibleNavItems(permissions)}
      viewer={{
        name: viewer.name,
        relation: viewer.relation,
        tone: viewer.avatarTone,
        email: viewer.email,
        displayCurrency: viewer.displayCurrency,
      }}
      wedding={{
        partnerAName: snapshot.wedding.partnerAName,
        partnerBName: snapshot.wedding.partnerBName,
        dateRange: formatDateRange(snapshot.wedding.startDate, snapshot.wedding.endDate),
        daysToGo: daysBetween(snapshot.today, snapshot.wedding.startDate),
      }}
      alertCount={alertCount}
      quickAddOptions={{
        events: snapshot.events.map((e) => ({ id: e.id, name: e.name })),
        members: snapshot.members.map((m) => ({ id: m.id, name: m.name })),
        vendors: snapshot.vendors
          .filter((v) => v.status !== "REJECTED")
          .map((v) => ({ id: v.id, businessName: v.businessName })),
        categories: snapshot.categories.map((c) => ({ id: c.id, name: c.name })),
        payers: snapshot.payers.map((p) => ({ id: p.id, name: p.name })),
        households: snapshot.households.map((h) => ({ id: h.id, name: h.name })),
        venues: snapshot.venues.map((v) => ({ id: v.id, name: v.name })),
        baseCurrency: snapshot.wedding.baseCurrency,
        weddingStart: toISODate(snapshot.wedding.startDate),
        canEditBudget: viewer.permissions.has("payments.approve"),
        canEditGuests: viewer.permissions.has("guests.edit"),
        canEditVendors: viewer.permissions.has("vendors.edit"),
        canEditEvents: viewer.permissions.has("events.edit"),
      }}
    >
      {children}
    </AppShell>
  );
}
