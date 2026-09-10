/**
 * The page a guest opens from their invitation.
 *
 * Public — no sign-in, no account, nothing to remember. The token in the URL is
 * the whole key, so this file reads one household by that token and shows only
 * what belongs to it. A bad token gets the ordinary not-found page rather than
 * anything that would confirm the shape of a real one.
 *
 * It is styled as an invitation rather than a form, because that is what it is
 * to the person opening it. The wedding's own photograph, the names in the same
 * hand as everywhere else, then the questions.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { formatDateRange, daysBetween } from "@/lib/dates";
import { publicRsvpKey, publicRsvpPath, rsvpCodeFromPath } from "@/lib/rsvp-links";
import { db } from "@/server/db";
import { RsvpForm, type RsvpPerson } from "./rsvp-form";
import { SaveTheDate, type StdPerson } from "./save-the-date";

// The reply must reflect what was just submitted, never a cached copy.
export const dynamic = "force-dynamic";

/**
 * The date replies are needed by.
 *
 * Held in one place, as a real date and the words for it, so the deadline shown
 * on the invitation and the countdown beside it can never disagree.
 */
const REPLY_BY = new Date("2026-10-01T00:00:00.000Z");
const REPLY_BY_LABEL = "1st October 2026";

export const metadata: Metadata = {
  // A wedding invitation has no business in a search index.
  robots: { index: false, follow: false },
};

async function loadInvitation(token: string) {
  let personal = await db.guest.findUnique({
    where: { rsvpToken: token },
    select: {
      id: true,
      householdId: true,
      firstName: true,
      lastName: true,
      rsvpToken: true,
      rsvpMessage: true,
      rsvpSubmittedAt: true,
    },
  });

  let householdKey = personal
    ? null
    : await db.household.findUnique({
        where: { rsvpToken: token },
        select: { id: true, name: true, rsvpToken: true },
      });

  // New links expose only a 12-character private prefix. Legacy full-token
  // links are still accepted above, then redirected to their readable alias.
  if (!personal && !householdKey) {
    const code = rsvpCodeFromPath(token);
    if (!code) return null;

    const [matchingPeople, matchingHouseholds] = await Promise.all([
      db.guest.findMany({
        where: { rsvpToken: { startsWith: code } },
        take: 2,
        select: {
          id: true,
          householdId: true,
          firstName: true,
          lastName: true,
          rsvpToken: true,
          rsvpMessage: true,
          rsvpSubmittedAt: true,
        },
      }),
      db.household.findMany({
        where: { rsvpToken: { startsWith: code } },
        take: 2,
        select: { id: true, name: true, rsvpToken: true },
      }),
    ]);

    // A collision is extraordinarily unlikely, but opening neither invitation
    // is safer than choosing the wrong person if one ever occurs.
    if (matchingPeople.length + matchingHouseholds.length !== 1) return null;
    personal = matchingPeople[0] ?? null;
    householdKey = matchingHouseholds[0] ?? null;
  }

  const householdId = personal?.householdId ?? householdKey?.id;
  if (!householdId) return null;

  const household = await db.household.findUnique({
    where: { id: householdId },
    select: {
      id: true,
      name: true,
      rsvpToken: true,
      rsvpMessage: true,
      rsvpSubmittedAt: true,
      stdRepliedAt: true,
      guests: {
        // A household link speaks only for ordinary group recipients. Guests
        // with a personal token are intentionally excluded and answer through
        // their own private link instead.
        where: personal
          ? { id: personal.id, archivedAt: null }
          : { archivedAt: null, rsvpToken: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          dietary: true,
          allergies: true,
          accessibilityNeeds: true,
          needsAccommodation: true,
          needsTransport: true,
          tier: true,
          stdResponse: true,
          invitations: { select: { status: true }, take: 1 },
        },
      },
      wedding: {
        select: {
          partnerAName: true,
          partnerBName: true,
          startDate: true,
          endDate: true,
          weddingType: true,
          cities: true,
          rsvpEnabled: true,
          invitationStage: true,
        },
      },
    },
  });

  if (!household) return null;
  return {
    household,
    personal,
    resolvedToken: personal?.rsvpToken ?? household.rsvpToken,
  };
}

