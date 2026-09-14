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

import { REPLY_BY, REPLY_BY_LABEL, repliesHaveClosed } from "@/config/rsvp";
import { formatDateRange, daysBetween } from "@/lib/dates";
import { publicRsvpKey, publicRsvpPath } from "@/lib/rsvp-links";
import { db } from "@/server/db";
import { noteRsvpOpened } from "@/server/rsvp-ledger";
import { resolveRsvpLink, rsvpAudience } from "@/server/rsvp-link";
import { RsvpForm, type RsvpPerson } from "./rsvp-form";
import { SaveTheDate, type StdPerson } from "./save-the-date";

// The reply must reflect what was just submitted, never a cached copy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // A wedding invitation has no business in a search index.
  robots: { index: false, follow: false },
};

async function loadInvitation(token: string) {
  // One resolver, shared with the action that records the reply. The page and
  // the server must never disagree about whose link this is.
  const link = await resolveRsvpLink(token);
  if (!link) return null;

  const household = await db.household.findUnique({
    where: { id: link.householdId },
    select: {
      id: true,
      name: true,
      rsvpToken: true,
      rsvpMessage: true,
      rsvpSubmittedAt: true,
      stdRepliedAt: true,
      guests: {
        // Every live member, with the audience decided afterwards by the same
        // function the reply is checked against. Filtering here as well was
        // how the two came to disagree.
        where: { archivedAt: null },
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
          rsvpToken: true,
          rsvpMessage: true,
          rsvpSubmittedAt: true,
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

  const personal = link.personalGuestId
    ? (household.guests.find((guest) => guest.id === link.personalGuestId) ?? null)
    : null;

  // The people this link may answer for — the same call the submission makes.
  const audience = rsvpAudience({
    stage: household.wedding.invitationStage,
    personalGuestId: link.personalGuestId,
    guests: household.guests,
  });

  return {
    household,
    personal,
    audience: household.guests.filter((guest) => audience.has(guest.id)),
    resolvedToken: link.resolvedToken,
    link,
  };
}

export default async function RsvpPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await loadInvitation(token);
  // A token that matches nothing is the only thing that may 404 here. Anything
  // past this line is a link we really sent, and a link we really sent must
  // never show a stranger's error page.
  if (!invitation) notFound();
  const { household, personal, resolvedToken, audience, link } = invitation;

  const invitationName = personal
    ? `${personal.firstName} ${personal.lastName}`.trim()
    : household.name;
  if (token !== publicRsvpKey(invitationName, resolvedToken)) {
    redirect(publicRsvpPath(invitationName, resolvedToken));
  }

  // From here the link is genuine and on its canonical address, so this is the
  // moment it counts as opened. Best-effort and unawaited-on-failure: the
  // funnel is worth having, never at the cost of the invitation rendering.
  await noteRsvpOpened(link);

  const { wedding } = household;
  const invitedGuests = audience;
  const days = daysBetween(new Date(), wedding.startDate);

  // A real link with nobody to ask. It happens: a family held back to a later
  // wave, or a household whose members have all been given personal links.
  // They opened something we sent them, so they get an invitation and a way to
  // reach us — never the not-found page, which reads as "you were a mistake".
  if (invitedGuests.length === 0) {
    return (
      <Holding
        partnerA={wedding.partnerAName}
        partnerB={wedding.partnerBName}
        date={formatDateRange(wedding.startDate, wedding.endDate)}
        location={wedding.cities.join(" or ") || "Bali, Indonesia"}
        days={days}
      />
    );
  }

  // Same photograph as the sign-in screen, if it's there.
  const photo = ["/brand/proposal.jpg", "/brand/hero-mandap.jpg"].find((file) =>
    existsSync(path.join(process.cwd(), "public", file)),
  );

  // The date on the invitation has passed.
  //
  // Shown here and enforced in `submitRsvp`, from the same constant, so the
  // form never stays up past the moment the server would refuse it. Whatever
  // they told us is repeated back — somebody who replied in September opening
  // this in November should be reassured, not left wondering.
  if (repliesHaveClosed()) {
    const answers = invitedGuests.map((guest) => {
      const status = guest.invitations[0]?.status;
      const answer =
        wedding.invitationStage === "SAVE_THE_DATE"
          ? guest.stdResponse
          : status === "CONFIRMED"
            ? "YES"
            : status === "DECLINED"
              ? "NO"
              : null;
      return { name: `${guest.firstName} ${guest.lastName}`.trim(), answer };
    });

    return (
      <RepliesClosed
        photo={photo ?? null}
        answers={answers}
        partnerA={wedding.partnerAName}
        partnerB={wedding.partnerBName}
        date={formatDateRange(wedding.startDate, wedding.endDate)}
        location={wedding.cities.join(" or ") || "Bali, Indonesia"}
        days={days}
        closedOn={REPLY_BY_LABEL}
      />
    );
  }

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
              contactGuestId={contact?.id ?? null}
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

/**
 * A real invitation with nothing to ask yet.
 *
 * Reached by a link we genuinely sent whose audience is currently empty — a
 * household held back to a later wave, or one where everybody replies on their
 * own personal link. The old behaviour here was `notFound()`, which told a
 * guest holding a link from the couple that they did not exist.
 *
 * It says the true thing instead: we know who you are, there is nothing to
 * answer at this moment, and we will be in touch.
 */
function Holding({
  partnerA,
  partnerB,
  date,
  location,
  days,
}: {
  partnerA: string;
  partnerB: string;
  date: string;
  location: string;
  days: number;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-5 py-16">
      <div className="w-full max-w-[520px] text-center">
        <p className="eyebrow">The wedding of</p>
        <h1 className="mt-3 font-script text-[46px] leading-tight text-ink sm:text-[64px]">
          {partnerA}
          <span className="mx-3 text-saffron-soft">&</span>
          {partnerB}
        </h1>
        <p className="mt-4 text-[15px] text-ink-soft">
          {date}
          <span className="mx-2 opacity-50">·</span>
          {location}
        </p>
        {days > 0 ? (
          <p className="mt-1.5 text-[13px] text-ink-muted">{days} days to go</p>
        ) : null}

        <p className="mx-auto mt-8 max-w-sm rounded-2xl border border-line bg-surface p-6 text-[14px] leading-relaxed text-ink-soft">
          Your link works — there's simply nothing for you to answer just yet.
          We'll be in touch with the details very soon. If you were expecting a
          form here, do message us and we'll sort it out straight away.
        </p>
      </div>
    </main>
  );
}

/**
 * The list has closed.
 *
 * Shown once the date on the invitation has passed, in place of the form, and
 * refused by the server at the same instant so the two can never disagree.
 *
 * The tone is the point. A guest who is late is almost always a guest who has
 * been busy, ill, or travelling, and they are about to feel caught out — so the
 * page does not scold, does not say "expired", and does not present a dead end.
 * It says the numbers have gone to the hotel, repeats back whatever they told
 * us so nobody is left guessing, and asks them to message Avantika and Prateek,
 * who can and will still say yes.
 */
function RepliesClosed({
  photo,
  answers,
  partnerA,
  partnerB,
  date,
  location,
  days,
  closedOn,
}: {
  photo: string | null;
  answers: { name: string; answer: "YES" | "NO" | null }[];
  partnerA: string;
  partnerB: string;
  date: string;
  location: string;
  days: number;
  closedOn: string;
}) {
  const replied = answers.filter((person) => person.answer !== null);
  const coming = answers.filter((person) => person.answer === "YES");
  const everyoneAnswered = replied.length === answers.length && answers.length > 0;

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
            The wedding of
          </p>

          <h1
            className={`mt-3 font-script text-[46px] leading-tight sm:text-[76px] ${
              photo ? "text-white" : "text-ink"
            }`}
            style={photo ? { textShadow: "0 2px 24px rgba(0,0,0,0.45)" } : undefined}
          >
            {partnerA}
            <span className="mx-3 text-saffron-soft">&</span>
            {partnerB}
          </h1>

          <p className={`mt-4 text-[15px] ${photo ? "text-white/85" : "text-ink-soft"}`}>
            {date}
            <span className="mx-2 opacity-50">·</span>
            {location}
          </p>

          {days > 0 ? (
            <p className={`mt-1.5 text-[13px] ${photo ? "text-white/65" : "text-ink-muted"}`}>
              {days} days to go
            </p>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-[680px] px-5 py-10 sm:py-14">
        <div className="rounded-2xl border border-line bg-surface p-7 text-center shadow-raised">
          <p className="eyebrow">Replies closed on {closedOn}</p>

          <h2 className="mt-3 font-display text-[24px] text-ink">
            {everyoneAnswered ? "We have your reply" : "The list has gone to Bali"}
          </h2>

          <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-ink-soft">
            {everyoneAnswered
              ? "Thank you — the final numbers are with the hotel, and everything you need for the week will follow nearer the time."
              : "We've sent the final numbers to the hotel, so the form has closed. If you haven't had a chance to reply, or something has changed, do message Avantika and Prateek directly — we would far rather hear from you late than not at all."}
          </p>

          {replied.length > 0 ? (
            <div className="mx-auto mt-6 max-w-sm rounded-xl border border-line bg-surface-soft px-4 py-3 text-left">
              <p className="eyebrow mb-2">What we have</p>
              <ul className="space-y-1">
                {answers.map((person) => (
                  <li
                    key={person.name}
                    className="flex items-center justify-between gap-3 text-[13.5px]"
                  >
                    <span className="text-ink-soft">{person.name}</span>
                    <span
                      className={
                        person.answer === "YES"
                          ? "text-positive"
                          : person.answer === "NO"
                            ? "text-ink-muted"
                            : "text-ink-faint"
                      }
                    >
                      {person.answer === "YES"
                        ? "Coming"
                        : person.answer === "NO"
                          ? "Can't make it"
                          : "No reply"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {coming.length > 0 ? (
            <p className="mt-6 font-script text-[26px] text-ink">
              We can’t wait to see you there
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
