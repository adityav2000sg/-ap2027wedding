import { redirect } from "next/navigation";

import { computeGuestCounts, roomsRequired, saveTheDateCounts } from "@/domain/guests";
import { outreachByTier, outreachRows, outreachStats } from "@/domain/outreach";
import type { GuestTier, WeddingSnapshot } from "@/domain/types";
import { getViewer } from "@/server/auth";
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
    rooms: roomsRequired(slice),
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
  const invitationsByGuest = new Map<string, Record<string, string>>();
  for (const invitation of snapshot.invitations) {
    const map = invitationsByGuest.get(invitation.guestId) ?? {};
    map[invitation.eventId] = invitation.status;
    invitationsByGuest.set(invitation.guestId, map);
  }

  return (
    <GuestsWorkspace
      canEdit={viewer.permissions.has("guests.edit")}
      currency={viewer.displayCurrency}
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
      }))}
      invitationStats={outreachStats(snapshot)}
      invitationTiers={outreachByTier(snapshot)}
      invitationStage={snapshot.wedding.invitationStage}
      saveTheDate={saveTheDateCounts(snapshot)}
      rsvpEnabled={snapshot.wedding.rsvpEnabled}
      singleRsvp={snapshot.wedding.singleRsvp}
    />
  );
}
