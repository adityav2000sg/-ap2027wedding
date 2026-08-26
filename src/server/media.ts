import "server-only";

/**
 * Media ingestion.
 *
 * One path for every upload in the product: validate, generate derivatives,
 * store, record. Nothing calls the storage layer directly.
 */

import sharp, { type Sharp } from "sharp";

import { db } from "./db";
import { logActivity } from "./activity";
import { buildStorageKey, getStorage } from "./storage";
import type { Viewer } from "./permissions";
import type { MediaKind } from "@prisma/client";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif",
]);

const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

export function isImage(mimeType: string): boolean {
  return IMAGE_TYPES.has(mimeType);
}

export function isAcceptedType(mimeType: string): boolean {
  return IMAGE_TYPES.has(mimeType) || DOCUMENT_TYPES.has(mimeType);
}

/** Derivative widths. Nothing bigger than `large` is ever sent to a browser. */
const DERIVATIVES = [
  { name: "thumb", width: 320 },
  { name: "grid", width: 800 },
  { name: "large", width: 1800 },
] as const;

export interface UploadResult {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  kind: MediaKind;
  url: string;
  thumbUrl: string;
  gridUrl: string;
}

export interface UploadInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  kind?: MediaKind;
  caption?: string | null;
  tags?: string[];
  links?: { entityType: string; entityId: string; role?: string }[];
}

export async function ingestUpload(
  viewer: Viewer,
  input: UploadInput,
): Promise<UploadResult> {
  const { buffer, filename, mimeType } = input;

  if (buffer.byteLength === 0) throw new Error("That file is empty.");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB — the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
    );
  }
  if (!isAcceptedType(mimeType)) {
    throw new Error(
      "That file type isn't supported. Upload an image (JPG, PNG, WEBP) or a document (PDF, DOCX, XLSX).",
    );
  }

  const storage = getStorage();
  const image = isImage(mimeType);

  let width: number | null = null;
  let height: number | null = null;
  let blurData: string | null = null;
  const derivatives: Record<string, string> = {};
  let storedBuffer = buffer;
  let storedMime = mimeType;
  let storedName = filename;

  if (image) {
    let pipeline: Sharp;
    try {
      // `rotate()` with no argument applies the EXIF orientation, so phone
      // photos don't arrive sideways.
      pipeline = sharp(buffer, { failOn: "none" }).rotate();
      const metadata = await pipeline.metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
    } catch {
      // HEIC needs libheif, which isn't guaranteed. Say so plainly rather than
      // storing a file nothing can display.
      if (mimeType === "image/heic" || mimeType === "image/heif") {
        throw new Error(
          "HEIC images can't be processed here. Please export as JPEG and try again.",
        );
      }
      throw new Error("That image couldn't be read. It may be corrupted.");
    }

    // Normalise HEIC-ish originals to JPEG so every browser can show them.
    if (mimeType === "image/heic" || mimeType === "image/heif") {
      storedBuffer = await sharp(buffer).rotate().jpeg({ quality: 92 }).toBuffer();
      storedMime = "image/jpeg";
      storedName = filename.replace(/\.(heic|heif)$/i, ".jpg");
    }

    for (const derivative of DERIVATIVES) {
      // Never upscale — a 400px reference shot shouldn't become a blurry 1800px.
      if (width && width <= derivative.width && derivative.name !== "thumb") continue;

      const resized = await sharp(storedBuffer)
        .rotate()
        .resize({ width: derivative.width, withoutEnlargement: true })
        .webp({ quality: derivative.name === "thumb" ? 72 : 82 })
        .toBuffer();

      const key = buildStorageKey(viewer.weddingId, `${storedName}.webp`, derivative.name);
      await storage.put(key, resized, "image/webp");
      derivatives[derivative.name] = key;
    }

    // A 16px WEBP inlined as a data URL — enough for a blur-up placeholder.
    const tiny = await sharp(storedBuffer)
      .rotate()
      .resize({ width: 16 })
      .webp({ quality: 40 })
      .toBuffer();
    blurData = `data:image/webp;base64,${tiny.toString("base64")}`;
  }

  const storageKey = buildStorageKey(viewer.weddingId, storedName);
  await storage.put(storageKey, storedBuffer, storedMime);

  const kind: MediaKind = input.kind ?? (image ? "PHOTO" : "DOCUMENT");

  const asset = await db.mediaAsset.create({
    data: {
      weddingId: viewer.weddingId,
      uploadedById: viewer.userId,
      filename: storedName,
      mimeType: storedMime,
      sizeBytes: storedBuffer.byteLength,
      storageKey,
      width,
      height,
      derivatives: Object.keys(derivatives).length ? derivatives : undefined,
      blurData,
      kind,
      caption: input.caption ?? null,
      tags: input.tags ?? [],
      links: {
        create: (input.links ?? []).map((link, index) => ({
          entityType: link.entityType,
          entityId: link.entityId,
          role: link.role ?? "reference",
          sortOrder: index,
        })),
      },
    },
  });

  return {
    id: asset.id,
    filename: asset.filename,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    kind: asset.kind,
    url: mediaUrl(asset.storageKey),
    thumbUrl: mediaUrl(derivatives.thumb ?? asset.storageKey),
    gridUrl: mediaUrl(derivatives.grid ?? derivatives.thumb ?? asset.storageKey),
  };
}

export function mediaUrl(key: string): string {
  return getStorage().urlFor(key);
}

/** Resolve the best URL for a given display size from a stored asset. */
export function variantUrl(
  asset: {
    storageKey: string;
    derivatives?: unknown;
  },
  variant: "thumb" | "grid" | "large" | "original" = "grid",
): string {
  if (variant === "original") return mediaUrl(asset.storageKey);
  const derivatives = (asset.derivatives ?? {}) as Record<string, string>;
  const order =
    variant === "thumb"
      ? ["thumb", "grid", "large"]
      : variant === "grid"
        ? ["grid", "large", "thumb"]
        : ["large", "grid", "thumb"];
  for (const name of order) {
    if (derivatives[name]) return mediaUrl(derivatives[name]);
  }
  return mediaUrl(asset.storageKey);
}

/** Remove an asset and every derivative from storage as well as the database. */
export async function deleteMedia(viewer: Viewer, mediaId: string): Promise<void> {
  const asset = await db.mediaAsset.findFirst({
    where: { id: mediaId, weddingId: viewer.weddingId },
  });
  if (!asset) throw new Error("That file no longer exists.");

  const storage = getStorage();
  const derivatives = (asset.derivatives ?? {}) as Record<string, string>;
  await Promise.allSettled([
    storage.delete(asset.storageKey),
    ...Object.values(derivatives).map((key) => storage.delete(key)),
  ]);

  await db.mediaAsset.delete({ where: { id: mediaId } });

  await logActivity({
    weddingId: viewer.weddingId,
    actorId: viewer.userId,
    entityType: "media",
    entityId: mediaId,
    entityLabel: asset.filename,
    action: "deleted",
    summary: `${viewer.name} deleted ${asset.filename}.`,
  });
}
