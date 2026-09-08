/**
 * Liveness check for the platform.
 *
 * Deliberately touches nothing — no database, no session, no snapshot. Its only
 * job is to answer "is the Node process up and serving?", which is the question
 * a deploy healthcheck is actually asking.
 *
 * The previous healthcheck pointed at /login, which reads the wedding and the
 * viewer from Postgres. That made a slow or briefly unreachable database look
 * like a dead application, and the deploy was rejected while the old build kept
 * serving — a failure mode that hides itself.
 *
 * Database health is a separate question, answered at /api/health?db=1 for when
 * you actually want to ask it.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const wantsDb = new URL(request.url).searchParams.has("db");

  if (!wantsDb) {
    return NextResponse.json({ ok: true, service: "wedding-os" });
  }

  // Imported lazily so the plain liveness path never even loads Prisma.
  try {
    const { db } = await import("@/server/db");
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "wedding-os", database: "up" });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "wedding-os",
        database: "unreachable",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
}
