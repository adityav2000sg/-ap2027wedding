/**
 * Operational seed: draft run of show, wardrobe, moodboards, activity.
 *
 * Everything here is marked as draft/planned rather than confirmed, because the
 * venue isn't chosen yet. It's scaffolding the couple can edit, not a pretence
 * that decisions have been made.
 */

import type { PrismaClient } from "@prisma/client";

import { MILESTONE_DEFINITIONS } from "../src/domain/milestones";

export interface SeedContext {
  db: PrismaClient;
  weddingId: string;
  events: Record<string, string>;
  members: Record<string, string>;
  users: Record<string, string>;
  plannerId: string;
  venueVendors: Record<string, string>;
  payers: Record<string, string>;
  budgetItems: Record<string, string>;
  day(offset: number): Date;
}

const civil = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export async function seedOperations(ctx: SeedContext): Promise<void> {
  await seedTimeline(ctx);
  await seedWardrobe(ctx);
  await seedResponsibilities(ctx);
  await seedMoodboards(ctx);
  await seedForecastHistory(ctx);
  await seedMilestones(ctx);
  await seedActivity(ctx);
}

// ─────────────────────────────────────────────────────────── Draft run of show

async function seedTimeline(ctx: SeedContext): Promise<void> {
  const { db, weddingId, events, members } = ctx;

  interface Entry {
    key: string; title: string; event: string; date: string;
    start: number; end: number; owner?: string; notes?: string;
    locked?: boolean; after?: { key: string; gap: number };
  }

  const entries: Entry[] = [
    // Haldi — 16 June, morning
    { key: "haldi-setup", title: "Decor setup", event: "haldi", date: "2027-06-16", start: 420, end: 570 },
    { key: "haldi-makeup", title: "Bride light hair & makeup", event: "haldi", date: "2027-06-16", start: 480, end: 585 },
    { key: "haldi-ceremony", title: "Haldi ceremony", event: "haldi", date: "2027-06-16", start: 600, end: 720, owner: "namrita", after: { key: "haldi-setup", gap: 0 } },
    { key: "haldi-lunch", title: "Lunch", event: "haldi", date: "2027-06-16", start: 720, end: 780, after: { key: "haldi-ceremony", gap: 0 } },

    // Mehendi — 16 June, afternoon into evening
    { key: "mehendi-setup", title: "Mehendi setup", event: "mehendi", date: "2027-06-16", start: 750, end: 900 },
    { key: "mehendi-bride", title: "Bride's mehendi begins", event: "mehendi", date: "2027-06-16", start: 900, end: 1140, notes: "Four hours. Nothing else can be scheduled for Avantika during this.", after: { key: "mehendi-setup", gap: 0 } },
    { key: "mehendi-guests", title: "Guests arrive", event: "mehendi", date: "2027-06-16", start: 960, end: 990 },
    { key: "mehendi-dinner", title: "Dinner", event: "mehendi", date: "2027-06-16", start: 1200, end: 1320 },

    // Sangeet — 17 June
    { key: "sangeet-loadin", title: "AV load-in", event: "sangeet", date: "2027-06-17", start: 480, end: 720 },
    { key: "sangeet-soundcheck", title: "Sound check", event: "sangeet", date: "2027-06-17", start: 720, end: 810, after: { key: "sangeet-loadin", gap: 0 } },
    { key: "sangeet-rehearsal", title: "Technical rehearsal", event: "sangeet", date: "2027-06-17", start: 810, end: 960, notes: "Every performer must attend — the only full run-through.", after: { key: "sangeet-soundcheck", gap: 0 } },
    { key: "sangeet-makeup", title: "Bride & family hair and makeup", event: "sangeet", date: "2027-06-17", start: 900, end: 1110 },
    { key: "sangeet-guests", title: "Guests arrive & cocktails", event: "sangeet", date: "2027-06-17", start: 1140, end: 1200 },
    { key: "sangeet-entry", title: "Couple's entry", event: "sangeet", date: "2027-06-17", start: 1200, end: 1215, after: { key: "sangeet-makeup", gap: 30 } },
    { key: "sangeet-performances", title: "Family performances", event: "sangeet", date: "2027-06-17", start: 1215, end: 1350, after: { key: "sangeet-entry", gap: 0 } },
    { key: "sangeet-dinner", title: "Dinner", event: "sangeet", date: "2027-06-17", start: 1320, end: 1440 },
    { key: "sangeet-dancing", title: "Dance floor opens", event: "sangeet", date: "2027-06-17", start: 1350, end: 1500, after: { key: "sangeet-performances", gap: 0 } },

    // Shaadi — 18 June
    { key: "shaadi-mandap", title: "Mandap & decor setup", event: "shaadi", date: "2027-06-18", start: 360, end: 900 },
    { key: "shaadi-makeup", title: "Bridal hair & makeup begins", event: "shaadi", date: "2027-06-18", start: 780, end: 945, notes: "Three hours minimum." },
    { key: "shaadi-photo", title: "Photography begins", event: "shaadi", date: "2027-06-18", start: 945, end: 1500, after: { key: "shaadi-makeup", gap: 0 } },
    { key: "shaadi-groom-prep", title: "Groom preparation", event: "shaadi", date: "2027-06-18", start: 990, end: 1035 },
    { key: "shaadi-baraat-assembly", title: "Baraat assembly", event: "shaadi", date: "2027-06-18", start: 1035, end: 1050, after: { key: "shaadi-groom-prep", gap: 0 } },
    { key: "shaadi-baraat", title: "Baraat", event: "shaadi", date: "2027-06-18", start: 1050, end: 1100, after: { key: "shaadi-baraat-assembly", gap: 0 } },
    { key: "shaadi-milni", title: "Milni", event: "shaadi", date: "2027-06-18", start: 1100, end: 1125, owner: "dheeraj", after: { key: "shaadi-baraat", gap: 0 } },
    { key: "shaadi-varmala", title: "Varmala", event: "shaadi", date: "2027-06-18", start: 1125, end: 1170, after: { key: "shaadi-milni", gap: 0 } },
    { key: "shaadi-dinner", title: "Dinner", event: "shaadi", date: "2027-06-18", start: 1170, end: 1320, after: { key: "shaadi-varmala", gap: 0 } },
    { key: "shaadi-pheras", title: "Pheras", event: "shaadi", date: "2027-06-18", start: 1260, end: 1380, locked: true, notes: "Muhurat — this time is fixed once the pandit confirms it.", after: { key: "shaadi-varmala", gap: 30 } },
    { key: "shaadi-vidaai", title: "Vidaai", event: "shaadi", date: "2027-06-18", start: 1395, end: 1440, after: { key: "shaadi-pheras", gap: 15 } },

    // Reception — 19 June
    { key: "reception-setup", title: "Reception setup", event: "reception", date: "2027-06-19", start: 600, end: 1020 },
    { key: "reception-makeup", title: "Getting ready", event: "reception", date: "2027-06-19", start: 900, end: 1110 },
    { key: "reception-guests", title: "Guests arrive", event: "reception", date: "2027-06-19", start: 1140, end: 1200 },
    { key: "reception-entry", title: "Couple's entry", event: "reception", date: "2027-06-19", start: 1200, end: 1215, after: { key: "reception-makeup", gap: 30 } },
    { key: "reception-speeches", title: "Speeches", event: "reception", date: "2027-06-19", start: 1230, end: 1275, after: { key: "reception-entry", gap: 0 } },
    { key: "reception-dinner", title: "Dinner", event: "reception", date: "2027-06-19", start: 1275, end: 1395, after: { key: "reception-speeches", gap: 0 } },
    { key: "reception-departure", title: "Send-off", event: "reception", date: "2027-06-19", start: 1400, end: 1410 },
  ];

  const created: Record<string, string> = {};
  for (const [index, entry] of entries.entries()) {
    const row = await db.timelineEntry.create({
      data: {
        weddingId,
        eventId: events[entry.event],
        title: entry.title,
        date: civil(entry.date),
        startMinute: entry.start,
        endMinute: entry.end,
        ownerId: entry.owner ? members[entry.owner] ?? null : null,
        notes: entry.notes ?? null,
        status: "PLANNED",
        isLocked: entry.locked ?? false,
        sortOrder: index,
      },
      select: { id: true },
    });
    created[entry.key] = row.id;
  }

  for (const entry of entries) {
    if (!entry.after) continue;
    const dependsOnId = created[entry.after.key];
    if (!dependsOnId) continue;
    await db.timelineDependency.create({
      data: { entryId: created[entry.key], dependsOnId, gapMinutes: entry.after.gap },
    });
  }
}

