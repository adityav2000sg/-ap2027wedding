import { redirect } from "next/navigation";

import { daysBetween, formatDateRange } from "@/lib/dates";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getViewer()) redirect("/");

  const wedding = await db.wedding.findFirst({
    select: {
      partnerAName: true,
      partnerBName: true,
      startDate: true,
      endDate: true,
      weddingType: true,
    },
  });

  // Offer the seeded family as one-click sign-ins while developing.
  const demoUsers =
    process.env.NODE_ENV === "production"
      ? []
      : await db.weddingMember.findMany({
          include: { user: true },
          orderBy: { createdAt: "asc" },
          take: 9,
        });

  const days = wedding
    ? daysBetween(new Date(), wedding.startDate)
    : null;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Editorial panel — sets the tone before anyone has signed in. */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-canvas-deep p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, #c2703d 0%, transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-[380px] w-[380px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, #7a5570 0%, transparent 70%)" }}
        />

        <div className="eyebrow relative">Wedding Operating System</div>

        <div className="relative">
          <h1 className="font-display text-[56px] leading-[1.05] text-ink">
            {wedding?.partnerAName ?? "Avantika"}
            <span className="mx-3 text-saffron">&</span>
            {wedding?.partnerBName ?? "Prateek"}
          </h1>
          {wedding ? (
            <p className="mt-4 text-[15px] text-ink-soft">
              {formatDateRange(wedding.startDate, wedding.endDate)}
              <span className="mx-2 text-ink-faint">·</span>
              {wedding.weddingType}
            </p>
          ) : null}
          {days !== null && days > 0 ? (
            <p className="mt-8 font-display text-[22px] text-ink-soft">
              <span className="tabular text-ink">{days}</span> days to go
            </p>
          ) : null}
        </div>

        <p className="relative max-w-sm text-[13px] leading-relaxed text-ink-muted">
          Everything in one place — guests, vendors, budget, logistics and the
          run of show — so the only question left is what needs doing next.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <LoginForm
          demoUsers={demoUsers.map((member) => ({
            email: member.user.email,
            name: member.user.name,
            relation: member.relation,
            role: member.role,
            tone: member.user.avatarTone,
          }))}
        />
      </section>
    </main>
  );
}
