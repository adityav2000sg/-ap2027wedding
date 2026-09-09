/**
 * Carrying out an approved proposal.
 *
 * Every executor here is a thin wrapper around the same server action the
 * button in the UI calls — same zod schema, same permission check, same
 * activity entry, same revalidation. Nothing writes to the database directly,
 * so the assistant can never take a shortcut the interface doesn't have.
 *
 * The imports are deliberately inside the functions: this module is a map of
 * closures, so it can be loaded (and tested) without dragging Prisma and the
 * whole action layer along with it.
 *
 * Changes the impact engine models — a moved function, an RSVP, a quote — do
 * not appear here. Those run through `applyChange`, which adds the preview
 * fingerprint, the staleness check and idempotency on top.
 */

export type Executor = (args: Record<string, unknown>) => Promise<void>;

/** Server actions answer with a result object rather than throwing. */
function check(result: { ok: boolean; error?: string }): void {
  if (!result.ok) throw new Error(result.error ?? "That change couldn't be applied.");
}

const str = (value: unknown): string => String(value ?? "");
const maybe = (value: unknown): string | undefined =>
  value === undefined || value === null || value === "" ? undefined : String(value);

/**
 * Drops the key that names the record, leaving the patch. Every capability
 * takes its id under a readable name (taskId, guestId) while the underlying
 * action wants `id`.
 */
function patch(args: Record<string, unknown>, idKey: string): Record<string, unknown> {
  const { [idKey]: _id, ...rest } = args;
  return rest;
}

