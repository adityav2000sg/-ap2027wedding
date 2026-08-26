import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buildBudgetView } from "@/domain/budget";
import { VENDOR_CATEGORY_LABEL, VENDOR_STATUS_TEXT } from "@/domain/impact";
import { formatMediumDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/primitives";
import { ArrowRightIcon } from "@/components/ui/icons";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { variantUrl } from "@/server/media";
import { loadSnapshot } from "@/server/snapshot";
import { VendorDetail } from "./detail";

export default async function VendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const { id } = await params;
  const snapshot = await loadSnapshot(viewer.weddingId);
  const vendor = snapshot.vendors.find((v) => v.id === id);
  if (!vendor) notFound();

  const budget = buildBudgetView(snapshot, viewer.displayCurrency);
  const currency = viewer.displayCurrency;
  const canSeeMoney = viewer.permissions.has("budget.view");

  const [quotes, interactions, documents, media] = await Promise.all([
    db.vendorQuote.findMany({
      where: { vendorId: id },
      orderBy: { receivedAt: "asc" },
      include: { media: true },
    }),
    db.vendorInteraction.findMany({
      where: { vendorId: id },
      orderBy: { occurredAt: "asc" },
      include: { author: { include: { user: { select: { name: true } } } } },
    }),
    db.document.findMany({
      where: {
        weddingId: viewer.weddingId,
        archivedAt: null,
        links: { some: { entityType: "vendor", entityId: id } },
      },
    }),
    db.mediaLink.findMany({
      where: { entityType: "vendor", entityId: id, media: { archivedAt: null } },
      orderBy: { sortOrder: "asc" },
      include: { media: true },
    }),
  ]);

  const contract = snapshot.contracts.find((c) => c.vendorId === id) ?? null;
  const money = budget.byVendor.get(id);
  const payments = snapshot.payments.filter((p) => p.vendorId === id);
  const linkedTasks = snapshot.tasks.filter(
    (t) => t.vendorId === id && !t.completedAt,
  );

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8 sm:px-8">
      <Link
        href="/vendors"
        className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted transition-colors hover:text-saffron"
      >
        <ArrowRightIcon size={12} className="rotate-180" /> All vendors
      </Link>

      <header className="mb-7">
        <div className="eyebrow mb-2">
          {VENDOR_CATEGORY_LABEL[vendor.category] ?? vendor.category}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[34px] leading-tight text-ink">
              {vendor.businessName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft">
              <Badge size="sm">{VENDOR_STATUS_TEXT[vendor.status]}</Badge>
              {vendor.city ? <span>{vendor.city}</span> : null}
              {vendor.rating ? (
                <span className="text-saffron">{"★".repeat(vendor.rating)}</span>
              ) : null}
            </div>
          </div>

          {canSeeMoney && money ? (
            <div className="text-right">
              <div className="tabular font-display text-[26px] leading-none text-ink">
                {formatMoney(
                  budget.converter.toBase(
                    vendor.contractedAmount ?? vendor.negotiatedAmount ?? vendor.quoteAmount ?? 0,
                    vendor.currency,
                  ),
                  currency,
                )}
              </div>
              <div className="mt-1 text-[11.5px] text-ink-muted">
                {vendor.contractedAmount
                  ? "Contracted"
                  : vendor.negotiatedAmount
                    ? "Negotiated"
                    : vendor.quoteAmount
                      ? "Quoted"
                      : "No price yet"}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <VendorDetail
        canEdit={viewer.permissions.has("vendors.edit")}
        canSeeMoney={canSeeMoney}
        currency={currency}
        vendor={{
          id: vendor.id,
          businessName: vendor.businessName,
          category: vendor.category,
          status: vendor.status,
          contactName: vendor.contactName,
          phone: vendor.phone,
          email: vendor.email,
          website: vendor.website,
          city: vendor.city,
          rating: vendor.rating,
          pros: vendor.pros,
          cons: vendor.cons,
          notes: vendor.notes,
          packageInfo: vendor.packageInfo,
          deliverables: vendor.deliverables,
          decisionReason: vendor.decisionReason,
          isFavourite: vendor.isFavourite,
          nativeCurrency: vendor.currency,
          quoteAmount: vendor.quoteAmount,
          negotiatedAmount: vendor.negotiatedAmount,
          contractedAmount: vendor.contractedAmount,
          attributes: vendor.attributes,
        }}
        contract={
          contract
            ? {
                id: contract.id,
                title: contract.title,
                amount: contract.amount,
                currency: contract.currency,
                status: contract.status,
                signedDate: contract.signedDate?.toISOString() ?? null,
                expiryDate: contract.expiryDate?.toISOString() ?? null,
              }
            : null
        }
        quotes={quotes.map((quote) => ({
          id: quote.id,
          label: quote.label,
          amount: Number(quote.amount),
          currency: quote.currency,
          receivedAt: quote.receivedAt.toISOString(),
          isCurrent: quote.isCurrent,
          notes: quote.notes,
          documentName: quote.media?.filename ?? null,
          documentUrl: quote.media ? variantUrl(quote.media, "original") : null,
        }))}
        interactions={interactions.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          occurredAt: entry.occurredAt.toISOString(),
          summary: entry.summary,
          authorName: entry.author?.user.name ?? null,
        }))}
        documents={[
          ...documents.map((doc) => ({
            id: doc.id,
            name: doc.title,
            kind: doc.kind as string,
            url: `/api/media/file/${encodeURIComponent(doc.storagePath)}`,
            createdAt: doc.createdAt.toISOString(),
            isImage: doc.mimeType.startsWith("image/"),
          })),
          ...media.map((link) => ({
            id: link.media.id,
            name: link.media.filename,
            kind: link.media.kind as string,
            url: variantUrl(link.media, link.media.kind === "PHOTO" ? "grid" : "original"),
            createdAt: link.media.createdAt.toISOString(),
            isImage: link.media.mimeType.startsWith("image/"),
          })),
        ]}
        payments={payments.map((payment) => ({
          id: payment.id,
          label: payment.label,
          amount: budget.converter.toBase(payment.amount, payment.currency),
          status: payment.status,
          dueDate: formatMediumDate(new Date(payment.dueDate)),
        }))}
        tasks={linkedTasks.map((task) => ({
          id: task.id,
          title: task.title,
          dueDate: task.dueDate ? formatMediumDate(new Date(task.dueDate)) : null,
        }))}
      />
    </div>
  );
}
