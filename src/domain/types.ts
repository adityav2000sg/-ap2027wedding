/**
 * Domain types.
 *
 * These are plain, serialisable shapes — no Prisma Decimals, no Prisma client
 * types. The whole point is that every engine in `src/domain` is a *pure
 * function over a snapshot*, so it can be unit-tested without a database and
 * reused identically on the server, in the AI tool layer, and in tests.
 *
 * `src/server/snapshot.ts` is the only place that knows how to build one.
 */

import type {
  ActivitySource,
  ContractStatus,
  CostModel,
  DietaryPreference,
  DocumentKind,
  EventKind,
  FittingKind,
  GuestBasis,
  GuestSide,
  InvitationStatus,
  JewelleryOwnership,
  MemberRole,
  OutfitStatus,
  PaymentStatus,
  PlanPhase,
  ResponsibilityStatus,
  RsvpStatus,
  TaskPriority,
  TaskStatus,
  TimelineStatus,
  TravelDirection,
  TravelMode,
  VendorCategory,
  VendorStatus,
} from "@prisma/client";

export type {
  ActivitySource,
  ContractStatus,
  CostModel,
  DietaryPreference,
  DocumentKind,
  EventKind,
  FittingKind,
  GuestBasis,
  GuestSide,
  InvitationStatus,
  JewelleryOwnership,
  MemberRole,
  OutfitStatus,
  PaymentStatus,
  PlanPhase,
  ResponsibilityStatus,
  RsvpStatus,
  TaskPriority,
  TaskStatus,
  TimelineStatus,
  TravelDirection,
  TravelMode,
  VendorCategory,
  VendorStatus,
};

export interface WeddingCore {
  id: string;
  slug: string;
  partnerAName: string;
  partnerBName: string;
  weddingType: string;
  startDate: Date;
  endDate: Date;
  baseCurrency: string;
  estimatedGuests: number;
  totalBudget: number;
  contingencyPct: number;
  cities: string[];
  hasPlanner: boolean;
  rsvpEnabled: boolean;
  traditions: string[];
  guestsPerRoom: number;
}

export interface MemberNode {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  relation: string;
  avatarTone: string;
}

export interface VenueNode {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  capacity: number | null;
  contactName: string | null;
  contactPhone: string | null;
  curfewMinute: number | null;
  alcoholAllowed: boolean;
  outsideCatering: boolean;
  hasRainBackup: boolean;
  hasPowerBackup: boolean;
  hasBridalRoom: boolean;
  parkingSpaces: number | null;
  notes: string | null;
}

export interface EventNode {
  id: string;
  name: string;
  slug: string;
  kind: EventKind;
  date: Date;
  startMinute: number;
  endMinute: number;
  venueId: string | null;
  sortOrder: number;
  isPrivate: boolean;
  description: string | null;
  dressCode: string | null;
  estimatedGuests: number;
  accentTone: string;
  notes: string | null;
}

export interface HouseholdNode {
  id: string;
  name: string;
  side: GuestSide;
  relationship: string | null;
  city: string | null;
  country: string;
  rsvpToken: string;
  invitationStatus: InvitationStatus;
  rsvpSubmittedAt: Date | null;
  giftReceived: boolean;
  notes: string | null;
}

export interface GuestNode {
  id: string;
  householdId: string | null;
  firstName: string;
  lastName: string;
  side: GuestSide;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  country: string;
  tags: string[];
  isVIP: boolean;
  isChild: boolean;
  isSenior: boolean;
  dietary: DietaryPreference;
  allergies: string | null;
  accessibilityNeeds: string | null;
  needsAccommodation: boolean;
  needsTransport: boolean;
  notes: string | null;
}

export interface InvitationNode {
  id: string;
  guestId: string;
  eventId: string;
  status: RsvpStatus;
  respondedAt: Date | null;
}

export interface VendorNode {
  id: string;
  businessName: string;
  category: VendorCategory;
  status: VendorStatus;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  rating: number | null;
  pros: string[];
  cons: string[];
  decisionReason: string | null;
  packageInfo: string | null;
  deliverables: string[];
  notes: string | null;
  isFavourite: boolean;
  ownerId: string | null;
  currency: string;
  quoteAmount: number | null;
  negotiatedAmount: number | null;
  contractedAmount: number | null;
  depositAmount: number | null;
  eventIds: string[];
  attributes: Record<string, string>;
}

export interface ContractNode {
  id: string;
  vendorId: string;
  title: string;
  amount: number;
  currency: string;
  status: ContractStatus;
  signedDate: Date | null;
  expiryDate: Date | null;
  documentId: string | null;
}

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  allocatedAmount: number;
  accentTone: string;
}

export interface BudgetItemNode {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  eventId: string | null;
  vendorId: string | null;
  costModel: CostModel;
  guestBasis: GuestBasis;
  currency: string;
  allocatedAmount: number;
  fixedAmount: number | null;
  unitRate: number | null;
  unitQuantity: number | null;
  estimateAmount: number | null;
  quoteAmount: number | null;
  negotiatedAmount: number | null;
  contractedAmount: number | null;
  notes: string | null;
}

export interface PaymentNode {
  id: string;
  budgetItemId: string | null;
  vendorId: string | null;
  payerId: string | null;
  label: string;
  amount: number;
  currency: string;
  conversionRate: number;
  dueDate: Date;
  paidDate: Date | null;
  status: PaymentStatus;
  method: string | null;
  reference: string | null;
  documentId: string | null;
  notes: string | null;
}

export interface PayerNode {
  id: string;
  name: string;
  kind: string;
}

export interface RateNode {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: Date;
}

