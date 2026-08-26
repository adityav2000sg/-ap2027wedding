import Link from "next/link";
import { redirect } from "next/navigation";

import { buildBudgetView } from "@/domain/budget";
import { VENDOR_CATEGORY_LABEL, VENDOR_STATUS_TEXT } from "@/domain/impact";
import { cn } from "@/lib/cn";
import { formatCompactMoney } from "@/lib/money";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { getViewer } from "@/server/auth";
import { loadSnapshot } from "@/server/snapshot";
import type { VendorStatus } from "@/domain/types";

/** How far along a vendor is, for the progress rail on each row. */
const STATUS_PROGRESS: Record<VendorStatus, number> = {
  RESEARCHING: 5, CONTACTED: 15, QUOTE_RECEIVED: 30, SHORTLISTED: 45,
  NEGOTIATING: 60, SELECTED: 80, CONTRACTED: 100, ACTIVE: 100,
  COMPLETED: 100, REJECTED: 0,
};

const STATUS_VARIANT: Record<string, "neutral" | "info" | "attention" | "positive"> = {
  RESEARCHING: "neutral", CONTACTED: "neutral", QUOTE_RECEIVED: "info",
  SHORTLISTED: "info", NEGOTIATING: "attention", SELECTED: "attention",
  CONTRACTED: "positive", ACTIVE: "positive", COMPLETED: "positive",
  REJECTED: "neutral",
};

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const { category: categoryFilter, status: statusFilter } = await searchParams;
  const snapshot = await loadSnapshot(viewer.weddingId);
  const budget = buildBudgetView(snapshot, viewer.displayCurrency);
  const currency = viewer.displayCurrency;
  const canSeeMoney = viewer.permissions.has("budget.view");

  const showRejected = statusFilter === "rejected";
  const visible = snapshot.vendors
    .filter((v) => (showRejected ? v.status === "REJECTED" : v.status !== "REJECTED"))
    .filter((v) => !categoryFilter || v.category === categoryFilter);

  // Group by category so the page reads as "where are we on each thing".
  const byCategory = new Map<string, typeof visible>();
  for (const vendor of visible) {
    const list = byCategory.get(vendor.category) ?? [];
    list.push(vendor);
    byCategory.set(vendor.category, list);
  }

  const categories = [...byCategory.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  const rejectedCount = snapshot.vendors.filter((v) => v.status === "REJECTED").length;
  const contracted = snapshot.vendors.filter((v) =>
    ["CONTRACTED", "ACTIVE", "COMPLETED"].includes(v.status),
  ).length;

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
      <header className="mb-7">
        <div className="eyebrow mb-2">Who you're hiring</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[34px] leading-tight text-ink">Vendors</h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">
              {contracted} contracted of {snapshot.vendors.filter((v) => v.status !== "REJECTED").length} in play
              {rejectedCount > 0 ? ` · ${rejectedCount} ruled out` : ""}
            </p>
          </div>
          <div className="flex gap-1.5">
            <FilterLink href="/vendors" active={!showRejected && !categoryFilter}>
              In play
            </FilterLink>
            {rejectedCount > 0 ? (
              <FilterLink href="/vendors?status=rejected" active={showRejected}>
                Ruled out
              </FilterLink>
            ) : null}
          </div>
        </div>
      </header>

      {visible.length === 0 ? (
        <EmptyState
          title="No vendors here yet"
          description="Most couples start with the venue, then catering and photography — those three set most of the budget and the date."
        />
      ) : (
        <div className="space-y-9">
          {categories.map(([category, vendors]) => {
            const best = vendors.reduce(
              (max, v) => Math.max(max, STATUS_PROGRESS[v.status]),
              0,
            );
            return (
              <section key={category}>
                <div className="rule-heading mb-3">
                  <h2 className="flex items-baseline gap-2.5 font-display text-[19px] text-ink">
                    {VENDOR_CATEGORY_LABEL[category] ?? category}
                    <span className="tabular text-[12px] font-normal text-ink-muted">
                      {vendors.length}
                    </span>
                    {best === 100 ? (
                      <Badge variant="positive" size="xs">Booked</Badge>
                    ) : best === 0 ? (
                      <Badge variant="critical" size="xs">Nothing yet</Badge>
                    ) : null}
                  </h2>
                </div>

                <ul>
                  {vendors
                    .slice()
                    .sort((a, b) => STATUS_PROGRESS[b.status] - STATUS_PROGRESS[a.status])
                    .map((vendor) => {
                      const money = budget.byVendor.get(vendor.id);
                      const amount =
                        vendor.contractedAmount ??
                        vendor.negotiatedAmount ??
                        vendor.quoteAmount;
                      const contract = snapshot.contracts.find(
                        (c) => c.vendorId === vendor.id,
                      );

                      return (
                        <li key={vendor.id} className="border-b border-line last:border-b-0">
                          <Link
                            href={`/vendors/${vendor.id}`}
                            className="group flex items-center gap-4 py-3.5"
                          >
                            {/* Progress rail */}
                            <span className="hidden w-16 shrink-0 sm:block">
                              <span className="block h-[3px] w-full overflow-hidden rounded-full bg-surface-sunken">
                                <span
                                  className={cn(
                                    "block h-full rounded-full transition-all duration-500",
                                    STATUS_PROGRESS[vendor.status] === 100
                                      ? "bg-positive"
                                      : "bg-saffron",
                                  )}
                                  style={{ width: `${STATUS_PROGRESS[vendor.status]}%` }}
                                />
                              </span>
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-[14px] text-ink transition-colors group-hover:text-saffron">
                                  {vendor.businessName}
                                </span>
                                {vendor.isFavourite ? (
                                  <span className="text-saffron" title="Favourite">★</span>
                                ) : null}
                                {vendor.status === "SELECTED" && contract?.status !== "SIGNED" ? (
                                  <Badge variant="attention" size="xs">Not signed</Badge>
                                ) : null}
                              </span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-ink-muted">
                                <span>{VENDOR_STATUS_TEXT[vendor.status]}</span>
                                {vendor.city ? <span>· {vendor.city}</span> : null}
                                {vendor.rating ? (
                                  <span>· {"★".repeat(vendor.rating)}</span>
                                ) : null}
                              </span>
                            </span>

                            {canSeeMoney && amount ? (
                              <span className="shrink-0 text-right">
                                <span className="tabular block text-[13.5px] text-ink">
                                  {formatCompactMoney(
                                    budget.converter.toBase(amount, vendor.currency),
                                    currency,
                                  )}
                                </span>
                                {money && money.paid > 0 ? (
                                  <span className="tabular block text-[11px] text-ink-muted">
                                    {formatCompactMoney(money.paid, currency)} paid
                                  </span>
                                ) : null}
                              </span>
                            ) : null}

                            <Badge
                              variant={STATUS_VARIANT[vendor.status]}
                              size="xs"
                              className="hidden shrink-0 sm:inline-flex"
                            >
                              {VENDOR_STATUS_TEXT[vendor.status]}
                            </Badge>
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterLink({
  href, active, children,
}: {
  href: string; active: boolean; children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-[12.5px] transition-colors",
        active
          ? "border-saffron/30 bg-saffron-soft text-saffron"
          : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