// ─────────────────────────────────────────────────────────────────── Wardrobe

async function seedWardrobe(ctx: SeedContext): Promise<void> {
  const { db, weddingId, events, members } = ctx;

  const peopleSeed = [
    { name: "Avantika", role: "Bride" },
    { name: "Prateek", role: "Groom" },
    { name: "Namrita Chowdhry", role: "Bride's Mother" },
    { name: "Dheeraj Chowdhry", role: "Bride's Father" },
    { name: "Preeti Mehan", role: "Groom's Mother" },
    { name: "Ajay Mehan", role: "Groom's Father" },
    { name: "Anousha Chowdhry", role: "Bride's Sister" },
    { name: "Trisha Mehan", role: "Groom's Sister" },
  ];

  const personId: Record<string, string> = {};
  for (const [index, person] of peopleSeed.entries()) {
    const row = await db.wardrobePerson.create({
      data: { weddingId, name: person.name, role: person.role, sortOrder: index },
      select: { id: true, name: true },
    });
    personId[person.name] = row.id;
  }

  // A look per person per event, mostly still at the idea stage — which is
  // where they actually are.
  const eventKeys = ["haldi", "mehendi", "sangeet", "shaadi", "reception"] as const;
  const OUTFIT_TYPE: Record<string, { bride: string; groom: string; woman: string; man: string }> = {
    haldi: { bride: "Haldi suit", groom: "Haldi kurta", woman: "Yellow suit", man: "Kurta" },
    mehendi: { bride: "Mehendi sharara", groom: "Pastel kurta set", woman: "Anarkali", man: "Kurta set" },
    sangeet: { bride: "Sangeet lehenga", groom: "Bandhgala", woman: "Lehenga", man: "Bandhgala" },
    shaadi: { bride: "Bridal lehenga", groom: "Sherwani", woman: "Silk saree", man: "Sherwani" },
    reception: { bride: "Reception gown", groom: "Tuxedo", woman: "Saree", man: "Suit" },
  };

  const WOMEN = new Set([
    "Namrita Chowdhry", "Preeti Mehan", "Anousha Chowdhry", "Trisha Mehan",
  ]);

  for (const person of peopleSeed) {
    for (const eventKey of eventKeys) {
      const types = OUTFIT_TYPE[eventKey];
      const type =
        person.role === "Bride" ? types.bride
        : person.role === "Groom" ? types.groom
        : WOMEN.has(person.name) ? types.woman
        : types.man;

      // The couple's Shaadi looks are the only ones being actively worked on.
      const isCoupleShaadi =
        eventKey === "shaadi" && (person.role === "Bride" || person.role === "Groom");

      await db.outfit.create({
        data: {
          weddingId,
          personId: personId[person.name],
          eventId: events[eventKey],
          outfitType: type,
          status: isCoupleShaadi ? "SHORTLISTING" : "IDEA",
          currency: "GBP",
          notes: isCoupleShaadi
            ? "Designer appointments being arranged. Needs ordering roughly nine months out."
            : null,
        },
      });
    }
  }

  // Jewellery the family already knows about.
  const jewellery = [
    { name: "Bridal set — to be chosen", person: "Avantika", event: "shaadi", ownership: "PURCHASED" as const, responsible: "namrita", notes: "Budget and jeweller not yet agreed." },
    { name: "Mangalsutra", person: "Avantika", event: "shaadi", ownership: "PURCHASED" as const, responsible: "preeti" },
    { name: "Chooda", person: "Avantika", event: "shaadi", ownership: "PURCHASED" as const, responsible: "namrita" },
    { name: "Family heirloom set", person: "Avantika", event: "reception", ownership: "BORROWED" as const, responsible: "namrita", notes: "From Sadhna Chowdhry. Needs to travel with the family." },
    { name: "Groom's kalgi & brooch", person: "Prateek", event: "shaadi", ownership: "PURCHASED" as const, responsible: "preeti" },
  ];

  for (const item of jewellery) {
    await db.jewelleryItem.create({
      data: {
        weddingId,
        personId: personId[item.person],
        eventId: events[item.event],
        name: item.name,
        ownership: item.ownership,
        currency: "GBP",
        responsibleId: members[item.responsible] ?? null,
        notes: item.notes ?? null,
        storageNote: "Travelling internationally — needs a plan for carriage and insurance.",
      },
    });
  }
}