export const EXECUTORS: Record<string, Executor> = {
  // ── Functions ─────────────────────────────────────────────────────────────
  "event.create": async (a) => {
    const { createEvent } = await import("@/server/actions/events");
    check(await createEvent(a));
  },
  "event.update": async (a) => {
    const { updateEvent } = await import("@/server/actions/events");
    check(await updateEvent({ id: str(a.eventId), ...patch(a, "eventId") }));
  },
  "event.archive": async (a) => {
    const { archiveEvent } = await import("@/server/actions/events");
    check(await archiveEvent({ id: str(a.eventId) }));
  },

  // ── Guests ────────────────────────────────────────────────────────────────
  "guest.create": async (a) => {
    const { createGuest } = await import("@/server/actions/guests");
    check(await createGuest(a));
  },
  "guest.update": async (a) => {
    const { updateGuest } = await import("@/server/actions/guests");
    check(await updateGuest({ id: str(a.guestId), ...patch(a, "guestId") }));
  },
  "guest.archive": async (a) => {
    const { archiveGuest } = await import("@/server/actions/guests");
    check(await archiveGuest(str(a.guestId)));
  },
  "guest.attendance": async (a) => {
    const { setGuestAttendance } = await import("@/server/actions/guests");
    check(await setGuestAttendance(str(a.guestId), a.status as "CONFIRMED"));
  },
  "guest.saveTheDate": async (a) => {
    const { setGuestStdResponse } = await import("@/server/actions/guests");
    check(
      await setGuestStdResponse(
        str(a.guestId),
        a.response === null ? null : (a.response as "YES" | "NO"),
      ),
    );
  },
  "guest.tier": async (a) => {
    const { setGuestTier } = await import("@/server/actions/guests");
    check(await setGuestTier(str(a.guestId), a.tier as "A"));
  },
  "guest.room": async (a) => {
    const { setGuestRoom } = await import("@/server/actions/logistics");
    check(
      await setGuestRoom(
        str(a.guestId),
        a.roomNumber === null ? null : str(a.roomNumber),
        maybe(a.hotelId),
      ),
    );
  },
  "guests.bulkRsvp": async (a) => {
    const { bulkSetRsvp } = await import("@/server/actions/guests");
    check(await bulkSetRsvp({ guestIds: a.guestIds, eventId: a.eventId, status: a.status }));
  },

  // ── Households, sends and replies ─────────────────────────────────────────
  "household.create": async (a) => {
    const { createHousehold } = await import("@/server/actions/guests");
    check(await createHousehold(a));
  },
  "household.tier": async (a) => {
    const { setHouseholdTier } = await import("@/server/actions/guests");
    check(await setHouseholdTier(str(a.householdId), a.tier as "A"));
  },
  "household.send": async (a) => {
    const { setHouseholdSend } = await import("@/server/actions/guests");
    check(
      await setHouseholdSend(
        str(a.householdId),
        a.which as "saveTheDate",
        Boolean(a.sent),
      ),
    );
  },
  "guest.send": async (a) => {
    const { setGuestSend } = await import("@/server/actions/guests");
    check(await setGuestSend(str(a.guestId), a.which as "saveTheDate", Boolean(a.sent)));
  },
  "household.reply": async (a) => {
    const { setHouseholdReply } = await import("@/server/actions/guests");
    check(await setHouseholdReply(str(a.householdId), a.reply as "YES"));
  },
  "guest.contact": async (a) => {
    const { setGuestContact } = await import("@/server/actions/guests");
    check(await setGuestContact(str(a.guestId), a.field as "phone", str(a.value)));
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────
  "task.create": async (a) => {
    const { createTask } = await import("@/server/actions/tasks");
    check(await createTask(a));
  },
  "task.update": async (a) => {
    const { updateTask } = await import("@/server/actions/tasks");
    check(await updateTask({ id: str(a.taskId), ...patch(a, "taskId") }));
  },
  "task.bulkUpdate": async (a) => {
    const { bulkUpdateTasks } = await import("@/server/actions/tasks");
    check(await bulkUpdateTasks({ ids: a.taskIds, ...patch(a, "taskIds") }));
  },
  "task.archive": async (a) => {
    const { archiveTask } = await import("@/server/actions/tasks");
    check(await archiveTask(str(a.taskId)));
  },
  "task.comment": async (a) => {
    const { addTaskComment } = await import("@/server/actions/tasks");
    check(await addTaskComment({ taskId: str(a.taskId), body: str(a.body) }));
  },

  // ── Vendors ───────────────────────────────────────────────────────────────
  "vendor.create": async (a) => {
    const { createVendor } = await import("@/server/actions/vendors");
    check(await createVendor(a));
  },
  "vendor.update": async (a) => {
    const { updateVendor } = await import("@/server/actions/vendors");
    check(await updateVendor({ id: str(a.vendorId), ...patch(a, "vendorId") }));
  },
  "vendor.select": async (a) => {
    const { selectVendor } = await import("@/server/actions/vendors");
    check(await selectVendor(str(a.vendorId), maybe(a.reason)));
  },
  "vendor.archive": async (a) => {
    const { archiveVendor } = await import("@/server/actions/vendors");
    check(await archiveVendor(str(a.vendorId)));
  },
  "vendor.interaction": async (a) => {
    const { logVendorInteraction } = await import("@/server/actions/vendors");
    check(await logVendorInteraction(a));
  },
  "vendor.contract": async (a) => {
    const { upsertContract } = await import("@/server/actions/vendors");
    check(await upsertContract(a));
  },

  // ── Money ─────────────────────────────────────────────────────────────────
  "budgetItem.create": async (a) => {
    const { createBudgetItem } = await import("@/server/actions/budget");
    check(await createBudgetItem(a));
  },
  "budgetItem.archive": async (a) => {
    const { archiveBudgetItem } = await import("@/server/actions/budget");
    check(await archiveBudgetItem(str(a.itemId)));
  },
  "budgetCategory.create": async (a) => {
    const { createBudgetCategory } = await import("@/server/actions/budget");
    check(await createBudgetCategory(a));
  },
  "budgetCategory.update": async (a) => {
    const { updateBudgetCategory } = await import("@/server/actions/budget");
    check(await updateBudgetCategory({ id: str(a.categoryId), ...patch(a, "categoryId") }));
  },
  "payment.create": async (a) => {
    const { createPayment } = await import("@/server/actions/budget");
    check(await createPayment(a));
  },
  "payment.update": async (a) => {
    const { updatePayment } = await import("@/server/actions/budget");
    check(await updatePayment({ id: str(a.paymentId), ...patch(a, "paymentId") }));
  },
  "payment.markPaid": async (a) => {
    const { markPaymentPaid } = await import("@/server/actions/budget");
    check(await markPaymentPaid(str(a.paymentId)));
  },
  "payment.archive": async (a) => {
    const { archivePayment } = await import("@/server/actions/budget");
    check(await archivePayment(str(a.paymentId)));
  },

  // ── The run of show ───────────────────────────────────────────────────────
  "timeline.create": async (a) => {
    const { createTimelineEntry } = await import("@/server/actions/timeline");
    check(await createTimelineEntry(a));
  },
  "timeline.update": async (a) => {
    const { updateTimelineEntry } = await import("@/server/actions/timeline");
    check(await updateTimelineEntry({ id: str(a.entryId), ...patch(a, "entryId") }));
  },
  "timeline.archive": async (a) => {
    const { archiveTimelineEntry } = await import("@/server/actions/timeline");
    check(await archiveTimelineEntry({ id: str(a.entryId) }));
  },

  // ── On the ground ─────────────────────────────────────────────────────────
  "responsibility.create": async (a) => {
    const { createResponsibility } = await import("@/server/actions/logistics");
    check(await createResponsibility(a));
  },
  "responsibility.update": async (a) => {
    const { updateResponsibility } = await import("@/server/actions/logistics");
    check(
      await updateResponsibility({
        id: str(a.responsibilityId),
        ...patch(a, "responsibilityId"),
      }),
    );
  },
  "responsibility.delete": async (a) => {
    const { deleteResponsibility } = await import("@/server/actions/logistics");
    check(await deleteResponsibility(str(a.responsibilityId)));
  },
  "travel.create": async (a) => {
    const { createTravel } = await import("@/server/actions/logistics");
    check(await createTravel(a));
  },
  "travel.update": async (a) => {
    const { updateTravel } = await import("@/server/actions/logistics");
    check(await updateTravel({ id: str(a.travelId), ...patch(a, "travelId") }));
  },
  "travel.delete": async (a) => {
    const { deleteTravel } = await import("@/server/actions/logistics");
    check(await deleteTravel(str(a.travelId)));
  },
  "travel.pickup": async (a) => {
    const { setTravelJourney } = await import("@/server/actions/logistics");
    check(
      await setTravelJourney(
        str(a.travelId),
        a.journeyId === null ? null : str(a.journeyId),
      ),
    );
  },
  "vehicle.create": async (a) => {
    const { createVehicle } = await import("@/server/actions/logistics");
    check(await createVehicle(a));
  },
  "vehicle.archive": async (a) => {
    const { archiveVehicle } = await import("@/server/actions/logistics");
    check(await archiveVehicle(str(a.vehicleId)));
  },
  "journey.create": async (a) => {
    const { createJourney } = await import("@/server/actions/logistics");
    check(await createJourney(a));
  },
  "journey.update": async (a) => {
    const { updateJourney } = await import("@/server/actions/logistics");
    check(await updateJourney({ id: str(a.journeyId), ...patch(a, "journeyId") }));
  },
  "journey.delete": async (a) => {
    const { deleteJourney } = await import("@/server/actions/logistics");
    check(await deleteJourney(str(a.journeyId)));
  },

  // ── Clothes ───────────────────────────────────────────────────────────────
  "outfit.create": async (a) => {
    const { createOutfit } = await import("@/server/actions/wardrobe");
    check(await createOutfit(a));
  },
  "outfit.update": async (a) => {
    const { updateOutfit } = await import("@/server/actions/wardrobe");
    check(await updateOutfit({ id: str(a.outfitId), ...patch(a, "outfitId") }));
  },
  "fitting.create": async (a) => {
    const { createFitting } = await import("@/server/actions/wardrobe");
    check(await createFitting(a));
  },
  "fitting.complete": async (a) => {
    const { completeFitting } = await import("@/server/actions/wardrobe");
    check(await completeFitting(str(a.fittingId)));
  },
  "jewellery.create": async (a) => {
    const { createJewellery } = await import("@/server/actions/wardrobe");
    check(await createJewellery(a));
  },
};
