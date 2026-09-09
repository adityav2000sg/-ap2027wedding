/**
 * What the planner is allowed to do.
 *
 * One catalogue, listing every change the assistant can put in front of you —
 * which is now everything the app itself can do: add and edit guests, events,
 * vendors, tasks, budget lines, payments, run-of-show entries, rooms, journeys,
 * outfits, and the sends and replies that go with an invitation.
 *
 * Three things kept this file honest as it grew:
 *
 *   It is pure. No database, no server actions, no imports with side effects —
 *   only names, permissions, argument schemas and (where the impact engine
 *   models the change) a translation into a `PlannedChange`. Execution lives
 *   next door in `execute.ts`, so this catalogue can be read and tested on its
 *   own.
 *
 *   It never widens anybody's authority. Each entry names the permission its
 *   underlying action already requires, and the model is only offered the
 *   entries the person it is talking to could carry out by hand. The real check
 *   still happens inside the server action, as it does for a button press.
 *
 *   It changes nothing by itself. Every entry here becomes a proposal that a
 *   human approves; the ones the impact engine understands are previewed with
 *   their full consequences first.
 */

import type { PlannedChange } from "@/domain/impact";
import type { Permission } from "@/server/permissions";
import { z } from "zod";

export type CapabilityArea =
  | "guests"
  | "invitations"
  | "events"
  | "tasks"
  | "vendors"
  | "budget"
  | "timeline"
  | "logistics"
  | "wardrobe"
  | "wedding";

export interface AiCapability {
  /** Stable name the model calls it by. */
  action: string;
  area: CapabilityArea;
  /** The permission the underlying action requires. */
  permission: Permission;
  /** One line for the model: what it does, and what it needs. */
  hint: string;
  schema: z.ZodTypeAny;
  /**
   * Set when the impact engine models this change. Those go through the
   * preview-fingerprint-apply path, so the user sees every consequence before
   * approving. Everything else executes through its ordinary server action.
   */
  planned?: (args: Record<string, unknown>) => PlannedChange;
}

// ───────────────────────────────────────────────────────────── field helpers

const id = z.string().min(1);
const optId = id.optional();
const text = z.string().trim().min(1);
const optText = z.string().trim().max(2000).optional();
/** Dates cross the wire as YYYY-MM-DD, exactly as the forms send them. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const optDay = day.optional();
/** Minutes from midnight — 1140 is 7:00 PM. */
const minute = z.coerce.number().int().min(0).max(2879);
const money = z.coerce.number().min(0);
const optMoney = money.optional();
const currency = z.string().length(3).optional();
const flag = z.coerce.boolean();

const RSVP = ["NOT_INVITED", "PENDING", "CONFIRMED", "DECLINED", "TENTATIVE"] as const;
const TIERS = ["A", "B", "C"] as const;
const SIDES = ["BRIDE", "GROOM", "BOTH"] as const;
const DIETS = ["NON_VEGETARIAN", "VEGETARIAN", "JAIN", "VEGAN", "NOT_SPECIFIED"] as const;
const TASK_STATUS = [
  "NOT_STARTED", "IN_PROGRESS", "WAITING", "BLOCKED", "REVIEW", "DONE", "CANCELLED",
] as const;
const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const VENDOR_STATUS = [
  "RESEARCHING", "CONTACTED", "QUOTE_RECEIVED", "SHORTLISTED", "NEGOTIATING",
  "SELECTED", "CONTRACTED", "ACTIVE", "COMPLETED", "REJECTED",
] as const;
const SEND = ["saveTheDate", "invitation"] as const;

function capability(entry: AiCapability): AiCapability {
  return entry;
}

// ──────────────────────────────────────────────────────────────── the catalogue