// ────────────────────────────────────────────────────── Responsibility matrix

async function seedResponsibilities(ctx: SeedContext): Promise<void> {
  const { db, weddingId, events, members } = ctx;

  const rows: {
    title: string; area: string; owner?: string; backup?: string;
    event?: string; importance: number;
  }[] = [
    { title: "Choose the venue and sign the contract", area: "Venue", owner: "dheeraj", backup: "ajay", importance: 5 },
    { title: "Appoint the wedding planner", area: "Planning", owner: "avantika", backup: "prateek", importance: 5 },
    { title: "Lock the wedding dates with both families", area: "Foundation", owner: "namrita", backup: "preeti", importance: 5 },
    { title: "Own the guest list and keep it current", area: "Guests", owner: "anousha", importance: 4 },
    { title: "Collect travel details from every guest", area: "Travel", owner: "aditya", importance: 4 },
    { title: "Manage the room block and allocations", area: "Accommodation", owner: "trisha", importance: 4 },
    { title: "Coordinate the Sangeet performances", area: "Sangeet", owner: "anousha", backup: "trisha", event: "sangeet", importance: 4 },
    { title: "Brief and receive the pandit", area: "Rituals", owner: "ajay", event: "shaadi", importance: 4 },
    { title: "Settle vendor payments on the day", area: "Money", owner: "dheeraj", backup: "ajay", importance: 5 },
    { title: "Look after elderly guests through the week", area: "Hospitality", importance: 5 },
    { title: "Jewellery custody and international carriage", area: "Jewellery", owner: "namrita", importance: 5 },
    { title: "Airport transfers on arrival day", area: "Transport", importance: 5 },
    { title: "Welcome desk and guest itineraries", area: "Hospitality", importance: 4 },
    { title: "Emergency kit and nearest medical contact", area: "Emergency", importance: 4 },
    { title: "Visas and travel documentation checks", area: "Travel", importance: 4 },
  ];

  for (const row of rows) {
    await db.responsibility.create({
      data: {
        weddingId,
        title: row.title,
        area: row.area,
        ownerId: row.owner ? members[row.owner] ?? null : null,
        backupId: row.backup ? members[row.backup] ?? null : null,
        eventId: row.event ? events[row.event] ?? null : null,
        importance: row.importance,
        status: row.owner ? "ASSIGNED" : "UNASSIGNED",
      },
    });
  }
}

