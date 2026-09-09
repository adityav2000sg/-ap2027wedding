import "server-only";

/**
 * The AI's view of the wedding.
 *
 * Deliberately *not* database access. The model gets a fixed set of read
 * functions that run through the same domain engines the UI uses, so it can
 * never see something the viewer couldn't, and can never read a number that
 * disagrees with the screen.
 *
 * Mutations are not exposed here at all — the model proposes them as structured
 * actions from the capability registry, and a human approves before anything is
 * written. What this file owes those proposals is ids: every change names the
 * record it acts on, so `find_records` exists to turn "Anil Ahuja" or "the Bali
 * caterer" into something a proposal can be built from.
 */

import { buildBudgetView, paymentsByPayer } from "@/domain/budget";
import { computeGuestCounts, roomsContracted, roomsRequired } from "@/domain/guests";
import { VENDOR_CATEGORY_LABEL, VENDOR_STATUS_TEXT } from "@/domain/impact";
import { computeEventReadiness, computeWeddingReadiness } from "@/domain/readiness";
import { computeAlerts } from "@/domain/risk";
import { outreachByTier, outreachRows, outreachStats } from "@/domain/outreach";
import { analyseTasks, nextBestActions, overdueTasks } from "@/domain/tasks";
import { detectConflicts, snapshotEventVenues } from "@/domain/timeline";
import { daysBetween, formatMediumDate, formatMinute } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { WeddingSnapshot } from "@/domain/types";
import { db } from "@/server/db";
import type { Viewer } from "@/server/permissions";
import type { ToolDefinition } from "./qwen";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_overview",
      description:
        "The wedding at a glance: dates, days remaining, readiness score and what is holding it back, guest counts and headline budget figures. Start here for broad questions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_attention_list",
      description:
        "Everything currently flagged as needing attention, most severe first — overdue payments, unsigned contracts, capacity problems, missing owners.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tasks",
      description:
        "Planning tasks. Use the filter to narrow to what matters: 'overdue', 'next' (highest-leverage things to do now), 'blocked', or 'unassigned'.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["overdue", "next", "blocked", "unassigned"],
            description: "Which slice of the task list to return.",
          },
          limit: { type: "number", description: "How many to return. Default 15." },
        },
        required: ["filter"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budget",
      description:
        "Full financial picture: totals, every category with its allocation, forecast and variance, and which lines recalculate with guest numbers.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payments",
      description:
        "Payments — what has been paid, what is scheduled, what is overdue, and who is paying for what.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_vendors",
      description:
        "Vendors and where each one has got to. Optionally filter by category (VENUE, CATERING, PHOTOGRAPHY, DECOR, …).",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Optional vendor category filter." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_guests",
      description:
        "Guest list summary: counts by RSVP state, per-event attendance, dietary requirements, accommodation and transport needs.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_events",
      description:
        "Each function with its date, venue, readiness, guest numbers and what is holding it back.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_logistics",
      description:
        "Rooms needed versus rooms held, airport pickups, transport, and responsibilities that have no owner.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_run_of_show",
      description:
        "The minute-by-minute schedule and any scheduling conflicts detected in it.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_wardrobe_and_media",
      description:
        "Outfits and their status per person, jewellery, and what moodboards and documents exist. Metadata only — the model cannot see the images themselves.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_activity",
      description:
        "The changelog: what has actually been changed in this wedding plan recently, who did it and when. Use this for any question about recent changes, what has moved, what someone did, or what happened since a date.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "How many entries to return, newest first. Default 25, max 100.",
          },
          entityType: {
            type: "string",
            description:
              "Optional filter, e.g. 'task', 'guest', 'household', 'vendor', 'budgetItem', 'payment', 'event'.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_invitations",
      description:
        "Save-the-dates, invitations and RSVP replies by household, including which tier (wave) each household is in — A goes out first, B is held back, C is the reserve. Also reports who has personally been messaged. Use for anything about who has been invited, who has replied, or what is left to send.",
      parameters: {
        type: "object",
        properties: {
          tier: { type: "string", description: "Optional: 'A', 'B' or 'C'." },
          onlyOutstanding: {
            type: "boolean",
            description: "Only households still missing a send or a reply.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_people",
      description:
        "The family members who have accounts, what each is responsible for, and how many open and overdue tasks each is carrying. Use for questions about who is doing what, workload, or who to ask.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "simulate_guest_count",
      description:
        "Work out what would happen to the budget and logistics if the expected guest count changed. Use this for 'what if we invite another 50 people' questions.",
      parameters: {
        type: "object",
        properties: {
          estimatedGuests: {
            type: "number",
            description: "The new total guest estimate to model.",
          },
        },
        required: ["estimatedGuests"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_records",
      description:
        "Look up records by name and get their ids. Use this before proposing any change — every change " +
        "names the thing it acts on, and ids can never be guessed. Searches guests, households, events, " +
        "venues, vendors, tasks, people (planning team), budget categories and lines, payments, run-of-show " +
        "entries, hotels, outfits, wardrobe people and responsibilities.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Part of a name — 'Ahuja', 'sangeet', 'caterer'. Leave empty to list everything of a type.",
          },
          type: {
            type: "string",
            enum: [
              "guest", "household", "event", "venue", "vendor", "task", "member",
              "budgetCategory", "budgetItem", "payment", "timeline", "hotel",
              "outfit", "wardrobePerson", "responsibility",
            ],
            description: "Which kind of record. Omit to search every kind at once.",
          },
          limit: { type: "number", description: "How many to return. Default 12, max 50." },
        },
        required: [],
      },
    },
  },
];

