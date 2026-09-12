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
export interface SaveTheDateCounts {
  /** People asked — the current wave, not the whole list. */
  asked: number;
  /** People the save-the-date has actually been sent to. */
  sent: number;
  yes: number;
  no: number;
  awaiting: number;
}

/**
 * Answers to the save-the-date.
 *
 * Kept apart from `computeGuestCounts` on purpose: a save-the-date is an
 * intention a year out, not a seat at a table, and it never touches the
 * per-event invitations. Until the invitation proper goes out, this is the
 * only reply anybody has actually given — so it is what the guest list should
 * be showing, rather than a column of "awaiting" that can't move yet.
 */
export function saveTheDateCounts(
  snapshot: WeddingSnapshot,
  tier: GuestNode["tier"] = "A",
): SaveTheDateCounts {
  const asked = snapshot.guests.filter((guest) => guest.tier === tier);
  const yes = asked.filter((guest) => guest.stdResponse === "YES").length;
  const no = asked.filter((guest) => guest.stdResponse === "NO").length;
  return {
    asked: asked.length,
    sent: asked.filter((guest) => guest.saveTheDateSentAt !== null).length,
    yes,
    no,
    awaiting: asked.length - yes - no,
  };
}

/**
 * Whether somebody's bed is settled or needs to be given away.
 *
 * A room allocation made before anybody replied is a guess, and the replies
 * are what turn it into a plan. Once a guest has said they're coming, the room
 * they're in is theirs — confirmed. Once they've said they're not, the bed is
 * still allocated to them and nobody has noticed: that is the one case worth
 * putting in front of a human, because it's a room being paid for and held for
 * an empty bed, and it's the room somebody on the B list could have.
 *
 * "Reallocate" is deliberately a prompt and not an action. Taking a declined
 * guest out of their room automatically would be wrong twice over — plans
 * change, and the couple may want to keep a family together in a room even
 * when one of them drops out.
 */
export type RoomStanding = "CONFIRMED" | "REALLOCATE" | "AWAITING";

/**
 * Everyone's standing, in one pass.
 *
 * The per-event invitation outranks the save-the-date, because it is the later
 * and firmer question: somebody can wave yes at a save-the-date a year out and
 * decline the wedding itself, and it's the second answer that decides whether
 * a bed is needed. A tentative counts as coming — you hold the room for a
 * maybe.
 *
 * Until the invitations proper go out, nobody has any event answers at all, so
 * in practice this reads the save-the-date, which is exactly the signal the
 * couple are working from today.
 */
export function attendanceStandings(snapshot: WeddingSnapshot): Map<string, RoomStanding> {
  const byGuest = groupInvitations(snapshot.invitations);
  const standings = new Map<string, RoomStanding>();

  for (const guest of snapshot.guests) {
    const asked = (byGuest.get(guest.id) ?? []).filter(
      (invitation) => invitation.status !== "NOT_INVITED",
    );
    const answered = asked.filter((invitation) => invitation.status !== "PENDING");

    if (answered.some((i) => i.status === "CONFIRMED" || i.status === "TENTATIVE")) {
      standings.set(guest.id, "CONFIRMED");
    } else if (answered.length > 0 && answered.length === asked.length) {
      // Every function they were asked to, answered, and no to all of it. One
      // no among functions they haven't finished answering isn't enough: they
      // may still be coming for the rest of the week, and still need the bed.
      standings.set(guest.id, "REALLOCATE");
    } else if (guest.stdResponse === "YES") {
      standings.set(guest.id, "CONFIRMED");
    } else if (guest.stdResponse === "NO") {
      standings.set(guest.id, "REALLOCATE");
    } else {
      standings.set(guest.id, "AWAITING");
    }
  }

  return standings;
}

/**
 * The people a room is actually held for.
 *
 * Tier B and C have not been invited, so no room is being kept for them.
 * Counting them turns every room figure into a shortfall — "46 people still
 * need a bed" when 34 of them are on a list that may never be sent — and a
 * number that is alarming and wrong is worse than no number at all, because
 * it teaches you to ignore the one place a real gap would show up.
 *
 * Nothing is stored. This is read off the tier every time, so moving somebody
 * from B to A puts them into these counts immediately, and moving them back
 * takes them out again — there is no separate list to keep in step.
 */
export function guestsNeedingARoom(
  snapshot: WeddingSnapshot,
  tier: GuestNode["tier"] = "A",
): GuestNode[] {
  return snapshot.guests.filter((guest) => guest.tier === tier && guest.needsAccommodation);
}

/** Of those, the ones with nowhere to sleep yet. */
export function guestsWithoutARoom(
  snapshot: WeddingSnapshot,
  tier: GuestNode["tier"] = "A",
): GuestNode[] {
  const housed = new Set(snapshot.stays.map((stay) => stay.guestId));
  return guestsNeedingARoom(snapshot, tier).filter((guest) => !housed.has(guest.id));
}

