import { redirect } from "next/navigation";

import { computeGuestCounts, roomsRequired } from "@/domain/guests";
import { outreachByTier, outreachRows, outreachStats } from "@/domain/outreach";
import type { GuestTier, WeddingSnapshot } from "@/domain/types";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { loadSnapshot } from "@/server/snapshot";
import { GuestsWorkspace } from "./workspace";

/**
 * The same snapshot, narrowed to one wave.
 *
 * The guest list is read wave by wave — tier A is the list being worked from,
 * B and C are held back — so every figure on the page has to be the figure for
 * the wave on screen. Rather than a second set of counting rules, the snapshot
 * itself is narrowed and the existing engine run over it, which keeps one
 * definition of "coming", "awaiting" and "rooms".
 */
function sliceByTier(snapshot: WeddingSnapshot, tier: GuestTier): WeddingSnapshot {
  const guests = snapshot.guests.filter((guest) => guest.tier === tier);
  const guestIds = new Set(guests.map((guest) => guest.id));
  const householdIds = new Set(
    guests.map((guest) => guest.householdId).filter((id): id is string => Boolean(id)),
  );
  return {
    ...snapshot,
    guests,
    // A household counts towards a wave if anybody in it is on that wave.
    households: snapshot.households.filter((household) => householdIds.has(household.id)),
    invitations: snapshot.invitations.filter((i) => guestIds.has(i.guestId)),
  };
}

