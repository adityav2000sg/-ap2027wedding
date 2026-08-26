import { NextResponse } from "next/server";

import { logActivity } from "@/server/activity";
import { getViewer } from "@/server/auth";
import { ingestUpload } from "@/server/media";
import { db } from "@/server/db";

export const maxDuration = 60;

/**
 * Multipart upload endpoint.
 *
 * Accepts one or more files plus optional association metadata, so a wardrobe
 * drag-and-drop of five reference shots is a single request.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }
  if (!viewer.permissions.has("documents.upload")) {
    return NextResponse.json(
      { error: "You don't have permission to upload files." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "That upload couldn't be read." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files were attached." }, { status: 400 });
  }

  const entityType = (form.get("entityType") as string | null)?.trim() || null;
  const entityId = (form.get("entityId") as string | null)?.trim() || null;
  const role = (form.get("role") as string | null)?.trim() || "reference";
  const moodboardId = (form.get("moodboardId") as string | null)?.trim() || null;
  const kind = (form.get("kind") as string | null)?.trim() || null;
  const caption = (form.get("caption") as string | null)?.trim() || null;

  const links =
    entityType && entityId ? [{ entityType, entityId, role }] : [];

  const uploaded = [];
  const failed: { filename: string; error: string }[] = [];

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await ingestUpload(viewer, {
        buffer,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        kind: kind as never,
        caption,
        links,
      });

      // Adding straight to a moodboard is common enough to be a first-class
      // option rather than a second round trip.
      if (moodboardId) {
        const board = await db.moodboard.findFirst({
          where: { id: moodboardId, weddingId: viewer.weddingId },
          select: { id: true },
        });
        if (board) {
          const count = await db.moodboardItem.count({ where: { moodboardId: board.id } });
          await db.moodboardItem.create({
            data: {
              moodboardId: board.id,
              mediaId: result.id,
              caption,
              sortOrder: count,
            },
          });
        }
      }

      uploaded.push(result);
    } catch (error) {
      failed.push({
        filename: file.name,
        error: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  if (uploaded.length > 0) {
    const label = moodboardId
      ? await db.moodboard
          .findUnique({ where: { id: moodboardId }, select: { name: true } })
          .then((b) => b?.name ?? null)
      : null;

    await logActivity({
      weddingId: viewer.weddingId,
      actorId: viewer.userId,
      entityType: entityType ?? "media",
      entityId: entityId ?? undefined,
      entityLabel: label,
      action: "uploaded",
      summary:
        uploaded.length === 1
          ? `${viewer.name} uploaded ${uploaded[0].filename}${label ? ` to ${label}` : ""}.`
          : `${viewer.name} added ${uploaded.length} files${label ? ` to ${label}` : ""}.`,
      after: { count: uploaded.length, files: uploaded.map((u) => u.filename) },
    });
  }

  return NextResponse.json(
    { uploaded, failed },
    { status: failed.length && !uploaded.length ? 400 : 200 },
  );
}