/**
 * Run a tool. Every one is read-only and permission-aware: a Contributor asking
 * about money gets a refusal here, not a filtered answer in the UI.
 */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  snapshot: WeddingSnapshot,
  viewer: Viewer,
): Promise<string> {
  const canSeeMoney = viewer.permissions.has("budget.view");
  const currency = viewer.displayCurrency;
  const tasks = analyseTasks(snapshot);
  const budget = buildBudgetView(snapshot, currency);
  const money = (amount: number) => formatMoney(amount, currency);

  const requireMoney = () => {
    if (!canSeeMoney) {
      throw new Error(
        "This person's account cannot see financial information. Tell them that, and do not speculate about amounts.",
      );
    }
  };

  switch (name) {
    case "get_overview": {
      const readiness = computeWeddingReadiness(snapshot, tasks, budget);
      const counts = budget.drivers.guestCounts;
      const days = daysBetween(snapshot.today, snapshot.wedding.startDate);
      return json({
        couple: `${snapshot.wedding.partnerAName} & ${snapshot.wedding.partnerBName}`,
        dates: `${formatMediumDate(snapshot.wedding.startDate)} – ${formatMediumDate(snapshot.wedding.endDate)}`,
        daysRemaining: days,
        weddingType: snapshot.wedding.weddingType,
        destinationStatus:
          snapshot.events.every((e) => !e.venueId)
            ? "No venue confirmed for any function yet — the destination is still being decided."
            : "Venues partly confirmed.",
        candidateLocations: snapshot.wedding.cities,
        readiness: {
          percent: readiness.percent,
          components: readiness.components.map((c) => ({
            area: c.label, score: `${Math.round(c.score * 100)}%`, summary: c.summary,
          })),
          topBlockers: readiness.blockers.slice(0, 6).map((b) => ({
            what: b.label, detail: b.detail, costingPercentPoints: b.pointsCost,
          })),
        },
        guests: {
          onTheList: counts.total,
          invited: counts.invited,
          confirmed: counts.confirmed,
          awaitingReply: counts.pending,
          declined: counts.declined,
          // Two different numbers that are easy to conflate:
          storedPlanningEstimate: snapshot.wedding.estimatedGuests,
          headcountDrivingForecastsNow: counts.confirmed + counts.pending,
          note:
            "storedPlanningEstimate is the manually-set assumption used only where no RSVP data exists. " +
            "headcountDrivingForecastsNow is what per-guest budget lines actually multiply by today. " +
            "Changing the stored estimate does NOT change forecasts that already have real guest data.",
        },
        ...(canSeeMoney
          ? {
              budget: {
                currency,
                total: money(budget.finance.totalBudget),
                forecast: money(budget.finance.forecast),
                variance: money(budget.finance.variance),
                overBudget: budget.finance.isOverBudget,
                contracted: money(budget.finance.committed),
                paid: money(budget.finance.paid),
              },
            }
          : { budget: "Hidden — this person cannot see financial information." }),
      });
    }

    case "get_attention_list": {
      const alerts = computeAlerts(snapshot, tasks, budget)
        .filter((a) => canSeeMoney || a.group !== "money");
      return json({
        count: alerts.length,
        alerts: alerts.slice(0, 20).map((a) => ({
          severity: a.severity, area: a.group, title: a.title, detail: a.detail,
        })),
      });
    }

    case "get_tasks": {
      const filter = String(args.filter ?? "next");
      const limit = Math.min(Number(args.limit ?? 15), 40);
      const memberById = new Map(snapshot.members.map((m) => [m.id, m.name]));
      const eventById = new Map(snapshot.events.map((e) => [e.id, e.name]));

      let selection = tasks;
      if (filter === "overdue") selection = overdueTasks(tasks);
      else if (filter === "next") selection = nextBestActions(tasks, limit);
      else if (filter === "blocked") selection = tasks.filter((t) => t.isBlocked && !t.isDone);
      else if (filter === "unassigned") {
        selection = tasks.filter((t) => !t.ownerId && !t.isDone && t.importance >= 3);
      }

      return json({
        filter,
        totalMatching: selection.length,
        tasks: selection.slice(0, limit).map((t) => ({
          id: t.id,
          title: t.title,
          area: t.area,
          event: t.eventId ? eventById.get(t.eventId) : null,
          status: t.status,
          due: t.dueDate ? formatMediumDate(new Date(t.dueDate)) : null,
          daysLate: t.isOverdue ? t.daysLate : 0,
          owner: t.ownerId ? memberById.get(t.ownerId) : "nobody yet",
          importance: t.importance,
          unblocks: t.downstreamCount,
          waitingOn: t.blockedBy.map((b) => b.title),
        })),
      });
    }

    case "get_budget": {
      requireMoney();
      return json({
        currency,
        totals: {
          budget: money(budget.finance.totalBudget),
          forecast: money(budget.finance.forecast),
          variance: money(budget.finance.variance),
          contracted: money(budget.finance.committed),
          paid: money(budget.finance.paid),
          stillToPay: money(budget.finance.remainingPayable),
          contingencyLeft: money(budget.finance.contingencyRemaining),
        },
        categories: budget.categories.map((c) => ({
          name: c.name,
          allocated: money(c.allocated),
          forecast: money(c.forecast),
          variance: money(c.variance),
          overBy: c.variance > 0 ? money(c.variance) : null,
          lines: c.items.map((i) => ({
            name: i.name,
            forecast: money(i.forecast),
            basedOn: i.explanation,
            recalculatesWithGuestNumbers: i.isVariable,
          })),
        })),
        driversThatMoveTheseNumbers: {
          guestsUsedInForecast:
            budget.drivers.guestCounts.confirmed + budget.drivers.guestCounts.pending,
          roomsNeeded: budget.drivers.rooms,
          households: budget.drivers.households,
        },
      });
    }

    case "get_payments": {
      requireMoney();
      const vendorById = new Map(snapshot.vendors.map((v) => [v.id, v.businessName]));
      return json({
        currency,
        byPayer: paymentsByPayer(snapshot, budget.converter).map((p) => ({
          who: p.name, paid: money(p.paid), scheduled: money(p.upcoming),
        })),
        payments: snapshot.payments.map((p) => ({
          what: p.label,
          vendor: p.vendorId ? vendorById.get(p.vendorId) : null,
          amount: money(budget.converter.toBase(p.amount, p.currency)),
          status: p.status,
          due: formatMediumDate(new Date(p.dueDate)),
          overdue:
            p.status !== "PAID" && p.status !== "CANCELLED" &&
            new Date(p.dueDate) < snapshot.today,
        })),
      });
    }

    case "get_vendors": {
      const category = args.category ? String(args.category).toUpperCase() : null;
      const vendors = snapshot.vendors.filter((v) => !category || v.category === category);
      return json({
        count: vendors.length,
        vendors: vendors.map((v) => ({
          id: v.id,
          name: v.businessName,
          category: VENDOR_CATEGORY_LABEL[v.category] ?? v.category,
          status: VENDOR_STATUS_TEXT[v.status],
          city: v.city,
          rating: v.rating,
          pros: v.pros,
          cons: v.cons,
          ...(canSeeMoney
            ? {
                quote: v.quoteAmount ? formatMoney(v.quoteAmount, v.currency) : null,
                negotiated: v.negotiatedAmount ? formatMoney(v.negotiatedAmount, v.currency) : null,
                contracted: v.contractedAmount ? formatMoney(v.contractedAmount, v.currency) : null,
              }
            : {}),
          attributes: v.attributes,
        })),
        categoriesWithNothingBooked: [
          "VENUE", "CATERING", "PHOTOGRAPHY", "DECOR", "MAKEUP", "PRIEST",
        ].filter(
          (c) =>
            !snapshot.vendors.some(
              (v) => v.category === c && ["CONTRACTED", "ACTIVE", "COMPLETED"].includes(v.status),
            ),
        ),
      });
    }

    case "get_guests": {
      const counts = computeGuestCounts(snapshot);
      return json({
        summary: {
          onTheList: counts.total,
          households: counts.households,
          invited: counts.invited,
          confirmed: counts.confirmed,
          awaitingReply: counts.pending,
          declined: counts.declined,
          notYetInvited: counts.notContacted,
          children: counts.children,
          needAccommodation: counts.needAccommodation,
          needTransport: counts.needTransport,
        },
        dietary: counts.dietary,
        withAllergies: counts.withAllergies,
        withAccessNeeds: counts.withAccessibilityNeeds,
        perEvent: snapshot.events.map((e) => {
          const c = budget.drivers.eventCounts.get(e.id)!;
          return {
            event: e.name, invited: c.invited, confirmed: c.confirmed,
            expected: c.expected, children: c.children,
          };
        }),
      });
    }

    case "get_events": {
      return json({
        events: snapshot.events.map((e) => {
          const c = budget.drivers.eventCounts.get(e.id)!;
          const r = computeEventReadiness(snapshot, e, tasks, budget, c);
          const venue = e.venueId ? snapshot.venues.find((v) => v.id === e.venueId) : null;
          return {
            id: e.id,
            name: e.name,
            date: formatMediumDate(e.date),
            startMinute: e.startMinute,
            endMinute: e.endMinute,
            time: `${formatMinute(e.startMinute)}–${formatMinute(e.endMinute)}`,
            venue: venue?.name ?? "not confirmed",
            readinessPercent: r.percent,
            expectedGuests: c.expected || e.estimatedGuests,
            holdingItBack: r.blockers.slice(0, 4).map((b) => b.label),
            ...(canSeeMoney
              ? { forecast: money(budget.byEvent.get(e.id)?.forecast ?? 0) }
              : {}),
          };
        }),
      });
    }

    case "get_logistics": {
      const pickups = snapshot.travel.filter(
        (t) => t.direction === "ARRIVAL" && t.pickupRequired,
      );
      const housed = new Set(snapshot.stays.map((s) => s.guestId));
      const roomsNeeded = roomsRequired(snapshot);
      const roomsHeld = roomsContracted(snapshot);
      const peopleNeedingARoom = snapshot.guests.filter((g) => g.needsAccommodation).length;

      return json({
        // Units are in the field names on purpose — rooms and people are
        // different quantities and must not be conflated.
        // Rooms and people are kept in separate objects so there is no
        // adjacent field of the wrong unit to reach for.
        how_many_ROOMS: {
          needed: roomsNeeded,
          contracted: roomsHeld,
          short_by: Math.max(0, roomsNeeded - roomsHeld),
          answer_if_asked_about_rooms: `${roomsNeeded} rooms needed, ${roomsHeld} contracted, ${Math.max(0, roomsNeeded - roomsHeld)} short`,
        },
        how_many_PEOPLE: {
          needing_a_bed: peopleNeedingARoom,
          already_in_a_room: snapshot.stays.length,
          not_yet_placed: snapshot.guests.filter(
            (g) => g.needsAccommodation && !housed.has(g.id),
          ).length,
          answer_if_asked_about_people: `${peopleNeedingARoom} people need a bed, ${snapshot.stays.length} are placed`,
        },
        travel: {
          PEOPLE_arriving_who_need_collecting: pickups.length,
          PEOPLE_with_no_vehicle_assigned: pickups.filter((t) => !t.journeyId).length,
          JOURNEYS_planned: snapshot.journeys.length,
          VEHICLES_available: snapshot.vehicles.length,
        },
        responsibilitiesWithNoOwner: snapshot.responsibilities
          .filter((r) => !r.ownerId)
          .map((r) => ({ what: r.title, area: r.area, importance: r.importance })),
      });
    }

    case "get_run_of_show": {
      const conflicts = detectConflicts(snapshot.timeline, snapshot.timelineDeps, {
        vendors: snapshot.vendors,
        venues: snapshot.venues,
        eventVenue: snapshotEventVenues(snapshot),
      });
      const eventById = new Map(snapshot.events.map((e) => [e.id, e.name]));
      return json({
        entries: snapshot.timeline
          .slice()
          .sort((a, b) => a.date.getTime() - b.date.getTime() || a.startMinute - b.startMinute)
          .map((t) => ({
            event: t.eventId ? eventById.get(t.eventId) : null,
            date: formatMediumDate(t.date),
            time: `${formatMinute(t.startMinute)}–${formatMinute(t.endMinute)}`,
            what: t.title,
            location: t.location,
            fixed: t.isLocked,
            status: t.status,
          })),
        conflicts: conflicts.map((c) => ({
          severity: c.severity, what: c.title, detail: c.detail,
        })),
      });
    }

    case "get_wardrobe_and_media": {
      const personById = new Map(snapshot.wardrobePeople.map((p) => [p.id, p.name]));
      const eventById = new Map(snapshot.events.map((e) => [e.id, e.name]));
      return json({
        outfits: snapshot.outfits.map((o) => ({
          person: personById.get(o.personId),
          event: o.eventId ? eventById.get(o.eventId) : null,
          what: o.outfitType,
          status: o.status,
          designer: o.designer,
          fittingsBooked: o.fittings.length,
          fittingsDone: o.fittings.filter((f) => f.completedAt).length,
        })),
        jewellery: snapshot.jewellery.map((j) => ({
          item: j.name,
          person: j.personId ? personById.get(j.personId) : null,
          ownership: j.ownership,
          insured: j.insured,
        })),
        documentsOnFile: snapshot.documents.map((d) => ({
          title: d.title, type: d.kind,
        })),
        note: "Image contents cannot be seen — only this metadata.",
      });
    }

    case "get_recent_activity": {
      // The activity log lives outside the snapshot — it's history, not state —
      // so it's read directly here rather than being carried in every request.
      const limit = Math.min(Math.max(Number(args.limit ?? 25) || 25, 1), 100);
      const entityType =
        typeof args.entityType === "string" && args.entityType.trim()
          ? args.entityType.trim()
          : undefined;

      const entries = await db.activityLog.findMany({
        where: { weddingId: viewer.weddingId, ...(entityType ? { entityType } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { actor: { select: { name: true } } },
      });

      return json({
        note:
          entries.length === 0
            ? "Nothing has been changed yet."
            : `The ${entries.length} most recent changes, newest first.`,
        changes: entries.map((entry) => ({
          when: formatMediumDate(entry.createdAt),
          daysAgo: daysBetween(entry.createdAt, snapshot.today),
          who: entry.actor?.name ?? "The system",
          what: entry.summary,
          area: entry.entityType,
          subject: entry.entityLabel,
          action: entry.action,
          wasUndone: entry.undoneAt !== null,
        })),
      });
    }

    case "get_invitations": {
      const rows = outreachRows(snapshot);
      const stats = outreachStats(snapshot);
      const byTier = outreachByTier(snapshot);

      const tier = typeof args.tier === "string" ? args.tier.toUpperCase() : null;
      const onlyOutstanding = args.onlyOutstanding === true;

      const filtered = rows
        .filter((row) => !tier || row.tier === tier)
        .filter(
          (row) =>
            !onlyOutstanding ||
            !row.saveTheDateSent ||
            !row.invitationSent ||
            row.reply === "AWAITING",
        );

      return json({
        howTiersWork:
          "Tier A gets the first save-the-dates. Tier B is held back until Tier A replies are known. Tier C is the reserve list.",
        overall: {
          households: stats.households,
          HOUSEHOLDS_sentSaveTheDate: stats.stdSent,
          HOUSEHOLDS_sentInvitation: stats.rsvpSent,
          HOUSEHOLDS_repliedYes: stats.yes,
          HOUSEHOLDS_repliedNo: stats.no,
          HOUSEHOLDS_awaiting: stats.awaiting,
          PEOPLE_confirmed: stats.peopleYes,
          PEOPLE_awaiting: stats.peopleAwaiting,
          PEOPLE_personallyMessaged: stats.peopleStdSent,
          responseRatePercent: stats.responseRate,
        },
        byTier,
        households: filtered.slice(0, 120).map((row) => ({
          id: row.householdId,
          name: row.name,
          tier: row.tier,
          PEOPLE_inHousehold: row.headcount,
          saveTheDateSent: row.saveTheDateSent,
          invitationSent: row.invitationSent,
          reply: row.reply,
          PEOPLE_personallyMessaged: row.peopleSaveTheDateSent,
        })),
        truncated: filtered.length > 120 ? filtered.length - 120 : 0,
      });
    }

    case "get_people": {
      return json({
        note: "Task counts are open tasks owned by that person, not tasks they were merely tagged in.",
        people: snapshot.members.map((member) => {
          const owned = tasks.filter((t) => t.ownerId === member.id && !t.isDone);
          return {
            id: member.id,
            name: member.name,
            relation: member.relation,
            TASKS_open: owned.length,
            TASKS_overdue: owned.filter(
              (t) => t.daysUntilDue !== null && t.daysUntilDue < 0,
            ).length,
            TASKS_dueWithin14Days: owned.filter(
              (t) => t.daysUntilDue !== null && t.daysUntilDue >= 0 && t.daysUntilDue <= 14,
            ).length,
            nextUp: owned
              .slice()
              .sort((a, b) => (a.daysUntilDue ?? 9999) - (b.daysUntilDue ?? 9999))
              .slice(0, 3)
              .map((t) => t.title),
          };
        }),
        unassignedOpenTasks: tasks.filter((t) => !t.ownerId && !t.isDone).length,
      });
    }

    case "simulate_guest_count": {
      requireMoney();
      const target = Number(args.estimatedGuests);
      if (!Number.isFinite(target) || target <= 0) {
        throw new Error("estimatedGuests must be a positive number.");
      }

      // Re-run the real forecast engine against a modified snapshot, so the
      // answer is computed by the same code the budget page uses.
      const current =
        budget.drivers.guestCounts.confirmed + budget.drivers.guestCounts.pending;
      const modified: WeddingSnapshot = {
        ...snapshot,
        wedding: { ...snapshot.wedding, estimatedGuests: target },
        events: snapshot.events.map((e) => ({ ...e, estimatedGuests: target })),
        budgetItems: snapshot.budgetItems.map((item) =>
          item.costModel === "PER_GUEST"
            ? { ...item, guestBasis: "ESTIMATED" as const }
            : item,
        ),
      };
      const after = buildBudgetView(modified, currency);
      const roomsAfter = Math.ceil(target / Math.max(1, snapshot.wedding.guestsPerRoom));

      return json({
        THIS_IS_A_HYPOTHETICAL: true,
        actual: {
          storedPlanningEstimate: snapshot.wedding.estimatedGuests,
          headcountDrivingForecastsNow: current,
          forecast: money(budget.finance.forecast),
          roomsNeeded: budget.drivers.rooms,
        },
        hypothetical: {
          guestsModelled: target,
          forecast: money(after.finance.forecast),
          roomsNeeded: roomsAfter,
        },
        difference: money(after.finance.forecast - budget.finance.forecast),
        roomsContracted: roomsContracted(snapshot),
        note:
          "Nothing has been changed. Only lines that scale with guests move; contracted amounts are fixed. " +
          "Do not report the hypothetical figures as if they were current.",
      });
    }

    /**
     * Names to ids.
     *
     * Every proposal names the record it acts on, and an id is the one thing
     * the model can never infer, so this is the door every change goes through.
     * It searches the snapshot rather than the database, so it can only ever
     * surface what this viewer can already see — and money-bearing rows stay
     * behind the same permission as everywhere else.
     */
    case "find_records": {
      const query = String(args.query ?? "").toLowerCase().trim();
      const wanted = args.type ? String(args.type) : null;
      const limit = Math.min(Math.max(Number(args.limit ?? 12) || 12, 1), 50);

      const memberName = (id: string | null) =>
        id ? (snapshot.members.find((m) => m.id === id)?.name ?? null) : null;
      const eventName = (id: string | null) =>
        id ? (snapshot.events.find((e) => e.id === id)?.name ?? null) : null;

      interface Candidate {
        type: string;
        id: string;
        label: string;
        detail: string;
        /** The argument name a proposal passes this id as. */
        idArg: string;
      }

      const pools: Record<string, () => Candidate[]> = {
        guest: () =>
          snapshot.guests.map((g) => ({
            type: "guest",
            id: g.id,
            label: `${g.firstName} ${g.lastName}`.trim(),
            detail: [
              g.relationship,
              `tier ${g.tier}`,
              snapshot.households.find((h) => h.id === g.householdId)?.name,
            ]
              .filter(Boolean)
              .join(" · "),
            idArg: "guestId",
          })),
        household: () =>
          snapshot.households.map((h) => ({
            type: "household",
            id: h.id,
            label: h.name,
            detail: `${snapshot.guests.filter((g) => g.householdId === h.id).length} people · tier ${h.tier} · ${h.rsvpReply.toLowerCase()}`,
            idArg: "householdId",
          })),
        event: () =>
          snapshot.events.map((e) => ({
            type: "event",
            id: e.id,
            label: e.name,
            detail: `${formatMediumDate(e.date)} · ${formatMinute(e.startMinute)}–${formatMinute(e.endMinute)}`,
            idArg: "eventId",
          })),
        venue: () =>
          snapshot.venues.map((v) => ({
            type: "venue",
            id: v.id,
            label: v.name,
            detail: [v.city, v.capacity ? `holds ${v.capacity}` : null].filter(Boolean).join(" · "),
            idArg: "venueId",
          })),
        vendor: () =>
          snapshot.vendors.map((v) => ({
            type: "vendor",
            id: v.id,
            label: v.businessName,
            detail: `${VENDOR_CATEGORY_LABEL[v.category] ?? v.category} · ${VENDOR_STATUS_TEXT[v.status] ?? v.status}`,
            idArg: "vendorId",
          })),
        task: () =>
          snapshot.tasks.map((t) => ({
            type: "task",
            id: t.id,
            label: t.title,
            detail: [
              t.status,
              t.dueDate ? `due ${formatMediumDate(new Date(t.dueDate))}` : null,
              memberName(t.ownerId),
            ]
              .filter(Boolean)
              .join(" · "),
            idArg: "taskId",
          })),
        member: () =>
          snapshot.members.map((m) => ({
            type: "member",
            id: m.id,
            label: m.name,
            detail: m.relation,
            idArg: "ownerId",
          })),
        budgetCategory: () =>
          snapshot.categories.map((c) => ({
            type: "budgetCategory",
            id: c.id,
            label: c.name,
            detail: canSeeMoney ? money(c.allocatedAmount) : "",
            idArg: "categoryId",
          })),
        budgetItem: () =>
          snapshot.budgetItems.map((i) => ({
            type: "budgetItem",
            id: i.id,
            label: i.name,
            detail: canSeeMoney ? `${money(i.allocatedAmount)} allocated` : "",
            idArg: "itemId",
          })),
        payment: () =>
          snapshot.payments.map((p) => ({
            type: "payment",
            id: p.id,
            label: p.label,
            detail: [
              canSeeMoney ? money(p.amount) : null,
              `due ${formatMediumDate(p.dueDate)}`,
              p.status,
            ]
              .filter(Boolean)
              .join(" · "),
            idArg: "paymentId",
          })),
        timeline: () =>
          snapshot.timeline.map((t) => ({
            type: "timeline",
            id: t.id,
            label: t.title,
            detail: `${formatMediumDate(t.date)} · ${formatMinute(t.startMinute)}`,
            idArg: "entryId",
          })),
        hotel: () =>
          snapshot.hotels.map((h) => ({
            type: "hotel",
            id: h.id,
            label: h.name,
            detail: [h.city, `${h.contractedRooms} rooms`].filter(Boolean).join(" · "),
            idArg: "hotelId",
          })),
        outfit: () =>
          snapshot.outfits.map((o) => ({
            type: "outfit",
            id: o.id,
            label: o.outfitType,
            detail: [
              snapshot.wardrobePeople.find((p) => p.id === o.personId)?.name,
              eventName(o.eventId),
              o.status,
            ]
              .filter(Boolean)
              .join(" · "),
            idArg: "outfitId",
          })),
        wardrobePerson: () =>
          snapshot.wardrobePeople.map((p) => ({
            type: "wardrobePerson",
            id: p.id,
            label: p.name,
            detail: p.role,
            idArg: "personId",
          })),
        responsibility: () =>
          snapshot.responsibilities.map((r) => ({
            type: "responsibility",
            id: r.id,
            label: r.title,
            detail: [r.area, memberName(r.ownerId)].filter(Boolean).join(" · "),
            idArg: "responsibilityId",
          })),
      };

      if (wanted && !pools[wanted]) {
        throw new Error(`Unknown record type "${wanted}".`);
      }

      const searched = wanted ? [wanted] : Object.keys(pools);
      const hidden = !canSeeMoney;
      const matches: Candidate[] = [];
      for (const type of searched) {
        if (hidden && (type === "payment" || type === "budgetItem" || type === "budgetCategory")) {
          continue;
        }
        for (const candidate of pools[type]()) {
          if (!query || candidate.label.toLowerCase().includes(query) ||
              candidate.detail.toLowerCase().includes(query)) {
            matches.push(candidate);
          }
        }
      }

      // Closest first: an exact name beats a prefix, which beats a mention.
      const rank = (label: string) => {
        const value = label.toLowerCase();
        if (!query) return 2;
        if (value === query) return 0;
        if (value.startsWith(query)) return 1;
        return 2;
      };
      matches.sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));

      return json({
        query: query || null,
        totalMatching: matches.length,
        note:
          "Pass `id` as the argument named in `idArg` when you propose a change. " +
          "Never use a label in place of an id.",
        results: matches.slice(0, limit),
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 1);
}

export function buildSystemPrompt(
  snapshot: WeddingSnapshot,
  viewer: Viewer,
): string {
  const days = daysBetween(snapshot.today, snapshot.wedding.startDate);
  const canSeeMoney = viewer.permissions.has("budget.view");

  return [
    `You are the planning assistant for ${snapshot.wedding.partnerAName} and ${snapshot.wedding.partnerBName}'s wedding.`,
    "",
    `You are speaking to ${viewer.name} (${viewer.relation}). Today is ${formatMediumDate(snapshot.today)}; the wedding is in ${days} days.`,
    canSeeMoney
      ? `Report money in ${viewer.displayCurrency}.`
      : "This person CANNOT see financial information. Never state or estimate any amount. If asked about money, say plainly that their account doesn't have access to it.",
    "",
    "How to work:",
    "- Always call tools to get real figures. Never guess, never work from memory of earlier messages if a number might have changed.",
    "- Tool results include `id` fields. You MUST use those exact ids when proposing a change — never invent one. find_records is the quickest way from a name to an id, and works for every kind of record.",
    "- Times are minutes from midnight (1140 = 7:00 PM). Read startMinute/endMinute from get_events before proposing a time change.",
    "- Call several tools when a question spans areas.",
    "- NUMBERS MUST BE COPIED EXACTLY from tool output. Never round, never recompute, never approximate, never carry a figure over from an earlier answer.",
    "- Match the field to the question. Field names carry their units — ROOMS_needed is a count of rooms; PEOPLE_not_yet_allocated is a count of people. Do not substitute one for another.",
    "- If a tool did not return the figure you need, say you don't have it. Do not estimate.",
    "- Be concrete and specific. Cite the actual numbers, names and dates the tools return.",
    "- Be brief. Two or three short paragraphs, or a short list. No preamble, no restating the question.",
    "- Use plain family language, not project-management jargon. 'Waiting on', not 'dependency constraint'.",
    "- Currency and dates in British format.",
    "",
    "What matters about this wedding right now:",
    "- It is a destination wedding. The venue is NOT chosen — there is a shortlist across Bali and Thailand, and India has been ruled out.",
    "- Because nothing is contracted, most figures are estimates. Say so when it matters.",
    "- The single highest-leverage decision is choosing the venue: it sets the date, the room block and most of the budget.",
    "",
    "Making changes:",
    "- You can propose a change to ANYTHING in this app: guests and households, invitations and who has been sent what, functions and their times, dates and venues, tasks, vendors and contracts, the budget and its payments, the run of show, rooms and journeys, responsibilities on the day, outfits and fittings. The propose_change tool lists every action you have, with the arguments each one takes.",
    "- You cannot apply anything yourself. Each proposal is shown to the user, with a full preview of its consequences where we can model them, and they approve or dismiss it.",
    "- IDS ARE NOT GUESSABLE. Call find_records to turn a name into an id before you propose anything. If find_records returns nothing, say so — never invent an id, and never pass a name where an id is asked for.",
    "- If the user asks you to change, add, set, move, remove, assign or record ANYTHING, call propose_change. Do not decide on their behalf that no change is needed — if you think it is unnecessary, propose it anyway and say why you are unsure.",
    "- A request that needs several changes gets several calls: one per change, in the order they should happen. Say plainly what the set of them does. Six calls for six functions is right; one vague call is not.",
    "- Where something can be done two ways, prefer the specific action: event.time for hours, event.date for a day, event.venue for a venue, rather than event.update.",
    "- Putting an RSVP back to awaiting is guest.rsvp with status PENDING. Removing someone from a function is NOT_INVITED, which is different from DECLINED: not invited means never asked, declined means asked and said no.",
    "- household.send and guest.send record that something went out. They do not send anything — nothing in this app messages a guest by itself. Say so rather than implying you have contacted anybody.",
    "- Never say you have made, applied or saved a change. Say you have suggested it and it is waiting for their approval.",
    "- If you cannot propose something — no permission, or no action covers it — say so plainly and describe what they would do by hand instead.",
  ].join("\n");
}
