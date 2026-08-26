import "server-only";

/**
 * Storage.
 *
 * A provider-agnostic interface with a working local-disk implementation. Files
 * are written under `./storage/<weddingId>/…` and served through an
 * authenticated route — never from `public/`, so a contract PDF can't be reached
 * by guessing a URL.
 *
 * Swapping to S3 / R2 / Supabase means implementing `StorageProvider` and
 * changing `getStorage()`; nothing that calls this needs to change.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredObject {
  key: string;
  sizeBytes: number;
}

export interface StorageProvider {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /**
   * A URL the browser can fetch. Local storage returns our authenticated route;
   * a cloud provider would return a signed, expiring URL.
   */
  urlFor(key: string): string;
}

/**
 * Where files live on disk.
 *
 * Locally this is ./storage. In production, point STORAGE_DIR at a mounted
 * persistent volume (Railway Volume, fly volume, an EBS mount) — a serverless
 * filesystem is ephemeral and uploads would silently vanish on redeploy.
 */
const STORAGE_ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(process.cwd(), "storage");

/** Guards against `../` traversal in a key that reached us from a client. */
function resolveSafe(key: string): string {
  const normalised = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.join(STORAGE_ROOT, normalised);
  if (!full.startsWith(STORAGE_ROOT)) {
    throw new Error("Invalid storage key.");
  }
  return full;
}

class LocalDiskStorage implements StorageProvider {
  async put(key: string, body: Buffer, _contentType: string): Promise<StoredObject> {
    void _contentType;
    const full = resolveSafe(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return { key, sizeBytes: body.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(resolveSafe(key));
  }

  async delete(key: string): Promise<void> {
    await rm(resolveSafe(key), { force: true });
  }

  urlFor(key: string): string {
    return `/api/media/file/${encodeURIComponent(key)}`;
  }
}

let provider: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!provider) provider = new LocalDiskStorage();
  return provider;
}

/**
 * Build a collision-proof key. The random prefix means two people uploading
 * `lehenga.jpg` at once can't overwrite each other.
 */
export function buildStorageKey(
  weddingId: string,
  filename: string,
  variant?: string,
): string {
  const extension = path.extname(filename).toLowerCase().slice(0, 8) || ".bin";
  const stem = path
    .basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "file";
  const unique = randomBytes(8).toString("hex");
  const suffix = variant ? `-${variant}` : "";
  return `${weddingId}/${unique}-${stem}${suffix}${extension}`;
}

export function checksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 32);
}
