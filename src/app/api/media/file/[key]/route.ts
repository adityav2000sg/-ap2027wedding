import { NextResponse } from "next/server";

import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { getStorage } from "@/server/storage";

/**
 * Authenticated file serving.
 *
 * Every byte goes through here rather than `public/`, so a contract PDF or a
 * jewellery photograph can't be reached by guessing a URL. The key must belong
 * to the viewer's own wedding, and must correspond to a real asset row —
 * possession of a key is not sufficient.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Not authorised", { status: 401 });

  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);

  // The key must sit inside this wedding's namespace.
  if (!key.startsWith(`${viewer.weddingId}/`)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // …and must be a key we actually issued, as an original or a derivative.
  const asset = await db.mediaAsset.findFirst({
    where: {
      weddingId: viewer.weddingId,
      OR: [
        { storageKey: key },
        { derivatives: { path: ["thumb"], equals: key } },
        { derivatives: { path: ["grid"], equals: key } },
        { derivatives: { path: ["large"], equals: key } },
      ],
    },
    select: { mimeType: true, filename: true, storageKey: true },
  });

  // Documents seeded before the media system are served from the same store.
  const legacyDocument = asset
    ? null
    : await db.document.findFirst({
        where: { weddingId: viewer.weddingId, storagePath: key },
        select: { mimeType: true, fileName: true },
      });

  if (!asset && !legacyDocument) {
    return new NextResponse("Not found", { status: 404 });
  }

  let body: Buffer;
  try {
    body = await getStorage().get(key);
  } catch {
    // The row exists and the file doesn't. That only happens when the directory
    // the bytes went into is not the directory we're now reading from — almost
    // always an unset STORAGE_DIR, so the upload landed in the container's own
    // working copy and the next deploy rebuilt it away.
    //
    // Worth a line in the log, because from the browser's side this is a silent
    // 404 inside an <img> and the page just renders a broken picture. See
    // /api/health?storage=1 for the whole picture rather than one file's worth.
    console.error(
      `[media] recorded asset has no file on disk: ${key} (storage root: ${
        process.env.STORAGE_DIR ?? `${process.cwd()}/storage (not persistent)`
      })`,
    );
    return new NextResponse("Not found", { status: 404 });
  }

  const isDerivative = asset ? asset.storageKey !== key : false;
  const mimeType = asset
    ? isDerivative
      ? "image/webp"
      : asset.mimeType
    : legacyDocument!.mimeType;
  const filename = asset ? asset.filename : legacyDocument!.fileName;

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      // Private: the response is user-scoped, so shared caches must not keep it.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
