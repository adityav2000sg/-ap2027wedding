import { redirect } from "next/navigation";

import { computeGuestCounts, roomsRequired } from "@/domain/guests";
import { getViewer } from "@/server/auth";
import { loadSnapshot } from "@/server/snapshot";
import { GuestsWorkspace } from "./workspace";

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ rsvp?: string; event?: string; guest?: string; side?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const params = await searchParams;
  const snapshot = await loadSnapshot(viewer.weddingId);
  const counts = computeGuestCounts(snapshot);

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
      stats={{
        total: counts.total,
        households: counts.households,
        invited: counts.invited,
        confirmed: counts.confirmed,
        declined: counts.declined,
        pending: counts.pending,
        notContacted: counts.notContacted,
        needAccommodation: counts.needAccommodation,
        rooms: roomsRequired(snapshot),
        children: counts.children,
        vegetarian: counts.dietary.vegetarian,
        jain: counts.dietary.jain,
      }}
      rsvpEnabled={snapshot.wedding.rsvpEnabled}
    />
  );
}