export default async function RsvpPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await loadInvitation(token);
  if (!invitation) notFound();
  const { household, personal, resolvedToken } = invitation;

  const invitationName = personal
    ? `${personal.firstName} ${personal.lastName}`.trim()
    : household.name;
  if (token !== publicRsvpKey(invitationName, resolvedToken)) {
    redirect(publicRsvpPath(invitationName, resolvedToken));
  }

  const { wedding } = household;
  const invitedGuests = personal
    ? household.guests
    : wedding.invitationStage === "SAVE_THE_DATE"
      ? household.guests.filter((guest) => guest.tier === "A")
      : household.guests;
  if (invitedGuests.length === 0) notFound();
  const days = daysBetween(new Date(), wedding.startDate);

  // Same photograph as the sign-in screen, if it's there.
  const photo = ["/brand/proposal.jpg", "/brand/hero-mandap.jpg"].find((file) =>
    existsSync(path.join(process.cwd(), "public", file)),
  );

  const people: RsvpPerson[] = invitedGuests.map((guest) => {
    const status = guest.invitations[0]?.status;
    return {
      guestId: guest.id,
      firstName: guest.firstName,
      name: `${guest.firstName} ${guest.lastName}`.trim(),
      dietary: guest.dietary,
      allergies: guest.allergies,
      accessibilityNeeds: guest.accessibilityNeeds,
      needsAccommodation: guest.needsAccommodation,
      needsTransport: guest.needsTransport,
      // Only a real answer counts as answered; pending is still a blank.
      coming: status === "CONFIRMED" ? "YES" : status === "DECLINED" ? "NO" : null,
    };
  });

  const contact = invitedGuests.find((g) => g.phone || g.email);

  // Whichever mailing is currently out. They ask different questions to
  // different deadlines, so they're different pages rather than one page with
  // half its fields hidden.
  if (wedding.invitationStage === "SAVE_THE_DATE") {
    const music = ["/audio/invitation.mp3", "/audio/invitation.m4a"].find((file) =>
      existsSync(path.join(process.cwd(), "public", file)),
    );

    // Contact details are per person on the save-the-date: everyone coming
    // gives us their own number, even where two of them share a room.
    const stdPeople: StdPerson[] = invitedGuests.map((guest) => ({
      guestId: guest.id,
      name: `${guest.firstName} ${guest.lastName}`.trim(),
      response: guest.stdResponse,
      phone: guest.phone ?? "",
      email: guest.email ?? "",
    }));

    return (
      <SaveTheDate
        token={resolvedToken}
        photo={photo ?? null}
        music={music ?? null}
        people={stdPeople}
        message={personal?.rsvpMessage ?? household.rsvpMessage ?? ""}
        alreadyReplied={personal ? Boolean(stdPeople[0]?.response) : household.stdRepliedAt !== null}
        rsvpBy={REPLY_BY_LABEL}
        rsvpByDays={daysBetween(new Date(), REPLY_BY)}
        partnerA={wedding.partnerAName}
        partnerB={wedding.partnerBName}
        date={formatDateRange(wedding.startDate, wedding.endDate)}
        location={wedding.cities.join(" or ") || "Bali, Indonesia"}
        days={days}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-canvas">
      <header className="relative overflow-hidden border-b border-line">
        {photo ? (
          <>
            <Image
              src={photo}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-[62%_center]"
            />
            <div aria-hidden className="absolute inset-0 bg-[#2a1c14]/35" />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-[#1a1310]/85 via-[#1a1310]/30 to-[#1a1310]/25"
            />
          </>
        ) : null}

        <div className="relative mx-auto max-w-[680px] px-5 py-14 text-center sm:py-20">
          <p
            className={`eyebrow ${photo ? "text-white/70" : ""}`}
            style={photo ? { color: "rgba(255,255,255,0.72)" } : undefined}
          >
            You are invited to the wedding of
          </p>

          <h1
            className={`mt-3 font-script text-[46px] leading-tight sm:text-[76px] ${
              photo ? "text-white" : "text-ink"
            }`}
            style={photo ? { textShadow: "0 2px 24px rgba(0,0,0,0.45)" } : undefined}
          >
            {wedding.partnerAName}
            <span className="mx-3 text-saffron-soft">&</span>
            {wedding.partnerBName}
          </h1>

          <p className={`mt-4 text-[15px] ${photo ? "text-white/85" : "text-ink-soft"}`}>
            {formatDateRange(wedding.startDate, wedding.endDate)}
            {wedding.cities.length > 0 ? (
              <>
                <span className="mx-2 opacity-50">·</span>
                {wedding.cities.join(" or ")}
              </>
            ) : null}
          </p>

          {days > 0 ? (
            <p className={`mt-1.5 text-[13px] ${photo ? "text-white/65" : "text-ink-muted"}`}>
              {days} days to go
            </p>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-[680px] px-5 py-10 sm:py-14">
        {wedding.rsvpEnabled ? (
          <>
            <div className="mb-8 text-center">
              <h2 className="font-display text-[24px] text-ink">
                Will you join us in Bali?
              </h2>
              <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink-muted">
                It would mean a great deal to have you there for the whole week.
                Let us know who can come, and we'll take care of the rest.
              </p>
            </div>

            <RsvpForm
              token={resolvedToken}
              people={people}
              phone={contact?.phone ?? ""}
              email={contact?.email ?? ""}
              message={personal?.rsvpMessage ?? household.rsvpMessage ?? ""}
              alreadyReplied={personal ? personal.rsvpSubmittedAt !== null : household.rsvpSubmittedAt !== null}
            />
          </>
        ) : (
          <p className="rounded-2xl border border-line bg-surface p-6 text-center text-[14px] text-ink-soft">
            We're not collecting replies just yet — we'll be in touch very soon.
          </p>
        )}

      </div>
    </main>
  );
}