export const CAPABILITIES: AiCapability[] = [
  // ── The wedding as a whole ────────────────────────────────────────────────
  capability({
    action: "wedding.guests",
    area: "wedding",
    permission: "wedding.configure",
    hint: "Change the overall planning guest estimate. {estimatedGuests}",
    schema: z.object({ estimatedGuests: z.coerce.number().int().min(1).max(5000) }),
    planned: (a) => ({
      type: "wedding.guests",
      estimatedGuests: Number(a.estimatedGuests),
    }),
  }),
  capability({
    action: "wedding.budget",
    area: "wedding",
    permission: "budget.edit",
    hint: "Change the total budget. {totalBudget}",
    schema: z.object({ totalBudget: money }),
    planned: (a) => ({ type: "wedding.budget", totalBudget: Number(a.totalBudget) }),
  }),

  // ── Functions ─────────────────────────────────────────────────────────────
  capability({
    action: "event.time",
    area: "events",
    permission: "events.edit",
    hint:
      "Move a function's hours. {eventId, shiftMinutes} to shift it (positive = later) — strongly preferred — " +
      "or {eventId, startMinute, endMinute} for absolute times.",
    schema: z.union([
      z.object({ eventId: id, shiftMinutes: z.coerce.number().int() }),
      z.object({ eventId: id, startMinute: minute, endMinute: minute }),
    ]),
    // shiftMinutes is resolved against the real event before this runs.
    planned: (a) => ({
      type: "event.time",
      eventId: String(a.eventId),
      startMinute: Number(a.startMinute),
      endMinute: Number(a.endMinute),
    }),
  }),
  capability({
    action: "event.date",
    area: "events",
    permission: "events.edit",
    hint: "Move a function to another day. {eventId, date: YYYY-MM-DD}",
    schema: z.object({ eventId: id, date: day }),
    planned: (a) => ({
      type: "event.date",
      eventId: String(a.eventId),
      date: new Date(`${String(a.date)}T00:00:00.000Z`),
    }),
  }),
  capability({
    action: "event.venue",
    area: "events",
    permission: "events.edit",
    hint: "Set or clear a function's venue. {eventId, venueId} — venueId null to clear.",
    schema: z.object({ eventId: id, venueId: z.string().nullable() }),
    planned: (a) => ({
      type: "event.venue",
      eventId: String(a.eventId),
      venueId: (a.venueId ?? null) as string | null,
    }),
  }),
  capability({
    action: "event.guests",
    area: "events",
    permission: "events.edit",
    hint: "Change one function's expected attendance. {eventId, estimatedGuests}",
    schema: z.object({ eventId: id, estimatedGuests: z.coerce.number().int().min(0).max(5000) }),
    planned: (a) => ({
      type: "event.guests",
      eventId: String(a.eventId),
      estimatedGuests: Number(a.estimatedGuests),
    }),
  }),
  capability({
    action: "event.create",
    area: "events",
    permission: "events.edit",
    hint:
      "Add a function. {name, date, startMinute, endMinute} plus optional kind, venueId, newVenueName, " +
      "estimatedGuests, dressCode, description, notes.",
    schema: z.object({
      name: text.max(120),
      date: day,
      startMinute: minute,
      endMinute: minute,
      kind: z.string().optional(),
      venueId: optId,
      newVenueName: optText,
      newVenueCity: optText,
      estimatedGuests: z.coerce.number().int().min(0).max(100_000).optional(),
      dressCode: optText,
      description: optText,
      notes: optText,
    }),
  }),
  capability({
    action: "event.update",
    area: "events",
    permission: "events.edit",
    hint:
      "Edit a function's details — {eventId} plus any of name, kind, dressCode, description, notes. " +
      "Use event.time / event.date / event.venue for hours, day and venue.",
    schema: z.object({
      eventId: id,
      name: text.max(120).optional(),
      kind: z.string().optional(),
      dressCode: optText,
      description: optText,
      notes: optText,
    }),
  }),
  capability({
    action: "event.archive",
    area: "events",
    permission: "events.edit",
    hint: "Take a function off the plan. {eventId}",
    schema: z.object({ eventId: id }),
  }),

  // ── Guests ────────────────────────────────────────────────────────────────
  capability({
    action: "guest.rsvp",
    area: "guests",
    permission: "guests.edit",
    hint:
      "One guest's answer for one function. {guestId, eventId, status} — " +
      "NOT_INVITED (never asked) is not DECLINED (asked, said no).",
    schema: z.object({ guestId: id, eventId: id, status: z.enum(RSVP) }),
    planned: (a) => ({
      type: "guest.rsvp",
      guestId: String(a.guestId),
      eventId: String(a.eventId),
      status: a.status as (typeof RSVP)[number],
    }),
  }),
  capability({
    action: "guest.accommodation",
    area: "guests",
    permission: "guests.edit",
    hint: "Whether a guest needs a room. {guestId, needsAccommodation}",
    schema: z.object({ guestId: id, needsAccommodation: flag }),
    planned: (a) => ({
      type: "guest.accommodation",
      guestId: String(a.guestId),
      needsAccommodation: Boolean(a.needsAccommodation),
    }),
  }),
  capability({
    action: "guest.attendance",
    area: "guests",
    permission: "guests.edit",
    hint:
      "A guest's single answer for the whole week — this wedding asks once. {guestId, status}",
    schema: z.object({ guestId: id, status: z.enum(RSVP) }),
  }),
  capability({
    action: "guest.create",
    area: "guests",
    permission: "guests.edit",
    hint:
      "Add somebody to the list. {firstName} plus optional lastName, side, relationship, phone, email, " +
      "householdId or newHouseholdName, tier is set separately, isChild, isVIP, dietary, needsAccommodation, notes.",
    schema: z.object({
      firstName: text.max(80),
      lastName: z.string().trim().max(80).optional(),
      side: z.enum(SIDES).optional(),
      relationship: optText,
      phone: optText,
      email: optText,
      city: optText,
      householdId: optId,
      newHouseholdName: optText,
      isVIP: flag.optional(),
      isChild: flag.optional(),
      isSenior: flag.optional(),
      dietary: z.enum(DIETS).optional(),
      allergies: optText,
      accessibilityNeeds: optText,
      needsAccommodation: flag.optional(),
      needsTransport: flag.optional(),
      notes: optText,
    }),
  }),
  capability({
    action: "guest.update",
    area: "guests",
    permission: "guests.edit",
    hint:
      "Edit a guest. {guestId} plus any of firstName, lastName, side, relationship, phone, email, city, " +
      "dietary, allergies, accessibilityNeeds, needsTransport, isVIP, isChild, notes.",
    schema: z.object({
      guestId: id,
      firstName: text.max(80).optional(),
      lastName: z.string().trim().max(80).optional(),
      side: z.enum(SIDES).optional(),
      relationship: optText,
      phone: optText,
      email: optText,
      city: optText,
      dietary: z.enum(DIETS).optional(),
      allergies: optText,
      accessibilityNeeds: optText,
      needsTransport: flag.optional(),
      isVIP: flag.optional(),
      isChild: flag.optional(),
      notes: optText,
    }),
  }),
  capability({
    action: "guest.archive",
    area: "guests",
    permission: "guests.edit",
    hint: "Take somebody off the guest list. {guestId}",
    schema: z.object({ guestId: id }),
  }),
  capability({
    action: "guest.tier",
    area: "guests",
    permission: "guests.edit",
    hint: "Which wave a guest is on. {guestId, tier: A|B|C}",
    schema: z.object({ guestId: id, tier: z.enum(TIERS) }),
  }),
  capability({
    action: "guest.room",
    area: "logistics",
    permission: "logistics.edit",
    hint: "Put a guest in a room. {guestId, roomNumber} — roomNumber null clears it. Optional hotelId.",
    schema: z.object({ guestId: id, roomNumber: z.string().nullable(), hotelId: optId }),
  }),
  capability({
    action: "guests.bulkRsvp",
    area: "guests",
    permission: "guests.edit",
    hint: "Set the same answer for several guests at one function. {guestIds: [], eventId, status}",
    schema: z.object({
      guestIds: z.array(id).min(1).max(200),
      eventId: id,
      status: z.enum(RSVP),
    }),
  }),

  // ── Households, sends and replies ─────────────────────────────────────────
  capability({
    action: "household.create",
    area: "guests",
    permission: "guests.edit",
    hint: "Start a household. {name} plus optional side, relationship, city, notes.",
    schema: z.object({
      name: text.max(120),
      side: z.enum(SIDES).optional(),
      relationship: optText,
      city: optText,
      notes: optText,
    }),
  }),
  capability({
    action: "household.tier",
    area: "invitations",
    permission: "guests.edit",
    hint: "Move a whole household to a wave. {householdId, tier: A|B|C}",
    schema: z.object({ householdId: id, tier: z.enum(TIERS) }),
  }),
  capability({
    action: "household.send",
    area: "invitations",
    permission: "guests.edit",
    hint:
      "Record that a household's save-the-date or invitation went out — this marks it sent, it does not send it. " +
      "{householdId, which: saveTheDate|invitation, sent}",
    schema: z.object({ householdId: id, which: z.enum(SEND), sent: flag }),
  }),
  capability({
    action: "guest.send",
    area: "invitations",
    permission: "guests.edit",
    hint:
      "The same, for one person rather than the household. {guestId, which: saveTheDate|invitation, sent}",
    schema: z.object({ guestId: id, which: z.enum(SEND), sent: flag }),
  }),
  capability({
    action: "household.reply",
    area: "invitations",
    permission: "guests.edit",
    hint: "Record a household's reply as it came in. {householdId, reply: YES|NO|AWAITING}",
    schema: z.object({ householdId: id, reply: z.enum(["YES", "NO", "AWAITING"]) }),
  }),
  capability({
    action: "guest.contact",
    area: "invitations",
    permission: "guests.edit",
    hint: "Set one guest's phone or email. {guestId, field: phone|email, value}",
    schema: z.object({
      guestId: id,
      field: z.enum(["phone", "email"]),
      value: z.string().trim().max(160),
    }),
  }),

  // ── Tasks ─────────────────────────────────────────────────────────────────
  capability({
    action: "task.create",
    area: "tasks",
    permission: "tasks.edit",
    hint:
      "Add a task. {title} plus optional description, dueDate (YYYY-MM-DD), ownerId, eventId, vendorId, " +
      "priority (CRITICAL|HIGH|MEDIUM|LOW), importance 1-5, estimatedCost.",
    schema: z.object({
      title: text.max(200),
      description: optText,
      dueDate: optDay,
      ownerId: optId,
      eventId: optId,
      vendorId: optId,
      categoryId: optId,
      priority: z.enum(PRIORITIES).optional(),
      importance: z.coerce.number().int().min(1).max(5).optional(),
      estimatedCost: optMoney,
    }),
  }),
  capability({
    action: "task.update",
    area: "tasks",
    permission: "tasks.edit",
    hint:
      "Change a task. {taskId} plus any of title, description, status, priority, importance, " +
      "dueDate, ownerId, eventId, vendorId.",
    schema: z.object({
      taskId: id,
      title: text.max(200).optional(),
      description: optText,
      status: z.enum(TASK_STATUS).optional(),
      priority: z.enum(PRIORITIES).optional(),
      importance: z.coerce.number().int().min(1).max(5).optional(),
      dueDate: optDay,
      ownerId: optId,
      eventId: optId,
      vendorId: optId,
    }),
  }),
  capability({
    action: "task.bulkUpdate",
    area: "tasks",
    permission: "tasks.edit",
    hint:
      "The same change across several tasks — reassigning a batch, pushing a set of dates. " +
      "{taskIds: []} plus any of status, priority, ownerId, dueDate.",
    schema: z.object({
      taskIds: z.array(id).min(1).max(100),
      status: z.enum(TASK_STATUS).optional(),
      priority: z.enum(PRIORITIES).optional(),
      ownerId: optId,
      dueDate: optDay,
    }),
  }),
  capability({
    action: "task.archive",
    area: "tasks",
    permission: "tasks.edit",
    hint: "Remove a task. {taskId}",
    schema: z.object({ taskId: id }),
  }),
  capability({
    action: "task.comment",
    area: "tasks",
    permission: "tasks.edit",
    hint: "Leave a note on a task, visible to whoever owns it. {taskId, body}",
    schema: z.object({ taskId: id, body: text.max(2000) }),
  }),

  // ── Vendors ───────────────────────────────────────────────────────────────
  capability({
    action: "vendor.status",
    area: "vendors",
    permission: "vendors.edit",
    hint: "Move a vendor along. {vendorId, status}",
    schema: z.object({ vendorId: id, status: z.enum(VENDOR_STATUS) }),
    planned: (a) => ({
      type: "vendor.status",
      vendorId: String(a.vendorId),
      status: a.status as (typeof VENDOR_STATUS)[number],
    }),
  }),
  capability({
    action: "vendor.quote",
    area: "vendors",
    permission: "vendors.edit",
    hint: "Record a quoted figure. {vendorId, amount}",
    schema: z.object({ vendorId: id, amount: money }),
    planned: (a) => ({
      type: "vendor.quote",
      vendorId: String(a.vendorId),
      amount: Number(a.amount),
    }),
  }),
  capability({
    action: "vendor.create",
    area: "vendors",
    permission: "vendors.edit",
    hint:
      "Add a vendor. {businessName, category} plus optional status, contactName, phone, email, website, " +
      "city, quoteAmount, currency, notes, eventIds.",
    schema: z.object({
      businessName: text.max(160),
      category: z.string().min(1),
      status: z.enum(VENDOR_STATUS).optional(),
      contactName: optText,
      phone: optText,
      email: optText,
      website: optText,
      city: optText,
      packageInfo: optText,
      notes: optText,
      currency,
      quoteAmount: optMoney,
      eventIds: z.array(id).max(20).optional(),
    }),
  }),
  capability({
    action: "vendor.update",
    area: "vendors",
    permission: "vendors.edit",
    hint:
      "Edit a vendor. {vendorId} plus any of businessName, contactName, phone, email, website, city, " +
      "rating, packageInfo, notes, negotiatedAmount, contractedAmount, depositAmount.",
    schema: z.object({
      vendorId: id,
      businessName: text.max(160).optional(),
      contactName: optText,
      phone: optText,
      email: optText,
      website: optText,
      city: optText,
      rating: z.coerce.number().int().min(1).max(5).optional(),
      packageInfo: optText,
      notes: optText,
      negotiatedAmount: optMoney,
      contractedAmount: optMoney,
      depositAmount: optMoney,
    }),
  }),
  capability({
    action: "vendor.select",
    area: "vendors",
    permission: "vendors.edit",
    hint:
      "Choose this vendor for their category — moves them to SELECTED and rejects the rest. {vendorId, reason}",
    schema: z.object({ vendorId: id, reason: optText }),
  }),
  capability({
    action: "vendor.archive",
    area: "vendors",
    permission: "vendors.edit",
    hint: "Drop a vendor from the shortlist. {vendorId}",
    schema: z.object({ vendorId: id }),
  }),
  capability({
    action: "vendor.interaction",
    area: "vendors",
    permission: "vendors.edit",
    hint:
      "Log a call, meeting, email, site visit or note against a vendor. " +
      "{vendorId, summary} plus optional kind (NOTE|CALL|MEETING|EMAIL|SITE_VISIT).",
    schema: z.object({
      vendorId: id,
      kind: z.enum(["NOTE", "CALL", "MEETING", "EMAIL", "SITE_VISIT"]).optional(),
      summary: text.max(1000),
    }),
  }),
  capability({
    action: "vendor.contract",
    area: "vendors",
    permission: "vendors.edit",
    hint:
      "Record a contract. {vendorId, title, amount} plus optional currency, " +
      "status (DRAFT|SENT|SIGNED|EXPIRED|CANCELLED), signedDate, expiryDate.",
    schema: z.object({
      vendorId: id,
      title: text.max(200),
      amount: money,
      currency,
      status: z.enum(["DRAFT", "SENT", "SIGNED", "EXPIRED", "CANCELLED"]).optional(),
      signedDate: optDay,
      expiryDate: optDay,
    }),
  }),

  // ── Money ─────────────────────────────────────────────────────────────────
  capability({
    action: "budgetItem.update",
    area: "budget",
    permission: "budget.edit",
    hint:
      "Change a budget line. {itemId, patch:{…}} — patch takes allocatedAmount, estimateAmount, " +
      "quoteAmount, negotiatedAmount, contractedAmount, name, notes.",
    schema: z.object({ itemId: id, patch: z.record(z.string(), z.unknown()) }),
    planned: (a) => ({
      type: "budgetItem.update",
      itemId: String(a.itemId),
      patch: (a.patch ?? {}) as never,
    }),
  }),
  capability({
    action: "budgetItem.create",
    area: "budget",
    permission: "budget.edit",
    hint:
      "Add a budget line. {name, categoryId} plus optional costModel (FIXED|PER_GUEST|PER_UNIT), " +
      "allocatedAmount, estimateAmount, unitRate, eventId, vendorId, currency, notes.",
    schema: z.object({
      name: text.max(160),
      categoryId: id,
      costModel: z.string().optional(),
      guestBasis: z.string().optional(),
      allocatedAmount: optMoney,
      estimateAmount: optMoney,
      unitRate: optMoney,
      unitQuantity: optMoney,
      eventId: optId,
      vendorId: optId,
      currency,
      description: optText,
      notes: optText,
    }),
  }),
  capability({
    action: "budgetItem.archive",
    area: "budget",
    permission: "budget.edit",
    hint: "Remove a budget line. {itemId}",
    schema: z.object({ itemId: id }),
  }),
  capability({
    action: "budgetCategory.create",
    area: "budget",
    permission: "budget.edit",
    hint: "Add a budget category. {name} plus optional allocatedAmount, accentTone.",
    schema: z.object({ name: text.max(120), allocatedAmount: optMoney, accentTone: optText }),
  }),
  capability({
    action: "budgetCategory.update",
    area: "budget",
    permission: "budget.edit",
    hint: "Rename a category or change its allocation. {categoryId} plus name and/or allocatedAmount.",
    schema: z.object({
      categoryId: id,
      name: text.max(120).optional(),
      allocatedAmount: optMoney,
    }),
  }),
  capability({
    action: "payment.create",
    area: "budget",
    permission: "budget.edit",
    hint:
      "Schedule a payment. {label, amount, dueDate} plus optional currency, vendorId, budgetItemId, " +
      "payerId, status (UPCOMING|DUE|PAID|OVERDUE), method, reference, notes.",
    schema: z.object({
      label: text.max(160),
      amount: money,
      dueDate: day,
      currency,
      vendorId: optId,
      budgetItemId: optId,
      payerId: optId,
      status: z.string().optional(),
      method: optText,
      reference: optText,
      notes: optText,
    }),
  }),
  capability({
    action: "payment.update",
    area: "budget",
    permission: "budget.edit",
    hint: "Change a payment. {paymentId} plus any of label, amount, dueDate, paidDate, status, notes.",
    schema: z.object({
      paymentId: id,
      label: text.max(160).optional(),
      amount: optMoney,
      dueDate: optDay,
      paidDate: optDay,
      status: z.string().optional(),
      notes: optText,
    }),
  }),
  capability({
    action: "payment.markPaid",
    area: "budget",
    permission: "budget.edit",
    hint: "Mark a payment paid. {paymentId}",
    schema: z.object({ paymentId: id }),
  }),
  capability({
    action: "payment.archive",
    area: "budget",
    permission: "budget.edit",
    hint: "Remove a scheduled payment. {paymentId}",
    schema: z.object({ paymentId: id }),
  }),

  // ── The run of show ───────────────────────────────────────────────────────
  capability({
    action: "timeline.create",
    area: "timeline",
    permission: "timeline.edit",
    hint:
      "Add a run-of-show entry. {title, date, startMinute, endMinute} plus optional eventId, location, " +
      "ownerId, vendorId, participants[], notes, status.",
    schema: z.object({
      title: text.max(160),
      date: day,
      startMinute: minute,
      endMinute: minute,
      eventId: optId,
      location: optText,
      ownerId: optId,
      vendorId: optId,
      participants: z.array(text).max(30).optional(),
      notes: optText,
      status: z.string().optional(),
    }),
  }),
  capability({
    action: "timeline.update",
    area: "timeline",
    permission: "timeline.edit",
    hint:
      "Change a run-of-show entry. {entryId} plus any of title, date, startMinute, endMinute, " +
      "location, ownerId, vendorId, notes, status.",
    schema: z.object({
      entryId: id,
      title: text.max(160).optional(),
      date: optDay,
      startMinute: minute.optional(),
      endMinute: minute.optional(),
      location: optText,
      ownerId: optId,
      vendorId: optId,
      notes: optText,
      status: z.string().optional(),
    }),
  }),
  capability({
    action: "timeline.archive",
    area: "timeline",
    permission: "timeline.edit",
    hint: "Remove a run-of-show entry. {entryId}",
    schema: z.object({ entryId: id }),
  }),

  // ── On the ground ─────────────────────────────────────────────────────────
  capability({
    action: "responsibility.create",
    area: "logistics",
    permission: "logistics.edit",
    hint:
      "Put somebody in charge of something on the day. {title, area} plus optional ownerId, backupId, " +
      "eventId, dueDate, importance 1-5, notes.",
    schema: z.object({
      title: text.max(200),
      area: text.max(60),
      ownerId: optId,
      backupId: optId,
      eventId: optId,
      dueDate: optDay,
      importance: z.coerce.number().int().min(1).max(5).optional(),
      notes: optText,
    }),
  }),
  capability({
    action: "responsibility.update",
    area: "logistics",
    permission: "logistics.edit",
    hint: "Change a responsibility. {responsibilityId} plus any of title, area, ownerId, backupId, dueDate, notes.",
    schema: z.object({
      responsibilityId: id,
      title: text.max(200).optional(),
      area: text.max(60).optional(),
      ownerId: optId,
      backupId: optId,
      eventId: optId,
      dueDate: optDay,
      importance: z.coerce.number().int().min(1).max(5).optional(),
      notes: optText,
    }),
  }),
  capability({
    action: "responsibility.delete",
    area: "logistics",
    permission: "logistics.edit",
    hint: "Remove a responsibility. {responsibilityId}",
    schema: z.object({ responsibilityId: id }),
  }),
  capability({
    action: "travel.create",
    area: "logistics",
    permission: "logistics.edit",
    hint:
      "Record a guest's journey. {guestId, direction: ARRIVAL|DEPARTURE, scheduledAt ISO datetime} " +
      "plus optional mode, carrier, serviceNumber, hub, pickupRequired.",
    schema: z.object({
      guestId: id,
      direction: z.enum(["ARRIVAL", "DEPARTURE"]),
      scheduledAt: text,
      mode: z.string().optional(),
      carrier: optText,
      serviceNumber: optText,
      hub: optText,
      pickupRequired: flag.optional(),
    }),
  }),
  capability({
    action: "travel.update",
    area: "logistics",
    permission: "logistics.edit",
    hint: "Change a journey. {travelId} plus any of scheduledAt, carrier, serviceNumber, hub, mode, pickupRequired.",
    schema: z.object({
      travelId: id,
      direction: z.enum(["ARRIVAL", "DEPARTURE"]).optional(),
      scheduledAt: text.optional(),
      mode: z.string().optional(),
      carrier: optText,
      serviceNumber: optText,
      hub: optText,
      pickupRequired: flag.optional(),
    }),
  }),
  capability({
    action: "vehicle.create",
    area: "logistics",
    permission: "logistics.edit",
    hint:
      "Add a vehicle to the fleet. {label, capacity} plus optional vehicleType " +
      "(Sedan|SUV|Van|Minibus|Coach|Boat), driverName, driverPhone, notes.",
    schema: z.object({
      label: text.max(120),
      capacity: z.coerce.number().int().min(1).max(200),
      vehicleType: z.enum(["Sedan", "SUV", "Van", "Minibus", "Coach", "Boat"]).optional(),
      driverName: optText,
      driverPhone: optText,
      notes: optText,
    }),
  }),
  capability({
    action: "vehicle.archive",
    area: "logistics",
    permission: "logistics.edit",
    hint: "Take a vehicle off the fleet. {vehicleId}",
    schema: z.object({ vehicleId: id }),
  }),
  capability({
    action: "journey.create",
    area: "logistics",
    permission: "logistics.edit",
    hint:
      "Plan a transport run. {purpose, date, startMinute, endMinute} plus optional vehicleId, eventId, " +
      "fromLocation, toLocation, passengerIds[], notes.",
    schema: z.object({
      purpose: text.max(160),
      date: day,
      startMinute: minute,
      endMinute: minute,
      vehicleId: optId,
      eventId: optId,
      fromLocation: optText,
      toLocation: optText,
      passengerIds: z.array(id).max(200).optional(),
      notes: optText,
    }),
  }),
  capability({
    action: "journey.update",
    area: "logistics",
    permission: "logistics.edit",
    hint:
      "Change a run. {journeyId} plus any of purpose, date, startMinute, endMinute, vehicleId, " +
      "fromLocation, toLocation, passengerIds[] (replaces the list), notes.",
    schema: z.object({
      journeyId: id,
      purpose: text.max(160).optional(),
      date: optDay,
      startMinute: minute.optional(),
      endMinute: minute.optional(),
      vehicleId: optId,
      eventId: optId,
      fromLocation: optText,
      toLocation: optText,
      passengerIds: z.array(id).max(200).optional(),
      notes: optText,
    }),
  }),
  capability({
    action: "journey.delete",
    area: "logistics",
    permission: "logistics.edit",
    hint: "Cancel a transport run. {journeyId}",
    schema: z.object({ journeyId: id }),
  }),
  capability({
    action: "travel.pickup",
    area: "logistics",
    permission: "logistics.edit",
    hint:
      "Put somebody's arrival on a run, or take it off one. {travelId, journeyId} — journeyId null to unassign.",
    schema: z.object({ travelId: id, journeyId: z.string().nullable() }),
  }),
  capability({
    action: "travel.delete",
    area: "logistics",
    permission: "logistics.edit",
    hint: "Remove a journey. {travelId}",
    schema: z.object({ travelId: id }),
  }),

  // ── Clothes ───────────────────────────────────────────────────────────────
  capability({
    action: "outfit.create",
    area: "wardrobe",
    permission: "wardrobe.edit",
    hint:
      "Add an outfit. {personId, outfitType} plus optional eventId, designer, vendorId, cost, currency, " +
      "status, orderDate, deliveryDate, notes.",
    schema: z.object({
      personId: id,
      outfitType: text.max(120),
      eventId: optId,
      designer: optText,
      vendorId: optId,
      cost: optMoney,
      currency,
      status: z.string().optional(),
      orderDate: optDay,
      deliveryDate: optDay,
      notes: optText,
    }),
  }),
  capability({
    action: "outfit.update",
    area: "wardrobe",
    permission: "wardrobe.edit",
    hint: "Change an outfit. {outfitId} plus any of outfitType, designer, cost, status, orderDate, deliveryDate, notes.",
    schema: z.object({
      outfitId: id,
      outfitType: text.max(120).optional(),
      designer: optText,
      cost: optMoney,
      currency,
      status: z.string().optional(),
      orderDate: optDay,
      deliveryDate: optDay,
      notes: optText,
    }),
  }),
  capability({
    action: "fitting.create",
    area: "wardrobe",
    permission: "wardrobe.edit",
    hint:
      "Book a fitting. {outfitId, scheduledAt ISO datetime} plus optional kind (FIRST|SECOND|FINAL|TRIAL), " +
      "location, notes.",
    schema: z.object({
      outfitId: id,
      scheduledAt: text,
      kind: z.enum(["FIRST", "SECOND", "FINAL", "TRIAL"]).optional(),
      location: optText,
      notes: optText,
    }),
  }),
  capability({
    action: "fitting.complete",
    area: "wardrobe",
    permission: "wardrobe.edit",
    hint: "Mark a fitting done. {fittingId}",
    schema: z.object({ fittingId: id }),
  }),
  capability({
    action: "jewellery.create",
    area: "wardrobe",
    permission: "wardrobe.edit",
    hint:
      "Add a piece of jewellery. {name} plus optional personId, eventId, ownership " +
      "(OWNED|PURCHASED|RENTED|BORROWED), jeweller, cost, currency, pickupDate, returnDate, notes.",
    schema: z.object({
      name: text.max(160),
      personId: optId,
      eventId: optId,
      ownership: z.enum(["OWNED", "PURCHASED", "RENTED", "BORROWED"]).optional(),
      jeweller: optText,
      cost: optMoney,
      currency,
      pickupDate: optDay,
      returnDate: optDay,
      notes: optText,
    }),
  }),
];

const byAction = new Map(CAPABILITIES.map((entry) => [entry.action, entry]));

export function findCapability(action: string): AiCapability | null {
  return byAction.get(action) ?? null;
}

/** Every action name, for the tool schema's enum. */
export function capabilityActions(): string[] {
  return CAPABILITIES.map((entry) => entry.action);
}

/**
 * The catalogue as the model reads it, grouped by area and filtered to what
 * this person could do by hand. Generated rather than written out, so a new
 * capability is described the moment it is added.
 */
export function capabilityCatalogue(has: (permission: Permission) => boolean): string {
  const areas = new Map<CapabilityArea, string[]>();
  for (const entry of CAPABILITIES) {
    if (!has(entry.permission)) continue;
    const lines = areas.get(entry.area) ?? [];
    lines.push(`  ${entry.action} — ${entry.hint}`);
    areas.set(entry.area, lines);
  }
  return [...areas.entries()]
    .map(([area, lines]) => `${area}:\n${lines.join("\n")}`)
    .join("\n");
}

/** Actions this person is allowed to have proposed at all. */
export function permittedActions(has: (permission: Permission) => boolean): string[] {
  return CAPABILITIES.filter((entry) => has(entry.permission)).map((entry) => entry.action);
}
