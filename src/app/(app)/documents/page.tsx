import { redirect } from "next/navigation";

import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { variantUrl } from "@/server/media";
import { loadSnapshot } from "@/server/snapshot";
import { DocumentsLibrary } from "./library";

export default async function DocumentsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const snapshot = await loadSnapshot(viewer.weddingId);

  const [documents, media] = await Promise.all([
    db.document.findMany({
      where: { weddingId: viewer.weddingId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      include: { links: true, uploadedBy: { select: { name: true } } },
    }),
    db.mediaAsset.findMany({
      where: { weddingId: viewer.weddingId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      include: { links: true, uploadedBy: { select: { name: true } } },
    }),
  ]);

  const vendorById = new Map(snapshot.vendors.map((v) => [v.id, v.businessName]));
  const eventById = new Map(snapshot.events.map((e) => [e.id, e.name]));
  const personById = new Map(snapshot.wardrobePeople.map((p) => [p.id, p.name]));

  function describeLinks(links: { entityType: string; entityId: string }[]) {
    return links
      .map((link) => {
        if (link.entityType === "vendor") return vendorById.get(link.entityId);
        if (link.entityType === "event") return eventById.get(link.entityId);
        if (link.entityType === "outfit") return personById.get(link.entityId);
        return null;
      })
      .filter(Boolean) as string[];
  }

  // Legacy Document rows and the newer MediaAsset rows are one library to the
  // user — they shouldn't have to know there are two tables.
  const items = [
    ...documents
      .filter(
        (doc) =>
          doc.visibleToRoles.length === 0 || doc.visibleToRoles.includes(viewer.role),
      )
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        filename: doc.fileName,
        kind: doc.kind as string,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        url: `/api/media/file/${encodeURIComponent(doc.storagePath)}`,
        previewUrl: null as string | null,
        uploadedBy: doc.uploadedBy?.name ?? null,
        createdAt: doc.createdAt.toISOString(),
        linkedTo: describeLinks(doc.links),
        restricted: doc.visibleToRoles.length > 0,
      })),
    ...media.map((asset) => ({
      id: asset.id,
      title: asset.caption ?? asset.filename,
      filename: asset.filename,
      kind: asset.kind as string,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      url: variantUrl(asset, "original"),
      previewUrl: asset.mimeType.startsWith("image/")
        ? variantUrl(asset, "grid")
        : null,
      uploadedBy: asset.uploadedBy?.name ?? null,
      createdAt: asset.createdAt.toISOString(),
      linkedTo: describeLinks(asset.links),
      restricted: false,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <DocumentsLibrary
      items={items}
      canUpload={viewer.permissions.has("documents.upload")}
      vendors={snapshot.vendors.map((v) => ({ id: v.id, name: v.businessName }))}
      events={snapshot.events.map((e) => ({ id: e.id, name: e.name }))}
    />
  );
}
