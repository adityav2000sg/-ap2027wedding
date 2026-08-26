/**
 * Snapshot loader.
 *
 * The single place that knows how to turn database rows into the plain domain
 * shapes every engine consumes. Decimals become numbers here and nowhere else;
 * archived rows are filtered out here and nowhere else.
 *
 * One wide read per request. A wedding is small enough that this is faster than
 * a dozen round trips — and it guarantees every figure on a page came from the
 * same consistent read.
 *
 * This module holds the queries and mapping. `snapshot.ts` wraps it with the
 * `server-only` guard and per-request caching; tests and scripts use this one
 * directly.
 */

import { today } from "@/lib/dates";
import { toNullableNumber, toNumber } from "@/lib/money";
import type { WeddingSnapshot } from "@/domain/types";
import { db as defaultClient } from "./db";

const active = { archivedAt: null };

export async function fetchSnapshot(
  weddingId: string,
  db: typeof defaultClient = defaultClient,
): Promise<WeddingSnapshot> {
  {
    const [
      wedding,
      members,
      venues,
      events,
      households,
      guests,
      invitations,
      vendors,
      contracts,
      categories,
      budgetItems,
      payments,
      payers,
      rates,
      tasks,
      dependencies,
      timeline,
      timelineDeps,
      hotels,
      stays,
      travel,
      vehicles,
      journeys,
      wardrobePeople,
      outfits,
      jewellery,
      documents,
      responsibilities,
      milestones,
      dismissals,
    ] = await Promise.all([
      db.wedding.findUniqueOrThrow({ where: { id: weddingId } }),
      db.weddingMember.findMany({ where: { weddingId }, include: { user: true } }),
      db.venue.findMany({ where: { weddingId, ...active } }),
      db.event.findMany({ where: { weddingId, ...active }, orderBy: [{ date: "asc" }, { startMinute: "asc" }] }),
      db.household.findMany({ where: { weddingId, ...active } }),
      db.guest.findMany({ where: { weddingId, ...active } }),
      db.eventInvitation.findMany({ where: { event: { weddingId } } }),
      db.vendor.findMany({
        where: { weddingId, ...active },
        include: { events: true, attributes: true },
      }),
      db.contract.findMany({ where: { weddingId } }),
      db.budgetCategory.findMany({ where: { weddingId, ...active }, orderBy: { sortOrder: "asc" } }),
      db.budgetItem.findMany({ where: { weddingId, ...active } }),
      db.payment.findMany({ where: { weddingId, ...active } }),
      db.payer.findMany({ where: { weddingId }, orderBy: { sortOrder: "asc" } }),
      db.currencyRate.findMany({ where: { weddingId } }),
      db.task.findMany({
        where: { weddingId, ...active },
        include: { _count: { select: { comments: true } } },
      }),
      db.taskDependency.findMany({ where: { task: { weddingId } } }),
      db.timelineEntry.findMany({ where: { weddingId, ...active } }),
      db.timelineDependency.findMany({ where: { entry: { weddingId } } }),
      db.hotel.findMany({ where: { weddingId, ...active }, include: { rooms: true } }),
      db.stay.findMany({ where: { weddingId } }),
      db.travelRecord.findMany({ where: { weddingId } }),
      db.transportVehicle.findMany({ where: { weddingId, ...active } }),
      db.transportJourney.findMany({ where: { weddingId }, include: { passengers: true } }),
      db.wardrobePerson.findMany({ where: { weddingId }, orderBy: { sortOrder: "asc" } }),
      db.outfit.findMany({
        where: { weddingId, ...active },
        include: { accessories: true, fittings: true },
      }),
      db.jewelleryItem.findMany({ where: { weddingId, ...active } }),
      db.document.findMany({
        where: { weddingId, ...active },
        include: { links: true, uploadedBy: true },
      }),
      db.responsibility.findMany({ where: { weddingId } }),
      db.milestone.findMany({ where: { weddingId } }),
      db.alertDismissal.findMany({ where: { weddingId } }),
    ]);

    return {
      wedding: {
        id: wedding.id,
        slug: wedding.slug,
        partnerAName: wedding.partnerAName,
        partnerBName: wedding.partnerBName,
        weddingType: wedding.weddingType,
        startDate: wedding.startDate,
        endDate: wedding.endDate,
        baseCurrency: wedding.baseCurrency,
        estimatedGuests: wedding.estimatedGuests,
        totalBudget: toNumber(wedding.totalBudget),
        contingencyPct: toNumber(wedding.contingencyPct),
        cities: wedding.cities,
        hasPlanner: wedding.hasPlanner,
        rsvpEnabled: wedding.rsvpEnabled,
        traditions: wedding.traditions,
        guestsPerRoom: wedding.guestsPerRoom,
      },

      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        relation: m.relation,
        avatarTone: m.user.avatarTone,
      })),

      venues: venues.map((v) => ({
        id: v.id,
        name: v.name,
        city: v.city,
        address: v.address,
        capacity: v.capacity,
        contactName: v.contactName,
        contactPhone: v.contactPhone,
        curfewMinute: v.curfewMinute,
        alcoholAllowed: v.alcoholAllowed,
        outsideCatering: v.outsideCatering,
        hasRainBackup: v.hasRainBackup,
        hasPowerBackup: v.hasPowerBackup,
        hasBridalRoom: v.hasBridalRoom,
        parkingSpaces: v.parkingSpaces,
        notes: v.notes,
      })),

      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        slug: e.slug,
        kind: e.kind,
        date: e.date,
        startMinute: e.startMinute,
        endMinute: e.endMinute,
        venueId: e.venueId,
        sortOrder: e.sortOrder,
        isPrivate: e.isPrivate,
        description: e.description,
        dressCode: e.dressCode,
        estimatedGuests: e.estimatedGuests,
        accentTone: e.accentTone,
        notes: e.notes,
      })),

      households: households.map((h) => ({
        id: h.id,
        name: h.name,
        side: h.side,
        relationship: h.relationship,
        city: h.city,
        country: h.country,
        rsvpToken: h.rsvpToken,
        invitationStatus: h.invitationStatus,
        rsvpSubmittedAt: h.rsvpSubmittedAt,
        giftReceived: h.giftReceived,
        notes: h.notes,
      })),

      guests: guests.map((g) => ({
        id: g.id,
        householdId: g.householdId,
        firstName: g.firstName,
        lastName: g.lastName,
        side: g.side,
        relationship: g.relationship,
        phone: g.phone,
        email: g.email,
        city: g.city,
        country: g.country,
        tags: g.tags,
        isVIP: g.isVIP,
        isChild: g.isChild,
        isSenior: g.isSenior,
        dietary: g.dietary,
        allergies: g.allergies,
        accessibilityNeeds: g.accessibilityNeeds,
        needsAccommodation: g.needsAccommodation,
        needsTransport: g.needsTransport,
        notes: g.notes,
      })),

      invitations: invitations.map((i) => ({
        id: i.id,
        guestId: i.guestId,
        eventId: i.eventId,
        status: i.status,
        respondedAt: i.respondedAt,
      })),

      vendors: vendors.map((v) => ({
        id: v.id,
        businessName: v.businessName,
        category: v.category,
        status: v.status,
        contactName: v.contactName,
        phone: v.phone,
        email: v.email,
        website: v.website,
        city: v.city,
        rating: v.rating,
        pros: v.pros,
        cons: v.cons,
        decisionReason: v.decisionReason,
        packageInfo: v.packageInfo,
        deliverables: v.deliverables,
        notes: v.notes,
        isFavourite: v.isFavourite,
        ownerId: v.ownerId,
        currency: v.currency,
        quoteAmount: toNullableNumber(v.quoteAmount),
        negotiatedAmount: toNullableNumber(v.negotiatedAmount),
        contractedAmount: toNullableNumber(v.contractedAmount),
        depositAmount: toNullableNumber(v.depositAmount),
        eventIds: v.events.map((e) => e.eventId),
        attributes: Object.fromEntries(v.attributes.map((a) => [a.key, a.value])),
      })),

      contracts: contracts.map((c) => ({
        id: c.id,
        vendorId: c.vendorId,
        title: c.title,
        amount: toNumber(c.amount),
        currency: c.currency,
        status: c.status,
        signedDate: c.signedDate,
        expiryDate: c.expiryDate,
        documentId: c.documentId,
      })),

      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId,
        sortOrder: c.sortOrder,
        allocatedAmount: toNumber(c.allocatedAmount),
        accentTone: c.accentTone,
      })),

      budgetItems: budgetItems.map((i) => ({
        id: i.id,
        categoryId: i.categoryId,
        name: i.name,
        description: i.description,
        eventId: i.eventId,
        vendorId: i.vendorId,
        costModel: i.costModel,
        guestBasis: i.guestBasis,
        currency: i.currency,
        allocatedAmount: toNumber(i.allocatedAmount),
        fixedAmount: toNullableNumber(i.fixedAmount),
        unitRate: toNullableNumber(i.unitRate),
        unitQuantity: toNullableNumber(i.unitQuantity),
        estimateAmount: toNullableNumber(i.estimateAmount),
        quoteAmount: toNullableNumber(i.quoteAmount),
        negotiatedAmount: toNullableNumber(i.negotiatedAmount),
        contractedAmount: toNullableNumber(i.contractedAmount),
        notes: i.notes,
      })),

      payments: payments.map((p) => ({
        id: p.id,
        budgetItemId: p.budgetItemId,
        vendorId: p.vendorId,
        payerId: p.payerId,
        label: p.label,
        amount: toNumber(p.amount),
        currency: p.currency,
        conversionRate: toNumber(p.conversionRate),
        dueDate: p.dueDate,
        paidDate: p.paidDate,
        status: p.status,
        method: p.method,
        reference: p.reference,
        documentId: p.documentId,
        notes: p.notes,
      })),

      payers: payers.map((p) => ({ id: p.id, name: p.name, kind: p.kind })),

      rates: rates.map((r) => ({
        fromCurrency: r.fromCurrency,
        toCurrency: r.toCurrency,
        rate: toNumber(r.rate),
        effectiveDate: r.effectiveDate,
      })),

      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        importance: t.importance,
        phase: t.phase,
        ownerId: t.ownerId,
        eventId: t.eventId,
        categoryId: t.categoryId,
        budgetItemId: t.budgetItemId,
        vendorId: t.vendorId,
        parentId: t.parentId,
        startDate: t.startDate,
        dueDate: t.dueDate,
        completedAt: t.completedAt,
        estimatedCost: toNullableNumber(t.estimatedCost),
        isMilestone: t.isMilestone,
        templateKey: t.templateKey,
        area: deriveArea(t.templateKey),
        createdAt: t.createdAt,
        commentCount: t._count.comments,
      })),

      dependencies: dependencies.map((d) => ({
        taskId: d.taskId,
        dependsOnId: d.dependsOnId,
      })),

      timeline: timeline.map((t) => ({
        id: t.id,
        eventId: t.eventId,
        title: t.title,
        date: t.date,
        startMinute: t.startMinute,
        endMinute: t.endMinute,
        location: t.location,
        ownerId: t.ownerId,
        vendorId: t.vendorId,
        participants: t.participants,
        notes: t.notes,
        status: t.status,
        isLocked: t.isLocked,
        sortOrder: t.sortOrder,
      })),

      timelineDeps: timelineDeps.map((d) => ({
        entryId: d.entryId,
        dependsOnId: d.dependsOnId,
        gapMinutes: d.gapMinutes,
      })),

      hotels: hotels.map((h) => ({
        id: h.id,
        name: h.name,
        city: h.city,
        address: h.address,
        contactName: h.contactName,
        phone: h.phone,
        contractedRooms: h.contractedRooms,
        ratePerNight: toNullableNumber(h.ratePerNight),
        currency: h.currency,
        rooms: h.rooms.map((r) => ({
          id: r.id,
          roomType: r.roomType,
          count: r.count,
          capacity: r.capacity,
          ratePerNight: toNullableNumber(r.ratePerNight),
        })),
      })),

      stays: stays.map((s) => ({
        id: s.id,
        guestId: s.guestId,
        hotelId: s.hotelId,
        roomId: s.roomId,
        roomNumber: s.roomNumber,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
      })),

      travel: travel.map((t) => ({
        id: t.id,
        guestId: t.guestId,
        direction: t.direction,
        mode: t.mode,
        carrier: t.carrier,
        serviceNumber: t.serviceNumber,
        hub: t.hub,
        scheduledAt: t.scheduledAt,
        pickupRequired: t.pickupRequired,
        journeyId: t.journeyId,
      })),

      vehicles: vehicles.map((v) => ({
        id: v.id,
        label: v.label,
        vehicleType: v.vehicleType,
        capacity: v.capacity,
        driverName: v.driverName,
        driverPhone: v.driverPhone,
        vendorId: v.vendorId,
        costPerDay: toNullableNumber(v.costPerDay),
        currency: v.currency,
      })),

      journeys: journeys.map((j) => ({
        id: j.id,
        vehicleId: j.vehicleId,
        eventId: j.eventId,
        purpose: j.purpose,
        date: j.date,
        startMinute: j.startMinute,
        endMinute: j.endMinute,
        fromLocation: j.fromLocation,
        toLocation: j.toLocation,
        passengerIds: j.passengers.map((p) => p.guestId),
      })),

      wardrobePeople: wardrobePeople.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        sortOrder: p.sortOrder,
      })),

      outfits: outfits.map((o) => ({
        id: o.id,
        personId: o.personId,
        eventId: o.eventId,
        outfitType: o.outfitType,
        designer: o.designer,
        vendorId: o.vendorId,
        imageUrl: o.imageUrl,
        orderDate: o.orderDate,
        deliveryDate: o.deliveryDate,
        cost: toNullableNumber(o.cost),
        currency: o.currency,
        status: o.status,
        notes: o.notes,
        accessories: o.accessories.map((a) => ({
          id: a.id,
          kind: a.kind,
          name: a.name,
          cost: toNullableNumber(a.cost),
          status: a.status,
        })),
        fittings: o.fittings.map((f) => ({
          id: f.id,
          kind: f.kind,
          scheduledAt: f.scheduledAt,
          completedAt: f.completedAt,
          location: f.location,
        })),
      })),

      jewellery: jewellery.map((j) => ({
        id: j.id,
        personId: j.personId,
        eventId: j.eventId,
        name: j.name,
        ownership: j.ownership,
        jeweller: j.jeweller,
        cost: toNullableNumber(j.cost),
        currency: j.currency,
        pickupDate: j.pickupDate,
        returnDate: j.returnDate,
        responsibleId: j.responsibleId,
        storageNote: j.storageNote,
        insured: j.insured,
        notes: j.notes,
      })),

      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        kind: d.kind,
        fileName: d.fileName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        uploadedById: d.uploadedById,
        uploadedByName: d.uploadedBy?.name ?? null,
        visibleToRoles: d.visibleToRoles,
        createdAt: d.createdAt,
        links: d.links.map((l) => ({ entityType: l.entityType, entityId: l.entityId })),
      })),

      responsibilities: responsibilities.map((r) => ({
        id: r.id,
        title: r.title,
        area: r.area,
        ownerId: r.ownerId,
        backupId: r.backupId,
        eventId: r.eventId,
        dueDate: r.dueDate,
        status: r.status,
        importance: r.importance,
        notes: r.notes,
      })),

      milestones: milestones.map((m) => ({
        id: m.id,
        key: m.key,
        title: m.title,
        description: m.description,
        sortOrder: m.sortOrder,
        achievedAt: m.achievedAt,
      })),

      dismissedAlerts: dismissals.map((d) => d.alertKey),

      today: today(),
    };
  }
}

