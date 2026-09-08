import "server-only";

/**
 * Getting the lists out of the app.
 *
 * Two shapes people actually need: the guest list, which gets forwarded to a
 * caterer and a hotel, and the logistics list, which gets printed and carried
 * around by whoever is meeting people at the airport.
 *
 * Built as plain row data first, so the same tables feed the spreadsheet, the
 * print view and anything added later — the columns are decided once.
 *
 * Money is converted to the viewer's currency here rather than exported raw:
 * a spreadsheet handed to a third party with three currencies mixed silently
 * into one column is worse than useless.
 */

import { outreachRows } from "@/domain/outreach";
import { formatMediumDate } from "@/lib/dates";
import type { WeddingSnapshot } from "@/domain/types";

export interface Table {
  name: string;
  columns: { key: string; label: string; width?: number }[];
  rows: Record<string, string | number | null>[];
}

const DIET_LABEL: Record<string, string> = {
  VEGETARIAN: "Vegetarian",
  NON_VEGETARIAN: "Non-vegetarian",
  JAIN: "Jain",
  VEGAN: "Vegan",
  NOT_SPECIFIED: "",
};

const SIDE_LABEL: Record<string, string> = {
  BRIDE: "Bride's",
  GROOM: "Groom's",
  BOTH: "Both",
};

const REPLY_LABEL: Record<string, string> = {
  YES: "Coming",
  NO: "Not coming",
  AWAITING: "Awaiting",
};

/** One row per guest — the version you'd send a caterer. */
export function guestTable(snapshot: WeddingSnapshot): Table {
  const householdById = new Map(snapshot.households.map((h) => [h.id, h]));

  // The single answer, read the same way the guest list reads it.
  const statusByGuest = new Map<string, string>();
  for (const invitation of snapshot.invitations) {
    const current = statusByGuest.get(invitation.guestId);
    const rank = ["CONFIRMED", "TENTATIVE", "DECLINED", "PENDING", "NOT_INVITED"];
    if (!current || rank.indexOf(invitation.status) < rank.indexOf(current)) {
      statusByGuest.set(invitation.guestId, invitation.status);
    }
  }

  const rows = snapshot.guests
    .map((guest) => {
      const household = guest.householdId ? householdById.get(guest.householdId) : null;
      const status = statusByGuest.get(guest.id) ?? "NOT_INVITED";
      return {
        name: `${guest.firstName} ${guest.lastName}`.trim(),
        household: household?.name ?? "",
        tier: household?.tier ?? "",
        side: SIDE_LABEL[guest.side] ?? guest.side,
        relationship: guest.relationship ?? "",
        coming:
          status === "CONFIRMED" ? "Coming"
          : status === "DECLINED" ? "Not coming"
          : status === "TENTATIVE" ? "Maybe"
          : status === "PENDING" ? "Awaiting"
          : "Not invited",
        saveTheDate: guest.saveTheDateSentAt ? "Sent" : "",
        invitation: guest.invitationSentAt ? "Sent" : "",
        phone: guest.phone ?? "",
        email: guest.email ?? "",
        city: guest.city ?? "",
        country: guest.country ?? "",
        dietary: DIET_LABEL[guest.dietary] ?? "",
        allergies: guest.allergies ?? "",
        access: guest.accessibilityNeeds ?? "",
        room: guest.needsAccommodation ? "Yes" : "",
        transport: guest.needsTransport ? "Yes" : "",
        notes: guest.notes ?? "",
      };
    })
    .sort(
      (a, b) =>
        a.household.localeCompare(b.household) || a.name.localeCompare(b.name),
    );

  return {
    name: "Guest list",
    columns: [
      { key: "name", label: "Name", width: 24 },
      { key: "household", label: "Household", width: 22 },
      { key: "tier", label: "Tier", width: 6 },
      { key: "side", label: "Side", width: 9 },
      { key: "relationship", label: "Relationship", width: 18 },
      { key: "coming", label: "Coming?", width: 12 },
      { key: "saveTheDate", label: "Save the date", width: 13 },
      { key: "invitation", label: "Invitation", width: 11 },
      { key: "phone", label: "Phone", width: 18 },
      { key: "email", label: "Email", width: 28 },
      { key: "city", label: "City", width: 16 },
      { key: "country", label: "Country", width: 14 },
      { key: "dietary", label: "Dietary", width: 15 },
      { key: "allergies", label: "Allergies", width: 20 },
      { key: "access", label: "Accessibility", width: 22 },
      { key: "room", label: "Needs a room", width: 13 },
      { key: "transport", label: "Needs transport", width: 15 },
      { key: "notes", label: "Notes", width: 30 },
    ],
    rows,
  };
}