// ────────────────────────────────────────────────────────────────── Moodboards

async function seedMoodboards(ctx: SeedContext): Promise<void> {
  const { db, weddingId, events } = ctx;

  // Empty boards, ready for real photographs. Deliberately no stock imagery —
  // the product should fill up with the couple's own material.
  const boards: { name: string; description: string; scope: "WEDDING" | "EVENT" | "CATEGORY"; event?: string; category?: string }[] = [
    { name: "Overall Wedding", description: "The feel we're going for across the whole week.", scope: "WEDDING" },
    { name: "Haldi Inspiration", description: "Marigolds, morning light, informality.", scope: "EVENT", event: "haldi" },
    { name: "Mehendi Inspiration", description: "Low seating, lanterns, greens.", scope: "EVENT", event: "mehendi" },
    { name: "Sangeet Inspiration", description: "Stage, lighting and the look of the night.", scope: "EVENT", event: "sangeet" },
    { name: "Shaadi Inspiration", description: "Mandap, florals and the ceremony setting.", scope: "EVENT", event: "shaadi" },
    { name: "Reception Inspiration", description: "Tablescapes and the final evening.", scope: "EVENT", event: "reception" },
    { name: "Decor & Florals", description: "Installations, arrangements and palettes.", scope: "CATEGORY", category: "Decor" },
    { name: "Mandap", description: "Structures, drapes and floral treatments.", scope: "CATEGORY", category: "Mandap" },
    { name: "Bride Outfits", description: "Lehengas, sarees and colour direction.", scope: "CATEGORY", category: "Bride Outfits" },
    { name: "Groom Outfits", description: "Sherwanis, bandhgalas and accessories.", scope: "CATEGORY", category: "Groom Outfits" },
    { name: "Jewellery", description: "Sets, polki, and family pieces.", scope: "CATEGORY", category: "Jewellery" },
    { name: "Bridal Hair & Makeup", description: "Looks for each function.", scope: "CATEGORY", category: "Bridal Makeup" },
    { name: "Invitations", description: "Paper, print and wording.", scope: "CATEGORY", category: "Invitations" },
    { name: "Table Settings", description: "Linen, glassware and centrepieces.", scope: "CATEGORY", category: "Table Settings" },
  ];

  for (const [index, board] of boards.entries()) {
    await db.moodboard.create({
      data: {
        weddingId,
        name: board.name,
        description: board.description,
        scope: board.scope,
        eventId: board.event ? events[board.event] ?? null : null,
        category: board.category ?? null,
        sortOrder: index,
      },
    });
  }
}

// ────────────────────────────────────────────────────────── History & activity

