/**
 * Guest engine.
 *
 * Produces the headcounts that drive catering, rooms, transport, favours and
 * invitations. Everything downstream of "how many people are coming?" reads
 * from here, so there is exactly one definition of each number.
 */

import type {
  GuestBasis,
  GuestNode,
  InvitationNode,
  RsvpStatus,
  WeddingSnapshot,
} from "./types";

export interface GuestCounts {
  /** People on the list, excluding archived. */
  total: number;
  households: number;
  /** Invited to at least one event. */
  invited: number;
  /** Said yes to at least one event. */
  confirmed: number;
  /** Said no to everything they were invited to. */
  declined: number;
  /** Invited, hasn't answered. */
  pending: number;
  /** On the list but not yet invited to anything. */
  notContacted: number;
  vip: number;
  children: number;
  seniors: number;
  needAccommodation: number;
  needTransport: number;
  /** Households that have submitted their RSVP. */
  householdsResponded: number;
  dietary: {
    vegetarian: number;
    nonVegetarian: number;
    jain: number;
    vegan: number;
    notSpecified: number;
  };
  withAllergies: number;
  withAccessibilityNeeds: number;
}

export interface EventGuestCounts {
  eventId: string;
  invited: number;
  confirmed: number;
  declined: number;
  pending: number;
  tentative: number;
  /** Confirmed + tentative + pending — the number caterers need a floor for. */
  expected: number;
  households: number;
  children: number;
  vegetarian: number;
  jain: number;
  vegan: number;
}

const ACTIVE_STATUSES: RsvpStatus[] = ["PENDING", "CONFIRMED", "DECLINED", "TENTATIVE"];

export function computeGuestCounts(snapshot: WeddingSnapshot): GuestCounts {
  const { guests, households, invitations } = snapshot;
  const byGuest = groupInvitations(invitations);

  const counts: GuestCounts = {
    total: guests.length,
    households: households.length,
    invited: 0,
    confirmed: 0,
    declined: 0,
    pending: 0,
    notContacted: 0,
    vip: 0,
    children: 0,
    seniors: 0,
    needAccommodation: 0,
    needTransport: 0,
    householdsResponded: households.filter((h) => h.rsvpSubmittedAt).length,
    dietary: { vegetarian: 0, nonVegetarian: 0, jain: 0, vegan: 0, notSpecified: 0 },
    withAllergies: 0,
    withAccessibilityNeeds: 0,
  };

  for (const guest of guests) {
    const invites = (byGuest.get(guest.id) ?? []).filter((i) =>
      ACTIVE_STATUSES.includes(i.status),
    );

    if (invites.length === 0) {
      counts.notContacted += 1;
    } else {
      counts.invited += 1;
      if (invites.some((i) => i.status === "CONFIRMED")) counts.confirmed += 1;
      else if (invites.every((i) => i.status === "DECLINED")) counts.declined += 1;
      else counts.pending += 1;
    }

    if (guest.isVIP) counts.vip += 1;
    if (guest.isChild) counts.children += 1;
    if (guest.isSenior) counts.seniors += 1;
    if (guest.needsAccommodation) counts.needAccommodation += 1;
    if (guest.needsTransport) counts.needTransport += 1;
    if (guest.allergies) counts.withAllergies += 1;
    if (guest.accessibilityNeeds) counts.withAccessibilityNeeds += 1;

    switch (guest.dietary) {
      case "VEGETARIAN": counts.dietary.vegetarian += 1; break;
      case "NON_VEGETARIAN": counts.dietary.nonVegetarian += 1; break;
      case "JAIN": counts.dietary.jain += 1; break;
      case "VEGAN": counts.dietary.vegan += 1; break;
      default: counts.dietary.notSpecified += 1;
    }
  }

  return counts;
}

export function computeEventGuestCounts(
  snapshot: WeddingSnapshot,
  eventId: string,
): EventGuestCounts {
  const guestById = new Map(snapshot.guests.map((g) => [g.id, g]));
  const result: EventGuestCounts = {
    eventId,
    invited: 0,
    confirmed: 0,
    declined: 0,
    pending: 0,
    tentative: 0,
    expected: 0,
    households: 0,
    children: 0,
    vegetarian: 0,
    jain: 0,
    vegan: 0,
  };
  const householdIds = new Set<string>();

  for (const invitation of snapshot.invitations) {
    if (invitation.eventId !== eventId) continue;
    if (invitation.status === "NOT_INVITED") continue;
    const guest = guestById.get(invitation.guestId);
    if (!guest) continue;

    result.invited += 1;
    if (guest.householdId) householdIds.add(guest.householdId);

    switch (invitation.status) {
      case "CONFIRMED": result.confirmed += 1; break;
      case "DECLINED": result.declined += 1; break;
      case "TENTATIVE": result.tentative += 1; break;
      default: result.pending += 1;
    }

    if (invitation.status !== "DECLINED") {
      if (guest.isChild) result.children += 1;
      if (guest.dietary === "VEGETARIAN") result.vegetarian += 1;
      if (guest.dietary === "JAIN") result.jain += 1;
      if (guest.dietary === "VEGAN") result.vegan += 1;
    }
  }

  result.households = householdIds.size;
  result.expected = result.confirmed + result.tentative + result.pending;
  return result;
}