function tierStats(snapshot: WeddingSnapshot, tier: GuestTier) {
  const slice = sliceByTier(snapshot, tier);
  const counts = computeGuestCounts(slice);
  return {
    total: counts.total,
    households: counts.households,
    invited: counts.invited,
    confirmed: counts.confirmed,
    declined: counts.declined,
    pending: counts.pending,
    notContacted: counts.notContacted,
    needAccommodation: counts.needAccommodation,
    // The slice is already one tier, but roomsRequired defaults to A — say
    // which tier this panel is about so the B and C tabs don't read zero.
    rooms: roomsRequired(slice, tier),
    children: counts.children,
    vegetarian: counts.dietary.vegetarian,
    jain: counts.dietary.jain,
  };
}

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ rsvp?: string; event?: string; guest?: string; side?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const params = await searchParams;
  const snapshot = await loadSnapshot(viewer.weddingId);

  const householdById = new Map(snapshot.households.map((h) => [h.id, h]));
  // Who already has somewhere to sleep, so the list can flag who doesn't.
  const housedGuestIds = new Set(snapshot.stays.map((stay) => stay.guestId));

  const invitationsByGuest = new Map<string, Record<string, string>>();
  // The firmest per-event timestamp we hold for each guest, which is what an
  // invitation-stage reply is dated by.
  const invitationRepliedAt = new Map<string, number>();
  for (const invitation of snapshot.invitations) {
    const map = invitationsByGuest.get(invitation.guestId) ?? {};
    map[invitation.eventId] = invitation.status;
    invitationsByGuest.set(invitation.guestId, map);

    if (invitation.respondedAt) {
      const at = invitation.respondedAt.getTime();
      const held = invitationRepliedAt.get(invitation.guestId);
      if (held === undefined || at > held) invitationRepliedAt.set(invitation.guestId, at);
    }
  }

  const saveTheDateStage = snapshot.wedding.invitationStage === "SAVE_THE_DATE";

  /**
   * When each save-the-date answer actually arrived, from the activity log.
   *
   * The guest and household columns can't answer this on their own. A household
   * link only stamps `stdRepliedAt` once *everybody* in that house has replied,
   * so a family half-way through has answers on record and no date against
   * them; and a reply taken over the phone and typed in by hand stamps nothing
   * on the guest at all.
   *
   * The activity log has both, because both write an entry the moment the
   * answer is recorded — `std_replied`, pointing at the guest when we know who
   * answered and at the household when the family link spoke for them. It is
   * the only place the two routes meet.
   *
   * One narrow query, newest first, and the first row wins.
   */
  const replyLog = await db.activityLog.findMany({
    where: { weddingId: viewer.weddingId, action: "std_replied" },
    select: { entityType: true, entityId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const loggedGuestReply = new Map<string, number>();
  const loggedHouseholdReply = new Map<string, number>();
  for (const entry of replyLog) {
    if (!entry.entityId) continue;
    const into = entry.entityType === "guest" ? loggedGuestReply : loggedHouseholdReply;
    if (!into.has(entry.entityId)) into.set(entry.entityId, entry.createdAt.getTime());
  }

  /**
   * When somebody answered, as far as we can tell.
   *
   * There is no single column for this, because a reply arrives by one of two
   * routes. On a personal link it lands on the guest, dated exactly. On a
   * household link it lands on the household, and is only dated once everybody
   * in that household has answered — so a family half-way through replying has
   * a recorded answer and no date for it yet.
   *
   * So this returns the best date it has and says whose it is. A household's
   * date is shown against everybody in it — the household is the unit that
   * replies, and it's the only date we hold — but it's marked as the
   * household's so four identical timestamps down a family don't read as a bug.
   * Where there is no date at all, it returns null rather than inventing one,
   * and the list sorts those last: the point of ordering by this column is to
   * see who answered this morning, and a guessed date defeats that.
   */
  function repliedAt(
    guest: (typeof snapshot.guests)[number],
  ): { at: number | null; whose: "guest" | "household" } {
    const household = guest.householdId ? householdById.get(guest.householdId) : null;
    const own = guest.rsvpSubmittedAt?.getTime() ?? null;

    if (saveTheDateStage) {
      if (guest.stdResponse === null) return { at: null, whose: "guest" };

      // Dated to this person where anything knows who answered: their own
      // entry in the log, or their own reply on a personal link.
      const logged = loggedGuestReply.get(guest.id) ?? null;
      if (logged !== null) return { at: logged, whose: "guest" };
      if (own !== null) return { at: own, whose: "guest" };

      // Otherwise the family link spoke for them, and the date is the family's.
      const shared =
        (guest.householdId ? loggedHouseholdReply.get(guest.householdId) : undefined) ??
        household?.stdRepliedAt?.getTime() ??
        null;
      return { at: shared, whose: shared === null ? "guest" : "household" };
    }

    const perEvent = invitationRepliedAt.get(guest.id) ?? null;
    if (perEvent !== null) return { at: perEvent, whose: "guest" };
    if (own !== null) return { at: own, whose: "guest" };
    const shared = household?.rsvpRepliedAt?.getTime() ?? null;
    return { at: shared, whose: shared === null ? "guest" : "household" };
  }

  const guestById = new Map(snapshot.guests.map((guest) => [guest.id, guest]));

  /**
   * When a household last replied.
   *
   * The latest answer from anybody in it, not the first — the invitations list
   * is read to see who has come in since you last looked, and a family where
   * three replied in June and the fourth this morning belongs at the top of
   * that list, not back in June.
   *
   * Falls back to the household's own logged reply for the case where the
   * family link answered and nothing is recorded against the individuals.
   */
  function householdRepliedAt(people: { guestId: string }[], householdId: string): number | null {
    let latest: number | null = null;
    for (const person of people) {
      const guest = guestById.get(person.guestId);
      if (!guest) continue;
      const when = repliedAt(guest).at;
      if (when !== null && (latest === null || when > latest)) latest = when;
    }
    return latest ?? loggedHouseholdReply.get(householdId) ?? null;
  }

  return (
    <GuestsWorkspace
      canEdit={viewer.permissions.has("guests.edit")}
      currency={viewer.displayCurrency}
      guestsPerRoom={snapshot.wedding.guestsPerRoom}
      initialFilter={params.rsvp ?? null}
      initialEvent={params.event ?? null}
      initialGuest={params.guest ?? null}
      initialSide={params.side ?? null}
      events={snapshot.events.map((e) => ({
        id: e.id,
        name: e.name,
        tone: e.accentTone,
        counts: {
          invited: snapshot.invitations.filter(
            (i) => i.eventId === e.id && i.status !== "NOT_INVITED",
          ).length,
          confirmed: snapshot.invitations.filter(
            (i) => i.eventId === e.id && i.status === "CONFIRMED",
          ).length,
        },
      }))}
      guests={snapshot.guests.map((guest) => {
        const household = guest.householdId ? householdById.get(guest.householdId) : null;
        return {
          id: guest.id,
          firstName: guest.firstName,
          lastName: guest.lastName,
          side: guest.side,
          relationship: guest.relationship,
          householdId: guest.householdId,
          householdName: household?.name ?? null,
          tier: guest.tier,
          stdResponse: guest.stdResponse,
          saveTheDateSent: guest.saveTheDateSentAt !== null,
          // Dates cross to the client as plain milliseconds: the list sorts on
          // them far more often than it prints them.
          sentAt:
            guest.saveTheDateSentAt?.getTime() ??
            household?.saveTheDateSentAt?.getTime() ??
            null,
          ...(() => {
            const when = repliedAt(guest);
            return { repliedAt: when.at, repliedAtIsHousehold: when.whose === "household" };
          })(),
          city: guest.city,
          country: guest.country,
          phone: guest.phone,
          email: guest.email,
          isVIP: guest.isVIP,
          isChild: guest.isChild,
          isSenior: guest.isSenior,
          dietary: guest.dietary,
          allergies: guest.allergies,
          accessibilityNeeds: guest.accessibilityNeeds,
          needsAccommodation: guest.needsAccommodation,
          hasRoom: housedGuestIds.has(guest.id),
          needsTransport: guest.needsTransport,
          notes: guest.notes,
          tags: guest.tags,
          rsvp: invitationsByGuest.get(guest.id) ?? {},
        };
      })}
      households={snapshot.households.map((h) => ({
        id: h.id,
        name: h.name,
        invitationStatus: h.invitationStatus,
        rsvpToken: h.rsvpToken,
        side: h.side,
      }))}
      statsByTier={{
        A: tierStats(snapshot, "A"),
        B: tierStats(snapshot, "B"),
        C: tierStats(snapshot, "C"),
      }}
      invitations={outreachRows(snapshot).map((row) => ({
        householdId: row.householdId,
        rsvpToken: row.rsvpToken,
        name: row.name,
        side: row.side,
        tier: row.tier,
        headcount: row.headcount,
        people: row.people,
        peopleSaveTheDateSent: row.peopleSaveTheDateSent,
        peopleInvitationSent: row.peopleInvitationSent,
        saveTheDateSent: row.saveTheDateSent,
        invitationSent: row.invitationSent,
        reply: row.reply,
        stdReply: row.stdReply,
        stdYes: row.stdYes,
        stdNo: row.stdNo,
        stdAwaiting: row.stdAwaiting,
        message: row.message,
        sentAt: row.saveTheDateSentAt?.getTime() ?? null,
        repliedAt: householdRepliedAt(row.people, row.householdId),
      }))}
      invitationStats={outreachStats(snapshot)}
      invitationTiers={outreachByTier(snapshot)}
      invitationStage={snapshot.wedding.invitationStage}
      rsvpEnabled={snapshot.wedding.rsvpEnabled}
      singleRsvp={snapshot.wedding.singleRsvp}
    />
  );
}