/**
 * Tasks carry the template key they came from; the area is the part before the
 * first hyphen group. Keeps the library's grouping without duplicating it into
 * a column that could drift.
 */
const AREA_BY_PREFIX: Record<string, string> = {
  foundation: "Foundation",
  venue: "Venue",
  catering: "Catering",
  photo: "Photography & Video",
  decor: "Decor",
  haldi: "Haldi",
  mehendi: "Mehendi",
  sangeet: "Sangeet",
  shaadi: "Shaadi",
  reception: "Reception",
  ent: "Entertainment",
  invite: "Invitations & Stationery",
  bride: "Bride Wardrobe",
  groom: "Groom Wardrobe",
  family: "Family Wardrobe",
  hmua: "Hair & Makeup",
  jewel: "Jewellery",
  hotel: "Accommodation",
  travel: "Travel",
  transport: "Transport",
  hosp: "Hospitality",
  gifts: "Gifts",
  legal: "Legal & Admin",
  emg: "Emergency Planning",
  week: "Wedding Week",
  post: "After the Wedding",
};

function deriveArea(templateKey: string | null): string | null {
  if (!templateKey) return null;
  const prefix = templateKey.split(":")[0].split("-")[0];
  return AREA_BY_PREFIX[prefix] ?? null;
}

export { AREA_BY_PREFIX };
