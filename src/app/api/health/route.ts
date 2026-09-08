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
 * you actually want to ask it. Email configuration is answered at
 * /api/health?email=1 — reporting only whether things are set and whether Resend
 * accepts the key, never the values themselves.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const wantsDb = params.has("db");
  const wantsEmail = params.has("email");

  if (wantsEmail) {
    return NextResponse.json({ ok: true, service: "wedding-os", email: await emailStatus() });
  }

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

/**
 * Why sign-in codes aren't arriving.
 *
 * A send with no key and no sender is a deliberate no-op — it logs and returns,
 * so the login form still reports "a code is on its way" rather than leaking
 * whether an address has an account. Correct for privacy, invisible when it's
 * actually misconfiguration, hence this.
 *
 * Reports presence and shape only. No key, no address, no domain is ever
 * returned, so this is safe to hit from anywhere.
 */
async function emailStatus() {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM ?? "";

  // Accepts both "someone@domain" and "Name <someone@domain>".
  const domain = from.match(/@([^\s>]+)/)?.[1]?.toLowerCase() ?? null;
  const placeholder = domain !== null && /example\.(com|org|test)$/.test(domain);

  const status = {
    apiKey: apiKey ? "set" : "missing",
    fromAddress: from ? "set" : "missing",
    fromIsPlaceholder: placeholder,
    /** False means every send is silently skipped before it reaches Resend. */
    wouldAttemptSend: Boolean(apiKey && from),
    resend: "not checked" as string,
    verifiedDomains: null as number | null,
    senderDomainVerified: null as boolean | null,
  };

  if (!apiKey) return status;

  // Ask Resend directly rather than inferring. Read-only; sends nothing.
  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 401 || response.status === 400) {
      status.resend = "key rejected";
      return status;
    }
    if (!response.ok) {
      status.resend = `unexpected ${response.status}`;
      return status;
    }

    const body = (await response.json()) as {
      data?: { name?: string; status?: string }[];
    };
    const domains = body.data ?? [];
    const verified = domains.filter((d) => d.status === "verified");

    status.resend = "key accepted";
    status.verifiedDomains = verified.length;
    status.senderDomainVerified =
      domain === null ? null : verified.some((d) => d.name?.toLowerCase() === domain);
  } catch {
    status.resend = "unreachable";
  }

  return status;
}