export function computeAllEventGuestCounts(
  snapshot: WeddingSnapshot,
): Map<string, EventGuestCounts> {
  return new Map(
    snapshot.events.map((event) => [event.id, computeEventGuestCounts(snapshot, event.id)]),
  );
}

/**
 * The headcount a budget item should multiply by.
 *
 * Event-scoped items use that event's population; wedding-wide items use the
 * whole list. `ESTIMATED` falls back to the planning assumption, which is what
 * keeps forecasts sane before any RSVPs have landed.
 */
export function headcountFor(
  snapshot: WeddingSnapshot,
  basis: GuestBasis,
  eventId: string | null,
  eventCounts?: Map<string, EventGuestCounts>,
  weddingCounts?: GuestCounts,
): number {
  if (eventId) {
    const counts =
      eventCounts?.get(eventId) ?? computeEventGuestCounts(snapshot, eventId);
    const event = snapshot.events.find((e) => e.id === eventId);
    switch (basis) {
      case "ESTIMATED":
        return event?.estimatedGuests || snapshot.wedding.estimatedGuests;
      case "INVITED":
        return counts.invited;
      case "CONFIRMED":
        return counts.confirmed;
      case "CONFIRMED_PLUS_PENDING":
      default:
        // Before RSVPs arrive this would read zero, which would make the whole
        // budget look free. Fall back to the event's planning estimate.
        return counts.expected || event?.estimatedGuests || snapshot.wedding.estimatedGuests;
    }
  }

  const counts = weddingCounts ?? computeGuestCounts(snapshot);
  switch (basis) {
    case "ESTIMATED":
      return snapshot.wedding.estimatedGuests;
    case "INVITED":
      return counts.invited;
    case "CONFIRMED":
      return counts.confirmed;
    case "CONFIRMED_PLUS_PENDING":
    default:
      return counts.confirmed + counts.pending || snapshot.wedding.estimatedGuests;
  }
}

export function householdCountFor(
  snapshot: WeddingSnapshot,
  eventId: string | null,
  eventCounts?: Map<string, EventGuestCounts>,
): number {
  if (eventId) {
    const counts =
      eventCounts?.get(eventId) ?? computeEventGuestCounts(snapshot, eventId);
    return counts.households || snapshot.households.length;
  }
  return snapshot.households.length;
}

/** Rooms implied by the guests who told us they need a bed. */
export function roomsRequired(snapshot: WeddingSnapshot): number {
  const perRoom = Math.max(1, snapshot.wedding.guestsPerRoom);
  const needing = snapshot.guests.filter((g) => g.needsAccommodation).length;
  return Math.ceil(needing / perRoom);
}

export function roomsContracted(snapshot: WeddingSnapshot): number {
  return snapshot.hotels.reduce((sum, hotel) => sum + hotel.contractedRooms, 0);
}

export function transportSeatsAllocated(snapshot: WeddingSnapshot): number {
  const vehicleById = new Map(snapshot.vehicles.map((v) => [v.id, v]));
  // A vehicle used across several journeys still only seats `capacity` people
  // at once, but each journey is a separate movement — so seats are counted
  // per journey, which is what "do we have enough runs?" actually means.
  return snapshot.journeys.reduce((sum, journey) => {
    const vehicle = journey.vehicleId ? vehicleById.get(journey.vehicleId) : null;
    return sum + (vehicle?.capacity ?? 0);
  }, 0);
}

export function guestsNeedingPickup(snapshot: WeddingSnapshot): number {
  return snapshot.travel.filter((t) => t.direction === "ARRIVAL" && t.pickupRequired).length;
}

export function guestDisplayName(guest: Pick<GuestNode, "firstName" | "lastName">): string {
  return `${guest.firstName} ${guest.lastName}`.trim();
}

function groupInvitations(invitations: InvitationNode[]): Map<string, InvitationNode[]> {
  const map = new Map<string, InvitationNode[]>();
  for (const invitation of invitations) {
    const list = map.get(invitation.guestId);
    if (list) list.push(invitation);
    else map.set(invitation.guestId, [invitation]);
  }
  return map;
}

/** RSVP completion, used for the "50% RSVP" milestone and progress bars. */
export function rsvpProgress(snapshot: WeddingSnapshot): {
  responded: number;
  awaiting: number;
  total: number;
  percent: number;
} {
  const counts = computeGuestCounts(snapshot);
  const total = counts.invited;
  const responded = counts.confirmed + counts.declined;
  return {
    responded,
    awaiting: counts.pending,
    total,
    percent: total === 0 ? 0 : Math.round((responded / total) * 100),
  };
}
