/**
 * Reconcile every reply we have ever been sent against what the app believes.
 *
 *   npm run rsvp:audit
 *
 * The premise is that the RSVP is the one part of this app where a silent
 * failure costs something that cannot be bought back. A guest replies once. If
 * the answer does not stick, nobody finds out until the couple are chasing a
 * family who already said yes, or catering for a table that is not coming.
 *
 * So this does not test the code — the test suite does that. It tests the
 * *data*, by asking the same question from three independent directions and
 * complaining when they disagree:
 *
 *   1. the reply ledger, which records every attempt on arrival
 *   2. the activity feed, which records every reply that was applied
 *   3. the guest and household rows, which are what every screen reads
 *
 * Anything in (1) or (2) that is missing from (3) is a lost reply.
 *
 * It also walks the links themselves: a link we have sent that now resolves to
 * nobody is a guest who cannot answer, and they will not tell us — they will
 * assume they did it wrong and say nothing.
 *
 * Exits non-zero when it finds something a person needs to deal with, so it can
 * be run on a schedule and trusted to stay quiet otherwise.
 */

import { PrismaClient } from "@prisma/client";

import { publicRsvpKey, rsvpCodeFromPath } from "@/lib/rsvp-links";

const db = new PrismaClient();

const problems: string[] = [];
const warnings: string[] = [];
const notes: string[] = [];

const heading = (text: string) => console.log(`\n${text}\n${"─".repeat(text.length)}`);
const bullet = (text: string) => console.log(`  ${text}`);

