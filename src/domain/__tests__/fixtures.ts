/**
 * A small, fully-controlled wedding used by the domain tests.
 *
 * Hand-built rather than loaded from the database, so every test asserts
 * against numbers that can be worked out on paper.
 */

import type {
  BudgetItemNode,
  EventNode,
  GuestNode,
  InvitationNode,
  TaskNode,
  TimelineNode,
  VendorNode,
  WeddingSnapshot,
} from "../types";

export const TODAY = new Date(Date.UTC(2027, 0, 1));
export const WEDDING_START = new Date(Date.UTC(2027, 5, 16));

export function makeEvent(overrides: Partial<EventNode> = {}): EventNode {
  return {
    id: "event-shaadi",
    name: "Shaadi",
    slug: "shaadi",
    kind: "SHAADI",
    date: new Date(Date.UTC(2027, 5, 18)),
    startMinute: 1020,
    endMinute: 1500,
    venueId: "venue-1",
    sortOrder: 0,
    isPrivate: false,
    description: null,
    dressCode: null,
    estimatedGuests: 300,
    accentTone: "saffron",
    notes: null,
    ...overrides,
  };
}

export function makeGuest(id: string, overrides: Partial<GuestNode> = {}): GuestNode {
  return {
    id,
    householdId: `household-${id}`,
    firstName: "Test",
    lastName: id,
    side: "BRIDE",
    relationship: null,
    phone: null,
    email: null,
    city: "New Delhi",
    country: "India",
    tags: [],
    isVIP: false,
    isChild: false,
    isSenior: false,
    dietary: "NOT_SPECIFIED",
    allergies: null,
    accessibilityNeeds: null,
    needsAccommodation: false,
    needsTransport: false,
    notes: null,
    ...overrides,
  };
}

export function makeInvitation(
  guestId: string,
  eventId: string,
  status: InvitationNode["status"],
): InvitationNode {
  return {
    id: `${guestId}-${eventId}`,
    guestId,
    eventId,
    status,
    respondedAt: null,
  };
}

export function makeBudgetItem(
  overrides: Partial<BudgetItemNode> = {},
): BudgetItemNode {
  return {
    id: "item-1",
    categoryId: "cat-1",
    name: "Test line",
    description: null,
    eventId: null,
    vendorId: null,
    costModel: "FIXED",
    guestBasis: "CONFIRMED_PLUS_PENDING",
    currency: "INR",
    allocatedAmount: 100_000,
    fixedAmount: null,
    unitRate: null,
    unitQuantity: null,
    estimateAmount: null,
    quoteAmount: null,
    negotiatedAmount: null,
    contractedAmount: null,
    notes: null,
    ...overrides,
  };
}

export function makeTask(id: string, overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    status: "NOT_STARTED",
    priority: "MEDIUM",
    importance: 3,
    phase: "SIX_TO_NINE_MONTHS",
    ownerId: null,
    eventId: null,
    categoryId: null,
    budgetItemId: null,
    vendorId: null,
    parentId: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    estimatedCost: null,
    isMilestone: false,
    templateKey: null,
    area: null,
    createdAt: TODAY,
    commentCount: 0,
    ...overrides,
  };
}

export function makeVendor(id: string, overrides: Partial<VendorNode> = {}): VendorNode {
  return {
    id,
    businessName: `Vendor ${id}`,
    category: "CATERING",
    status: "RESEARCHING",
    contactName: null,
    phone: null,
    email: null,
    website: null,
    city: null,
    rating: null,
    pros: [],
    cons: [],
    decisionReason: null,
    packageInfo: null,
    deliverables: [],
    notes: null,
    isFavourite: false,
    ownerId: null,
    currency: "INR",
    quoteAmount: null,
    negotiatedAmount: null,
    contractedAmount: null,
    depositAmount: null,
    eventIds: [],
    attributes: {},
    ...overrides,
  };
}

export function makeTimelineEntry(
  id: string,
  startMinute: number,
  endMinute: number,
  overrides: Partial<TimelineNode> = {},
): TimelineNode {
  return {
    id,
    eventId: "event-shaadi",
    title: `Entry ${id}`,
    date: new Date(Date.UTC(2027, 5, 18)),
    startMinute,
    endMinute,
    location: null,
    ownerId: null,
    vendorId: null,
    participants: [],
    notes: null,
    status: "PLANNED",
    isLocked: false,
    sortOrder: 0,
    ...overrides,
  };
}

export function makeSnapshot(
  overrides: Partial<WeddingSnapshot> = {},
): WeddingSnapshot {
  return {
    wedding: {
      id: "wedding-1",
      slug: "test",
      partnerAName: "Avantika",
      partnerBName: "Prateek",
      weddingType: "North Indian",
      startDate: WEDDING_START,
      endDate: new Date(Date.UTC(2027, 5, 19)),
      baseCurrency: "INR",
      estimatedGuests: 300,
      totalBudget: 10_000_000,
      contingencyPct: 5,
      cities: ["New Delhi"],
      hasPlanner: true,
      rsvpEnabled: true,
      traditions: ["baraat", "pheras"],
      guestsPerRoom: 2,
    },
    members: [],
    venues: [
      {
        id: "venue-1",
        name: "Test Venue",
        city: "New Delhi",
        address: null,
        capacity: 400,
        contactName: null,
        contactPhone: null,
        curfewMinute: 1470,
        alcoholAllowed: true,
        outsideCatering: true,
        hasRainBackup: true,
        hasPowerBackup: true,
        hasBridalRoom: true,
        parkingSpaces: 100,
        notes: null,
      },
    ],
    events: [makeEvent()],
    households: [],
    guests: [],
    invitations: [],
    vendors: [],
    contracts: [],
    categories: [
      {
        id: "cat-1",
        name: "Catering",
        parentId: null,
        sortOrder: 0,
        allocatedAmount: 0,
        accentTone: "saffron",
      },
    ],
    budgetItems: [],
    payments: [],
    payers: [],
    rates: [],
    tasks: [],
    dependencies: [],
    timeline: [],
    timelineDeps: [],
    hotels: [],
    stays: [],
    travel: [],
    vehicles: [],
    journeys: [],
    wardrobePeople: [],
    outfits: [],
    jewellery: [],
    documents: [],
    responsibilities: [],
    milestones: [],
    dismissedAlerts: [],
    today: TODAY,
    ...overrides,
  };
}

/** Build a snapshot with `count` guests, all confirmed for the Shaadi. */
export function snapshotWithGuests(
  count: number,
  status: InvitationNode["status"] = "CONFIRMED",
  overrides: Partial<WeddingSnapshot> = {},
): WeddingSnapshot {
  const guests = Array.from({ length: count }, (_, i) => makeGuest(`g${i}`));
  const invitations = guests.map((g) => makeInvitation(g.id, "event-shaadi", status));
  const households = guests.map((g) => ({
    id: g.householdId!,
    name: `Household ${g.id}`,
    side: "BRIDE" as const,
    relationship: null,
    city: "New Delhi",
    country: "India",
    rsvpToken: `token-${g.id}`,
    invitationStatus: "INVITED" as const,
    rsvpSubmittedAt: null,
    giftReceived: false,
    notes: null,
  }));
  return makeSnapshot({ guests, invitations, households, ...overrides });
}
