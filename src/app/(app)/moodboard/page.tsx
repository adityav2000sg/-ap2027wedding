import { redirect } from "next/navigation";

import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { variantUrl } from "@/server/media";
import { MoodboardWorkspace } from "./workspace";

export default async function MoodboardPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const { board: requestedBoard } = await searchParams;

  const [boards, events] = await Promise.all([
    db.moodboard.findMany({
      where: { weddingId: viewer.weddingId, archivedAt: null },
      orderBy: [{ scope: "asc" }, { sortOrder: "asc" }],
      include: {
        event: { select: { name: true, accentTone: true } },
        _count: { select: { items: true } },
        items: {
          orderBy: [{ sortOrder: "asc" }],
          include: {
            media: true,
            vendor: { select: { businessName: true } },
            outfit: { select: { outfitType: true } },
          },
        },
      },
    }),
    db.event.findMany({
      where: { weddingId: viewer.weddingId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, accentTone: true },
    }),
  ]);

  const activeId =
    boards.find((b) => b.id === requestedBoard)?.id ?? boards[0]?.id ?? null;

  return (
    <MoodboardWorkspace
      canEdit={viewer.permissions.has("documents.upload")}
      activeBoardId={activeId}
      events={events}
      boards={boards.map((board) => ({
        id: board.id,
        name: board.name,
        description: board.description,
        scope: board.scope,
        category: board.category,
        eventName: board.event?.name ?? null,
        tone: board.event?.accentTone ?? "saffron",
        itemCount: board._count.items,
        coverUrl:
          board.items[0] != null ? variantUrl(board.items[0].media, "thumb") : null,
        items: board.items.map((item) => ({
          id: item.id,
          mediaId: item.mediaId,
          thumbUrl: variantUrl(item.media, "grid"),
          largeUrl: variantUrl(item.media, "large"),
          caption: item.caption ?? item.media.caption,
          filename: item.media.filename,
          width: item.media.width,
          height: item.media.height,
          blurData: item.media.blurData,
          isFavourite: item.isFavourite,
          createdAt: item.createdAt.toISOString(),
          contextLabel:
            item.vendor?.businessName ?? item.outfit?.outfitType ?? null,
        })),
      }))}
    />
  );
}