export interface TaskNode {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  importance: number;
  phase: PlanPhase;
  ownerId: string | null;
  eventId: string | null;
  categoryId: string | null;
  budgetItemId: string | null;
  vendorId: string | null;
  parentId: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null;
  estimatedCost: number | null;
  isMilestone: boolean;
  templateKey: string | null;
  area: string | null;
  createdAt: Date;
  commentCount: number;
}

export interface DependencyEdge {
  taskId: string;
  dependsOnId: string;
}

export interface TimelineNode {
  id: string;
  eventId: string | null;
  title: string;
  date: Date;
  startMinute: number;
  endMinute: number;
  location: string | null;
  ownerId: string | null;
  vendorId: string | null;
  participants: string[];
  notes: string | null;
  status: TimelineStatus;
  isLocked: boolean;
  sortOrder: number;
}

export interface TimelineEdge {
  entryId: string;
  dependsOnId: string;
  gapMinutes: number;
}

export interface HotelNode {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  contactName: string | null;
  phone: string | null;
  contractedRooms: number;
  ratePerNight: number | null;
  currency: string;
  rooms: { id: string; roomType: string; count: number; capacity: number; ratePerNight: number | null }[];
}

export interface StayNode {
  id: string;
  guestId: string;
  hotelId: string;
  roomId: string | null;
  roomNumber: string | null;
  checkIn: Date;
  checkOut: Date;
}

export interface TravelNode {
  id: string;
  guestId: string;
  direction: TravelDirection;
  mode: TravelMode;
  carrier: string | null;
  serviceNumber: string | null;
  hub: string | null;
  scheduledAt: Date;
  pickupRequired: boolean;
  journeyId: string | null;
}

export interface VehicleNode {
  id: string;
  label: string;
  vehicleType: string;
  capacity: number;
  driverName: string | null;
  driverPhone: string | null;
  vendorId: string | null;
  costPerDay: number | null;
  currency: string;
}

export interface JourneyNode {
  id: string;
  vehicleId: string | null;
  eventId: string | null;
  purpose: string;
  date: Date;
  startMinute: number;
  endMinute: number;
  fromLocation: string | null;
  toLocation: string | null;
  passengerIds: string[];
}

export interface WardrobePersonNode {
  id: string;
  name: string;
  role: string;
  sortOrder: number;
}

export interface OutfitNode {
  id: string;
  personId: string;
  eventId: string | null;
  outfitType: string;
  designer: string | null;
  vendorId: string | null;
  imageUrl: string | null;
  orderDate: Date | null;
  deliveryDate: Date | null;
  cost: number | null;
  currency: string;
  status: OutfitStatus;
  notes: string | null;
  accessories: { id: string; kind: string; name: string; cost: number | null; status: OutfitStatus }[];
  fittings: { id: string; kind: FittingKind; scheduledAt: Date; completedAt: Date | null; location: string | null }[];
}

export interface JewelleryNode {
  id: string;
  personId: string | null;
  eventId: string | null;
  name: string;
  ownership: JewelleryOwnership;
  jeweller: string | null;
  cost: number | null;
  currency: string;
  pickupDate: Date | null;
  returnDate: Date | null;
  responsibleId: string | null;
  storageNote: string | null;
  insured: boolean;
  notes: string | null;
}

export interface DocumentNode {
  id: string;
  title: string;
  kind: DocumentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string | null;
  uploadedByName: string | null;
  visibleToRoles: MemberRole[];
  createdAt: Date;
  links: { entityType: string; entityId: string }[];
}

export interface ResponsibilityNode {
  id: string;
  title: string;
  area: string;
  ownerId: string | null;
  backupId: string | null;
  eventId: string | null;
  dueDate: Date | null;
  status: ResponsibilityStatus;
  importance: number;
  notes: string | null;
}

export interface MilestoneNode {
  id: string;
  key: string;
  title: string;
  description: string;
  sortOrder: number;
  achievedAt: Date | null;
}

/**
 * Everything the engines need, loaded once per request. A wedding is a few
 * thousand rows at most, so one wide read beats a dozen narrow ones — and it
 * guarantees every number on a page was computed from the same instant.
 */
export interface WeddingSnapshot {
  wedding: WeddingCore;
  members: MemberNode[];
  venues: VenueNode[];
  events: EventNode[];
  households: HouseholdNode[];
  guests: GuestNode[];
  invitations: InvitationNode[];
  vendors: VendorNode[];
  contracts: ContractNode[];
  categories: CategoryNode[];
  budgetItems: BudgetItemNode[];
  payments: PaymentNode[];
  payers: PayerNode[];
  rates: RateNode[];
  tasks: TaskNode[];
  dependencies: DependencyEdge[];
  timeline: TimelineNode[];
  timelineDeps: TimelineEdge[];
  hotels: HotelNode[];
  stays: StayNode[];
  travel: TravelNode[];
  vehicles: VehicleNode[];
  journeys: JourneyNode[];
  wardrobePeople: WardrobePersonNode[];
  outfits: OutfitNode[];
  jewellery: JewelleryNode[];
  documents: DocumentNode[];
  responsibilities: ResponsibilityNode[];
  milestones: MilestoneNode[];
  dismissedAlerts: string[];
  /** The civil date every "is this overdue?" question is answered against. */
  today: Date;
}

// ────────────────────────────────────────────────────────── Shared value types

export type Severity = "info" | "attention" | "important" | "critical";

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  important: 1,
  attention: 2,
  info: 3,
};

/** Where a computed number came from — always shown, never hidden. */
export type ForecastSource =
  | "contracted"
  | "negotiated"
  | "quoted"
  | "modelled"
  | "estimated"
  | "allocated";

export interface EntityRef {
  type: string;
  id: string;
  label: string;
  href?: string;
}