async function seedForecastHistory(ctx: SeedContext): Promise<void> {
  const { db, weddingId, day } = ctx;

  // Their real estimate arc, in GBP.
  const points = [
    { days: -120, forecast: 121_000, reason: "First budget set from the family split" },
    { days: -95, forecast: 290_500, reason: "Planner's initial estimate received ($392K)" },
    { days: -70, forecast: 189_100, reason: "Scope trimmed — fireworks, firedancers and hampers excluded" },
    { days: -45, forecast: 180_500, reason: "Revised planner estimate ($164K core)" },
    { days: -20, forecast: 186_200, reason: "Accommodation re-costed against the 112-room plan" },
  ];

  for (const point of points) {
    await db.forecastSnapshot.create({
      data: {
        weddingId,
        forecastTotal: point.forecast,
        allocatedTotal: 255_370,
        reason: point.reason,
        capturedAt: day(point.days),
      },
    });
  }
}

async function seedMilestones(ctx: SeedContext): Promise<void> {
  const { db, weddingId, day } = ctx;

  const achieved: Record<string, number> = {
    "events-defined": -110,
    "budget-created": -118,
  };

  for (const definition of MILESTONE_DEFINITIONS) {
    await db.milestone.create({
      data: {
        weddingId,
        key: definition.key,
        title: definition.title,
        description: definition.description,
        sortOrder: definition.sortOrder,
        achievedAt: definition.key in achieved ? day(achieved[definition.key]) : null,
      },
    });
  }
}

async function seedActivity(ctx: SeedContext): Promise<void> {
  const { db, weddingId, users, venueVendors, plannerId, day } = ctx;

  const conrad = venueVendors["Conrad Bali"];
  const khaoLak = venueVendors["JW Marriott Khao Lak"];

  const entries: {
    days: number; actor: string; source?: "MANUAL" | "AUTOMATED" | "AI";
    entityType: string; entityId?: string | null; label?: string;
    action: string; summary: string;
  }[] = [
    { days: -120, actor: "avantika", entityType: "wedding", action: "created", summary: "Avantika started planning and set a target of June 2027." },
    { days: -118, actor: "dheeraj", entityType: "budget", action: "updated", summary: "Dheeraj and Ajay agreed the family budget split — £80,370 from the Chowdhrys, £175,000 from the Mehans." },
    { days: -115, actor: "namrita", entityType: "guest", action: "updated", summary: "Namrita and Preeti finalised the Tier A guest list at 231 people." },
    { days: -110, actor: "avantika", entityType: "wedding", action: "updated", summary: "Five functions agreed: Haldi, Mehendi, Sangeet, Shaadi and Reception." },
    { days: -100, actor: "dheeraj", entityType: "wedding", action: "note", summary: "India ruled out as a destination — overheads too high for the guest numbers." },
    { days: -95, actor: "prateek", entityType: "vendor", entityId: plannerId, label: "Eventures", action: "contacted", summary: "Initial conversation with Eventures. Their first estimate came in at $392,400." },
    { days: -80, actor: "avantika", entityType: "vendor", entityId: khaoLak, label: "JW Marriott Khao Lak", action: "quote_received", summary: "Proposal received from JW Marriott Khao Lak." },
    { days: -70, actor: "prateek", entityType: "budget", action: "updated", summary: "Fireworks, firedancers and welcome hampers excluded to bring the estimate down." },
    { days: -55, actor: "avantika", entityType: "vendor", entityId: conrad, label: "Conrad Bali", action: "quote_received", summary: "Proposal received from Conrad Bali — 360 rooms on site." },
    { days: -45, actor: "prateek", entityType: "vendor", entityId: plannerId, label: "Eventures", action: "negotiated", summary: "Revised planner estimate of $164,000 for the core scope." },
    { days: -30, actor: "trisha", entityType: "logistics", action: "updated", summary: "Trisha built the room plan — 112 rooms across the guest list." },
    { days: -20, actor: "anousha", entityType: "guest", action: "note", summary: "Anousha started collecting availability. Eleven guests have flagged date conflicts so far." },
    { days: -12, actor: "avantika", entityType: "vendor", action: "contacted", summary: "Enquiries sent to six more Bali properties." },
    { days: -8, actor: "avantika", entityType: "vendor", entityId: conrad, label: "Conrad Bali", action: "status_changed", summary: "Conrad Bali chosen — a resort takeover in Tanjung Benoa, 360 rooms on site. Every other venue option closed out." },
    { days: -4, actor: "dheeraj", source: "AUTOMATED", entityType: "alert", action: "raised", summary: "Conrad Bali is selected but the contract isn't signed — the dates aren't held yet." },
  ];

  for (const entry of entries) {
    await db.activityLog.create({
      data: {
        weddingId,
        actorId: users[entry.actor] ?? null,
        source: entry.source ?? "MANUAL",
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        entityLabel: entry.label ?? null,
        action: entry.action,
        summary: entry.summary,
        createdAt: day(entry.days),
      },
    });
  }
}
