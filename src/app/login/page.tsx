import { existsSync } from "node:fs";
import path from "node:path";

import Image from "next/image";
import { redirect } from "next/navigation";

import { cn } from "@/lib/cn";
import { daysBetween, formatDateRange } from "@/lib/dates";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // The sign-in screen is the one page that has to render when the database is
  // having a bad day — otherwise a brief outage looks like the whole app is
  // gone, and nobody can even get to the point of being told why.
  let viewer = null;
  try {
    viewer = await getViewer();
  } catch {
    // Unreadable session; treat it as signed out rather than failing the page.
  }
  if (viewer) redirect("/");

  let wedding = null;
  try {
    wedding = await db.wedding.findFirst({
      select: {
        partnerAName: true,
        partnerBName: true,
        startDate: true,
        endDate: true,
        weddingType: true,
      },
    });
  } catch {
    // Falls through to the couple's names as written into the layout below.
  }

  const days = wedding ? daysBetween(new Date(), wedding.startDate) : null;

  // Prefers the proposal photograph, falls back to the mandap shot, and finally
  // to the plain warm panel. Checked on disk so dropping a file into
  // public/brand is the whole job — no code change, no broken image if it isn't
  // there yet.
  const photo = firstExisting([
    "/brand/proposal.jpg",
    "/brand/proposal.jpeg",
    "/brand/proposal.png",
    "/brand/hero-mandap.jpg",
  ]);

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-canvas-deep p-10 lg:flex">
        {photo ? (
          <>
            <Image
              src={photo}
              alt="Avantika and Prateek"
              fill
              priority
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="object-cover object-[62%_center]"
            />
            {/* Two scrims, not one: a wash over the whole frame to take the
                glare off the gravel, and a heavier foot so the type at the
                bottom holds its contrast wherever the photo happens to be
                bright. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-[#2a1c14]/25"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-[#1a1310]/85 via-[#1a1310]/35 to-[#1a1310]/15"
            />
          </>
        ) : (
          <>
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
          </>
        )}

        <div className={cn("eyebrow relative", photo && "text-white/70")}>
          Wedding Operating System
        </div>

        <div className="relative">
          <h1
            className={cn(
              "font-script text-[88px]",
              photo ? "text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.45)]" : "text-ink",
            )}
          >
            {wedding?.partnerAName ?? "Avantika"}
            <span className={cn("mx-3", photo ? "text-saffron-soft" : "text-saffron")}>&</span>
            {wedding?.partnerBName ?? "Prateek"}
          </h1>
          {wedding ? (
            <p className={cn("mt-4 text-[15px]", photo ? "text-white/85" : "text-ink-soft")}>
              {formatDateRange(wedding.startDate, wedding.endDate)}
              <span className={cn("mx-2", photo ? "text-white/45" : "text-ink-faint")}>·</span>
              {wedding.weddingType}
            </p>
          ) : null}
          {days !== null && days > 0 ? (
            <p
              className={cn(
                "mt-8 font-display text-[22px]",
                photo ? "text-white/75" : "text-ink-soft",
              )}
            >
              <span className={cn("tabular", photo ? "text-white" : "text-ink")}>{days}</span>{" "}
              days to go
            </p>
          ) : null}
        </div>

        <p
          className={cn(
            "relative max-w-sm text-[13px] leading-relaxed",
            photo ? "text-white/70" : "text-ink-muted",
          )}
        >
          Everything in one place — guests, vendors, budget, logistics and the run of show — so the only question left is what needs doing next.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <LoginForm />
      </section>
    </main>
  );
}

/** The first of these that's actually in `public`, or null. */
function firstExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(path.join(process.cwd(), "public", candidate))) return candidate;
  }
  return null;
}