async function main() {
  const wedding = await db.wedding.findFirstOrThrow({
    select: {
      id: true,
      partnerAName: true,
      partnerBName: true,
      invitationStage: true,
      rsvpEnabled: true,
    },
  });

  console.log(`\nRSVP audit — ${wedding.partnerAName} & ${wedding.partnerBName}`);
  console.log(
    `Stage: ${wedding.invitationStage} · replies ${wedding.rsvpEnabled ? "open" : "CLOSED"}`,
  );
  const isSaveTheDate = wedding.invitationStage === "SAVE_THE_DATE";

  const households = await db.household.findMany({
    where: { weddingId: wedding.id, archivedAt: null },
    select: {
      id: true,
      name: true,
      rsvpToken: true,
      saveTheDateSentAt: true,
      rsvpSentAt: true,
      stdRepliedAt: true,
      rsvpReply: true,
      rsvpOpenedAt: true,
      rsvpOpenCount: true,
      guests: {
        where: { archivedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          tier: true,
          rsvpToken: true,
          stdResponse: true,
          saveTheDateSentAt: true,
          rsvpOpenedAt: true,
          invitations: { select: { status: true } },
        },
      },
    },
  });

  const guestById = new Map(
    households.flatMap((household) =>
      household.guests.map((guest) => [guest.id, { guest, household }] as const),
    ),
  );

  const answered = (guest: { stdResponse: unknown; invitations: { status: string }[] }) =>
    isSaveTheDate
      ? guest.stdResponse !== null
      : guest.invitations.some((i) => i.status === "CONFIRMED" || i.status === "DECLINED");

  // ── 1. The ledger against the rows ───────────────────────────────────────
  //
  // Every reply we accepted should be visible on the people it was about. This
  // is the check that would have caught the one we lost.
  heading("Replies received, against replies recorded");

  // This wedding's replies, plus the ones whose token matched nothing at all —
  // those have no wedding to belong to and are exactly what we want to see.
  const ours = { OR: [{ weddingId: wedding.id }, { weddingId: null }] };

  const recorded = await db.rsvpSubmission.findMany({
    where: { AND: [ours, { outcome: "RECORDED" }] },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      token: true,
      householdId: true,
      householdName: true,
      guestName: true,
      summary: true,
      payload: true,
    },
  });

  let lost = 0;
  for (const entry of recorded) {
    const people = (entry.payload as { people?: { guestId: string; coming: string }[] })?.people;
    if (!Array.isArray(people)) continue;

    const missing = people.filter(({ guestId }) => {
      const found = guestById.get(guestId);
      // The guest row is gone entirely, or it is there and has no answer on it.
      return !found || !answered(found.guest);
    });

    if (missing.length > 0) {
      lost += 1;
      problems.push(
        `LOST REPLY — ${entry.createdAt.toISOString().slice(0, 16).replace("T", " ")} ` +
          `${entry.householdName ?? entry.guestName ?? entry.token}: ` +
          `${entry.summary ?? "a reply"} — ${missing.length} of ${people.length} ` +
          `${missing.length === 1 ? "answer is" : "answers are"} not on the guest list. ` +
          `Ledger row ${entry.id}.`,
      );
    }
  }
  bullet(
    recorded.length === 0
      ? "No replies in the ledger yet."
      : `${recorded.length} replies in the ledger · ${lost === 0 ? "all present on the guest list" : `${lost} NOT reflected on the guest list`}`,
  );

  // ── 2. The activity feed against the rows ────────────────────────────────
  //
  // The feed predates the ledger, so it is the only witness to anything that
  // happened before it existed.
  heading("Older replies, from before the ledger");

  const feed = await db.activityLog.findMany({
    where: { weddingId: wedding.id, source: "RSVP" },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, entityId: true, entityLabel: true, summary: true },
  });

  const firstLedger = recorded[0]?.createdAt ?? new Date();
  let orphanedFeed = 0;
  for (const entry of feed) {
    if (entry.createdAt >= firstLedger) continue;
    const household = households.find((h) => h.id === entry.entityId);
    const person = entry.entityId ? guestById.get(entry.entityId) : undefined;

    const hasAnswer = person
      ? answered(person.guest)
      : household
        ? household.guests.some((guest) => answered(guest))
        : false;

    if (!hasAnswer) {
      orphanedFeed += 1;
      warnings.push(
        `UNCONFIRMED OLD REPLY — ${entry.createdAt.toISOString().slice(0, 16).replace("T", " ")} ` +
          `"${entry.summary}" (${entry.entityLabel || "unnamed"}) — nothing on the guest list ` +
          `shows this answer. ${household ? "The household still exists." : "The household it pointed at is gone."}`,
      );
    }
  }
  bullet(
    `${feed.length} RSVP entries in the activity feed · ${orphanedFeed === 0 ? "all accounted for" : `${orphanedFeed} with no matching answer`}`,
  );

  // ── 3. Replies we refused ────────────────────────────────────────────────
  //
  // Somebody pressed send and we said no. Every one of these is a person who
  // thinks they may have replied, and each needs a human.
  heading("Replies we turned away");

  const refused = await db.rsvpSubmission.findMany({
    where: { AND: [ours, { outcome: { not: "RECORDED" } }] },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      outcome: true,
      token: true,
      householdName: true,
      guestName: true,
      error: true,
    },
  });

  if (refused.length === 0) {
    bullet("None.");
  } else {
    const byOutcome = new Map<string, number>();
    for (const entry of refused) {
      byOutcome.set(entry.outcome, (byOutcome.get(entry.outcome) ?? 0) + 1);
    }
    for (const [outcome, count] of byOutcome) bullet(`${outcome}: ${count}`);
    for (const entry of refused.slice(0, 20)) {
      problems.push(
        `REFUSED REPLY — ${entry.createdAt.toISOString().slice(0, 16).replace("T", " ")} ` +
          `${entry.outcome} from ${entry.householdName ?? entry.guestName ?? entry.token} — ${entry.error ?? ""}`,
      );
    }
  }

  // ── 4. Links that cannot be answered ─────────────────────────────────────
  //
  // A link resolves but speaks for nobody: everyone behind it is held back to a
  // later wave, archived, or moved onto a personal link of their own.
  heading("Links with nobody to answer");

  for (const household of households) {
    const audience = household.guests.filter(
      (guest) => guest.rsvpToken === null && (!isSaveTheDate || guest.tier === "A"),
    );
    if (audience.length > 0) continue;

    const sent = isSaveTheDate ? household.saveTheDateSentAt : household.rsvpSentAt;
    const everyoneHasTheirOwn =
      household.guests.length > 0 && household.guests.every((guest) => guest.rsvpToken !== null);

    if (sent) {
      problems.push(
        `DEAD LINK ALREADY SENT — ${household.name}: the ${isSaveTheDate ? "save-the-date" : "invitation"} ` +
          `went out on ${sent.toISOString().slice(0, 10)}, but the link now speaks for nobody. ` +
          `They cannot reply.`,
      );
    } else if (!everyoneHasTheirOwn) {
      warnings.push(
        `LINK WOULD DEAD-END — ${household.name}: ${household.guests.length} ` +
          `${household.guests.length === 1 ? "person" : "people"}, none in the current wave. ` +
          `Sending this household's link today would show them a holding page.`,
      );
    }
  }
  bullet(
    problems.some((p) => p.startsWith("DEAD LINK"))
      ? "Some already-sent links cannot be answered — see below."
      : "No sent link is unanswerable.",
  );

  // ── 5. The tokens themselves ─────────────────────────────────────────────
  heading("Link integrity");

  const personalGuests = await db.guest.findMany({
    where: { weddingId: wedding.id, rsvpToken: { not: null } },
    select: { id: true, firstName: true, lastName: true, rsvpToken: true, archivedAt: true },
  });

  const prefixes = new Map<string, string[]>();
  const register = (token: string, label: string) => {
    const prefix = token.slice(0, 12).toLowerCase();
    prefixes.set(prefix, [...(prefixes.get(prefix) ?? []), label]);
  };

  for (const household of households) {
    register(household.rsvpToken, `household ${household.name}`);
    try {
      const key = publicRsvpKey(household.name, household.rsvpToken);
      if (rsvpCodeFromPath(key) !== household.rsvpToken.slice(0, 12).toLowerCase()) {
        problems.push(`UNREADABLE LINK — ${household.name}: its alias does not decode back to it.`);
      }
    } catch (cause) {
      problems.push(
        `UNLINKABLE HOUSEHOLD — ${household.name}: ${cause instanceof Error ? cause.message : cause}`,
      );
    }
  }
  for (const guest of personalGuests) {
    const name = `${guest.firstName} ${guest.lastName}`.trim();
    register(guest.rsvpToken!, `guest ${name}`);
    try {
      publicRsvpKey(name, guest.rsvpToken!);
    } catch (cause) {
      problems.push(
        `UNLINKABLE GUEST — ${name}: ${cause instanceof Error ? cause.message : cause}`,
      );
    }
    if (guest.archivedAt) {
      warnings.push(`ARCHIVED GUEST STILL HOLDS A LINK — ${name}. Their link answers for nobody.`);
    }
  }

  let collisions = 0;
  for (const [prefix, holders] of prefixes) {
    if (holders.length > 1) {
      collisions += 1;
      problems.push(
        `TOKEN PREFIX COLLISION — "${prefix}" is shared by ${holders.join(" and ")}. ` +
          `Both links open nothing. Rotate one.`,
      );
    }
  }
  bullet(
    `${prefixes.size} links · ${collisions === 0 ? "no prefix collisions" : `${collisions} COLLISIONS`}`,
  );

  // ── 6. The funnel ────────────────────────────────────────────────────────
  //
  // Sent, opened, answered. The gaps between them are different problems and
  // want different chasing.
  heading("Sent → opened → answered");

  const sentHouseholds = households.filter((h) =>
    isSaveTheDate ? h.saveTheDateSentAt : h.rsvpSentAt,
  );
  const openedNotAnswered = sentHouseholds.filter(
    (h) => h.rsvpOpenCount > 0 && !h.guests.some((guest) => answered(guest)),
  );
  const sentNeverOpened = sentHouseholds.filter((h) => h.rsvpOpenCount === 0);

  bullet(`Sent: ${sentHouseholds.length} households`);
  bullet(`Opened at least once: ${sentHouseholds.filter((h) => h.rsvpOpenCount > 0).length}`);
  bullet(
    `Answered: ${sentHouseholds.filter((h) => h.guests.some((guest) => answered(guest))).length}`,
  );

  if (sentNeverOpened.length > 0) {
    notes.push(
      `NEVER OPENED (${sentNeverOpened.length}) — sent, but the link has never been loaded. ` +
        `Check it actually reached them: ${sentNeverOpened.slice(0, 12).map((h) => h.name).join(", ")}` +
        `${sentNeverOpened.length > 12 ? ", …" : ""}`,
    );
  }
  if (openedNotAnswered.length > 0) {
    notes.push(
      `OPENED, NOT ANSWERED (${openedNotAnswered.length}) — they have seen it. If they say they ` +
        `replied, the ledger above is the place to check: ` +
        `${openedNotAnswered.slice(0, 12).map((h) => h.name).join(", ")}` +
        `${openedNotAnswered.length > 12 ? ", …" : ""}`,
    );
  }

  // ── The verdict ──────────────────────────────────────────────────────────
  if (notes.length > 0) {
    heading("Worth knowing");
    for (const note of notes) bullet(note);
  }
  if (warnings.length > 0) {
    heading(`Warnings (${warnings.length})`);
    for (const warning of warnings) bullet(`• ${warning}`);
  }
  if (problems.length > 0) {
    heading(`PROBLEMS (${problems.length})`);
    for (const problem of problems) bullet(`✗ ${problem}`);
    console.log(
      `\nThese are replies or links that need a person. Nothing here fixes itself.\n`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n✓ Every reply we have received is on the guest list, and every link we have sent can be answered.\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
