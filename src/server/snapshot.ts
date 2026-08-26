/**
 * Per-request snapshot access.
 *
 * `server-only` matters here: a snapshot contains the entire wedding, including
 * restricted documents and every payment. It must never end up in a client
 * bundle. Pages read through this; tests and scripts use `snapshot-query`.
 */

import "server-only";

import { cache } from "react";

import type { WeddingSnapshot } from "@/domain/types";
import { fetchSnapshot } from "./snapshot-query";

/** Cached for the lifetime of one request, so a page costs one read. */
export const loadSnapshot = cache(
  async (weddingId: string): Promise<WeddingSnapshot> => fetchSnapshot(weddingId),
);

export { AREA_BY_PREFIX } from "./snapshot-query";
