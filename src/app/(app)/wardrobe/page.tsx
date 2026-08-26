import { redirect } from "next/navigation";

import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { variantUrl } from "@/server/media";
import { loadSnapshot } from "@/server/snapshot";
import { WardrobeLookbook } from "./lookbook";

export default async function WardrobePage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; outfit?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const { person: requestedPerson, outfit: requestedOutfit } = await searchParams;
  const snapshot = await loadSnapshot(viewer.weddingId);

  const [people, outfits, jewellery, links] = await Promise.all([
    db.wardrobePerson.findMany({
      where: { weddingId: viewer.weddingId },
      orderBy: { sortOrder: "asc" },
    }),
    db.outfit.findMany({
      where: { weddingId: viewer.weddingId, archivedAt: null },
      include: {
        fittings: { orderBy: { scheduledAt: "asc" } },
        accessories: true,
        vendor: { select: { businessName: true } },
      },
    }),
    db.jewelleryItem.findMany({
      where: { weddingId: viewer.weddingId, archivedAt: null },
    }),
    // One query for every image attached to any outfit or jewellery item.
    db.mediaLink.findMany({
      where: {
        entityType: { in: ["outfit", "jewellery"] },
        media: { weddingId: viewer.weddingId, archivedAt: null },
      },
      orderBy: { sortOrder: "asc" },
      include: { media: true },
    }),
  ]);

  const imagesByEntity = new Map<string, typeof links>();
  for (const link of links) {
    const list = imagesByEntity.get(link.entityId) ?? [];
    list.push(link);
    imagesByEntity.set(link.entityId, list);
  }

  const toImages = (entityId: string) =>
    (imagesByEntity.get(entityId) ?? []).map((link) => ({
      id: link.media.id,
      role: link.role,
      thumbUrl: variantUrl(link.media, "grid"),
      largeUrl: variantUrl(link.media, "large"),
      caption: link.media.caption,
      filename: link.media.filename,
      width: link.media.width,
      height: link.media.height,
      createdAt: link.media.createdAt.toISOString(),
    }));

  const eventOrder = new Map(snapshot.events.map((e, i) => [e.id, i]));

  return (
    <WardrobeLookbook
      canEdit={viewer.permissions.has("wardrobe.edit")}
      currency={viewer.displayCurrency}
      initialPersonId={requestedPerson ?? people[0]?.id ?? null}
      initialOutfitId={requestedOutfit ?? null}
      events={snapshot.events.map((e) => ({
        id: e.id,
        name: e.name,
        tone: e.accentTone,
        dateLabel: e.date.toISOString(),
      }))}
      people={people.map((person) => ({
        id: person.id,
        name: person.name,
        role: person.role,
      }))}
      outfits={outfits
        .slice()
        .sort(
          (a, b) =>
            (eventOrder.get(a.eventId ?? "") ?? 99) -
            (eventOrder.get(b.eventId ?? "") ?? 99),
        )
        .map((outfit) => ({
          id: outfit.id,
          personId: outfit.personId,
          eventId: outfit.eventId,
          outfitType: outfit.outfitType,
          designer: outfit.designer,
          vendorName: outfit.vendor?.businessName ?? null,
          cost: outfit.cost ? Number(outfit.cost) : null,
          currency: outfit.currency,
          status: outfit.status,
          orderDate: outfit.orderDate?.toISOString() ?? null,
          deliveryDate: outfit.deliveryDate?.toISOString() ?? null,
          notes: outfit.notes,
          images: toImages(outfit.id),
          accessories: outfit.accessories.map((a) => ({
            id: a.id, kind: a.kind, name: a.name, status: a.status,
          })),
          fittings: outfit.fittings.map((f) => ({
            id: f.id,
            kind: f.kind,
            scheduledAt: f.scheduledAt.toISOString(),
            completedAt: f.completedAt?.toISOString() ?? null,
            location: f.location,
          })),
        }))}
      jewellery={jewellery.map((item) => ({
        id: item.id,
        personId: item.personId,
        eventId: item.eventId,
        name: item.name,
        ownership: item.ownership,
        jeweller: item.jeweller,
        cost: item.cost ? Number(item.cost) : null,
        currency: item.currency,
        insured: item.insured,
        notes: item.notes,
        storageNote: item.storageNote,
        images: toImages(item.id),
      }))}
    />
  );
}