export function roomsRequired(
  snapshot: WeddingSnapshot,
  tier: GuestNode["tier"] = "A",
): number {
  const perRoom = Math.max(1, snapshot.wedding.guestsPerRoom);
  return Math.ceil(guestsNeedingARoom(snapshot, tier).length / perRoom);
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

export interface RoomShare {
  roomNumber: string;
  occupants: number;
  /** Distinct households sleeping in this room. */
  households: number;
  names: string[];
  overCapacity: boolean;
  mixedHouseholds: boolean;
}

/**
 * Rooms that need a human to look at them.
 *
 * Two things go wrong when a room list is built from a spreadsheet: more people
 * are put in a room than it sleeps, and people from different families end up
 * sharing. Neither is automatically an error — friends travelling alone are
 * routinely paired up, and a family of three in a triple is fine — so this
 * reports rather than corrects, and separates the two reasons so the obvious
 * ones can be dismissed at a glance.
 *
 * What it caught on the real list: a room holding two Sawhney teenagers and an
 * older Chowdhry couple, which is both at once.
 */
export function roomsNeedingReview(snapshot: WeddingSnapshot): RoomShare[] {
  const capacity = Math.max(1, snapshot.wedding.guestsPerRoom);
  const guestById = new Map(snapshot.guests.map((g) => [g.id, g]));
  const byRoom = new Map<string, { names: string[]; households: Set<string> }>();

  for (const stay of snapshot.stays) {
    if (!stay.roomNumber) continue;
    const guest = guestById.get(stay.guestId);
    if (!guest) continue;

    const room = byRoom.get(stay.roomNumber) ?? { names: [], households: new Set() };
    room.names.push(`${guest.firstName} ${guest.lastName}`.trim());
    // Someone with no household counts as their own, so a lone guest sharing
    // with a family still reads as mixed.
    room.households.add(guest.householdId ?? `solo:${guest.id}`);
    byRoom.set(stay.roomNumber, room);
  }

  return [...byRoom.entries()]
    .map(([roomNumber, room]) => ({
      roomNumber,
      occupants: room.names.length,
      households: room.households.size,
      names: room.names.sort((a, b) => a.localeCompare(b)),
      overCapacity: room.names.length > capacity,
      // Two singles sharing is normal and deliberate. A whole family plus
      // somebody else is what's worth a second look.
      mixedHouseholds: room.households.size > 1 && room.names.length > capacity,
    }))
    .filter((room) => room.overCapacity || room.mixedHouseholds)
    .sort((a, b) => Number(a.roomNumber) - Number(b.roomNumber) || a.roomNumber.localeCompare(b.roomNumber));
}

/**
 * How many people will actually turn up.
 *
 * The invited count and the expected count are different numbers, and it is the
 * second one that catering, the room block and every per-guest cost should be
 * sized from. The original guest list scored each person 1–5 for how likely they
 * were to come; this is the sum of those probabilities.
 *
 * Anybody without a score counts as certain. That errs high, which is the safe
 * direction — cooking for people who don't arrive is a smaller problem than the
 * reverse.
 */
const ATTENDANCE_PROBABILITY: Record<number, number> = {
  1: 0.1,
  2: 0.25,
  3: 0.75,
  4: 0.95,
  5: 1,
};

export interface AttendanceForecast {
  /** On tier A or B — the people who will be asked. */
  invited: number;
  /** Tier A alone: the first wave. */
  tierA: number;
  /** Weighted by how likely each of them is to come. */
  expected: number;
  /** Tier A only, weighted — what to plan for if B is never sent. */
  expectedTierA: number;
  /** Confirmed yes so far, which overrides the estimate as replies arrive. */
  confirmed: number;
  /** How much of the estimate is still guesswork rather than an answer. */
  stillEstimated: number;
}

export function attendanceForecast(snapshot: WeddingSnapshot): AttendanceForecast {
  const probability = (guest: { attendanceScore: number | null }) =>
    ATTENDANCE_PROBABILITY[guest.attendanceScore ?? 5] ?? 1;

  // The snapshot only carries active guests, so no filtering is needed here.
  const active = snapshot.guests;
  const invited = active.filter((g) => g.tier === "A" || g.tier === "B");
  const tierA = active.filter((g) => g.tier === "A");

  // A reply beats an estimate. Once somebody has said yes or no, their
  // probability is 1 or 0 and no longer a guess.
  const answered = new Map<string, boolean>();
  for (const invitation of snapshot.invitations) {
    if (invitation.status === "CONFIRMED") answered.set(invitation.guestId, true);
    else if (invitation.status === "DECLINED") answered.set(invitation.guestId, false);
  }

  const weigh = (list: typeof active) =>
    list.reduce((sum, guest) => {
      const reply = answered.get(guest.id);
      if (reply === true) return sum + 1;
      if (reply === false) return sum;
      return sum + probability(guest);
    }, 0);

  const confirmed = invited.filter((g) => answered.get(g.id) === true).length;

  return {
    invited: invited.length,
    tierA: tierA.length,
    expected: Math.round(weigh(invited)),
    expectedTierA: Math.round(weigh(tierA)),
    confirmed,
    stillEstimated: invited.filter((g) => !answered.has(g.id)).length,
  };
}
