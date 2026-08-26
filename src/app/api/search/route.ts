import { NextResponse } from "next/server";

import { getViewer } from "@/server/auth";
import { searchWedding } from "@/server/search";
import { loadSnapshot } from "@/server/snapshot";

export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const snapshot = await loadSnapshot(viewer.weddingId);
  return NextResponse.json({
    results: searchWedding(snapshot, viewer, query),
  });
}