/** Households, for anyone chasing invitations rather than head counts. */
export function householdTable(snapshot: WeddingSnapshot): Table {
  const rows = outreachRows(snapshot).map((row) => ({
    household: row.name,
    tier: row.tier,
    side: SIDE_LABEL[row.side] ?? row.side,
    people: row.headcount,
    saveTheDate: row.saveTheDateSent ? "Sent" : "",
    invitation: row.invitationSent ? "Sent" : "",
    reply: REPLY_LABEL[row.reply] ?? row.reply,
    messaged: `${row.peopleSaveTheDateSent}/${row.headcount}`,
    members: row.people.map((p) => p.name).join(", "),
  }));

  return {
    name: "Households",
    columns: [
      { key: "household", label: "Household", width: 24 },
      { key: "tier", label: "Tier", width: 6 },
      { key: "side", label: "Side", width: 9 },
      { key: "people", label: "People", width: 8 },
      { key: "saveTheDate", label: "Save the date", width: 13 },
      { key: "invitation", label: "Invitation", width: 11 },
      { key: "reply", label: "Reply", width: 12 },
      { key: "messaged", label: "Personally messaged", width: 18 },
      { key: "members", label: "Who's in it", width: 44 },
    ],
    rows,
  };
}

/** Who is sleeping where. The list somebody prints and carries. */
export function roomTable(snapshot: WeddingSnapshot): Table {
  const guestById = new Map(snapshot.guests.map((g) => [g.id, g]));
  const hotelById = new Map(snapshot.hotels.map((h) => [h.id, h]));
  const householdById = new Map(snapshot.households.map((h) => [h.id, h]));

  const byRoom = new Map<string, typeof snapshot.stays>();
  for (const stay of snapshot.stays) {
    const key = stay.roomNumber ?? "Unassigned";
    byRoom.set(key, [...(byRoom.get(key) ?? []), stay]);
  }

  const rows = [...byRoom.entries()]
    .map(([roomNumber, stays]) => {
      const occupants = stays
        .map((s) => guestById.get(s.guestId))
        .filter((g): g is NonNullable<typeof g> => Boolean(g));
      const first = stays[0];
      const households = new Set(
        occupants.map((g) =>
          g.householdId ? householdById.get(g.householdId)?.name ?? "" : "",
        ),
      );

      return {
        room: roomNumber,
        hotel: hotelById.get(first.hotelId)?.name ?? "",
        occupants: occupants.length,
        guests: occupants
          .map((g) => `${g.firstName} ${g.lastName}`.trim())
          .sort((a, b) => a.localeCompare(b))
          .join(", "),
        household: [...households].filter(Boolean).join(" / "),
        checkIn: formatMediumDate(new Date(first.checkIn)),
        checkOut: formatMediumDate(new Date(first.checkOut)),
        needs: occupants.some((g) => g.accessibilityNeeds)
          ? occupants.map((g) => g.accessibilityNeeds).filter(Boolean).join("; ")
          : "",
      };
    })
    .sort((a, b) => {
      // Numeric room order, with anything unassigned last.
      const an = Number(a.room);
      const bn = Number(b.room);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      if (Number.isFinite(an)) return -1;
      if (Number.isFinite(bn)) return 1;
      return a.room.localeCompare(b.room);
    });

  return {
    name: "Rooms",
    columns: [
      { key: "room", label: "Room", width: 8 },
      { key: "hotel", label: "Hotel", width: 22 },
      { key: "occupants", label: "People", width: 8 },
      { key: "guests", label: "Who's in it", width: 40 },
      { key: "household", label: "Household", width: 24 },
      { key: "checkIn", label: "Check in", width: 14 },
      { key: "checkOut", label: "Check out", width: 14 },
      { key: "needs", label: "Accessibility", width: 26 },
    ],
    rows,
  };
}

/** Flights and pickups. */
export function travelTable(snapshot: WeddingSnapshot): Table {
  const guestById = new Map(snapshot.guests.map((g) => [g.id, g]));

  const rows = snapshot.travel
    .map((record) => {
      const guest = guestById.get(record.guestId);
      const at = new Date(record.scheduledAt);
      return {
        guest: guest ? `${guest.firstName} ${guest.lastName}`.trim() : "",
        direction: record.direction === "ARRIVAL" ? "Arriving" : "Leaving",
        date: formatMediumDate(at),
        time: at.toISOString().slice(11, 16),
        mode: record.mode.replace(/_/g, " ").toLowerCase(),
        reference: [record.carrier, record.serviceNumber].filter(Boolean).join(" "),
        hub: record.hub ?? "",
        pickup: record.pickupRequired ? "Yes" : "",
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.guest.localeCompare(b.guest));

  return {
    name: "Travel",
    columns: [
      { key: "guest", label: "Guest", width: 24 },
      { key: "direction", label: "Direction", width: 11 },
      { key: "date", label: "Date", width: 14 },
      { key: "time", label: "Time", width: 8 },
      { key: "mode", label: "Mode", width: 12 },
      { key: "reference", label: "Flight / reference", width: 18 },
      { key: "hub", label: "Airport / station", width: 20 },
      { key: "pickup", label: "Needs collecting", width: 15 },
    ],
    rows,
  };
}

/** What each export contains. */
export function tablesFor(kind: "guests" | "logistics", snapshot: WeddingSnapshot): Table[] {
  return kind === "guests"
    ? [guestTable(snapshot), householdTable(snapshot)]
    : [roomTable(snapshot), travelTable(snapshot)];
}
