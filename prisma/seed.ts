/**
 * Seed: Avantika Chowdhry & Prateek Mehan.
 *
 * Built from the couple's own planning workbook rather than invented content —
 * the real 267-name guest list with its tiers and probability scores, the real
 * room allocation, the real venue shortlist, the real family budget split and
 * the real FX table.
 *
 * The wedding is deliberately seeded at the stage it is actually at: a venue
 * shortlist with proposals in, no venue chosen, no date locked, no invitations
 * sent. That produces a low readiness score and a pointed attention list, which
 * is the truth rather than a flattering demo.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type GuestSide, type VendorStatus } from "@prisma/client";

import { hashPassword } from "../src/server/auth-hash";
import { generateMasterPlan } from "../src/server/plan-generator";
import { seedOperations } from "./seed-ops";

const db = new PrismaClient();

const civil = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const WEDDING_START = civil("2027-06-16");
const WEDDING_END = civil("2027-06-19");

const NOW = new Date();
const TODAY = civil(NOW.toISOString().slice(0, 10));
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000);

interface ImportData {
  fx: { from: string; to: string; rate: number }[];
  guests: {
    tier: string; title: string | null; firstName: string; lastName: string;
    fullName: string; household: string | null; side: string | null;
    category: string | null; ageGroup: string | null;
    probabilityScore: number | null; probabilityPct: number | null;
    roomNumber: string | null;
  }[];
  rooms: { number: number; occupants: string[]; household: string | null; infants: number; total: number }[];
  milni: { relationship: string; bride: string | null; groom: string | null }[];
  venues: {
    rank: number; name: string; country: string | null; region: string | null;
    status: string | null; propertyType: string | null; airport: string | null;
    londonFlights: string | null; singaporeFlights: string | null; delhiFlights: string | null;
    transferMins: number | null; roomsOnSite: number | null;
    estTotalGBP: number | null; estTotalSGD: number | null; notes: string | null;
  }[];
  budgetFamilies: { family: string; guests: number | null; budgetGBP: number | null; budgetUSD: number | null }[];
  budgetItems: {
    item: string; exclude: string | null; vishalInitial: number | null;
    vishalRevised: number | null; dcEstimate: number | null; ncPmEstimate: number | null;
    notes: string | null;
  }[];
  availability: { name: string; cantDo: string }[];
}

const data: ImportData = JSON.parse(
  readFileSync(path.join(process.cwd(), "prisma/data/wedding-import.json"), "utf8"),
);

function rsvpToken(): string {
  return randomUUID().replace(/-/g, "") + randomBytes(6).toString("hex");
}

function sideOf(value: string | null): GuestSide {
  if (!value) return "BOTH";
  if (value.startsWith("1")) return "BRIDE";
  if (value.startsWith("2")) return "GROOM";
  return "BOTH";
}

/** "0 - Immediate Family" -> "Immediate Family" */
function cleanLabel(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/^\d+\s*-\s*/, "").trim() || null;
}

async function main() {
  // ── Guard ────────────────────────────────────────────────────────────────
  // Seeding is destructive: it drops the wedding and everything hanging off it.
  // That's fine against an empty database, but once there is real work in here
  // — RSVPs collected, payments logged, photos uploaded — an accidental
  // `npm run db:seed` would silently destroy it. So: refuse, and say why.
  const existing = await db.wedding.findFirst({
    select: { id: true, partnerAName: true, partnerBName: true },
  });

  if (existing && process.env.SEED_FORCE !== "yes") {
    const [guests, media, payments] = await Promise.all([
      db.guest.count({ where: { weddingId: existing.id } }),
      db.mediaAsset.count({ where: { weddingId: existing.id } }),
      db.payment.count({ where: { weddingId: existing.id } }),
    ]);

    console.error(
      `\n✗ There is already a wedding in this database ` +
      `(${existing.partnerAName} & ${existing.partnerBName}) with ` +
      `${guests} guests, ${media} uploaded files and ${payments} payments.\n\n` +
      `  Seeding would delete all of it, including anything added since.\n` +
      `  If you genuinely want to wipe and rebuild:\n\n` +
      `      SEED_FORCE=yes npm run db:seed\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (existing) {
    console.log("→ SEED_FORCE set — clearing existing data…");
  }
  await db.wedding.deleteMany({});
  await db.user.deleteMany({});

  // ── The nine family accounts ───────────────────────────────────────────────
  console.log("→ Creating family accounts…");
  const password = await hashPassword("wedding2027");

  const people = [
    { key: "avantika", name: "Avantika Chowdhry", email: "avantika@apwedding.com", tone: "rose", role: "OWNER" as const, relation: "Bride" },
    { key: "prateek", name: "Prateek Mehan", email: "prateek@apwedding.com", tone: "indigo", role: "OWNER" as const, relation: "Groom" },
    { key: "namrita", name: "Namrita Chowdhry", email: "namrita@apwedding.com", tone: "plum", role: "ADMIN" as const, relation: "Bride's Mother" },
    { key: "dheeraj", name: "Dheeraj Chowdhry", email: "dheeraj@apwedding.com", tone: "saffron", role: "ADMIN" as const, relation: "Bride's Father" },
    { key: "preeti", name: "Preeti Mehan", email: "preeti@apwedding.com", tone: "teal", role: "ADMIN" as const, relation: "Groom's Mother" },
    { key: "ajay", name: "Ajay Mehan", email: "ajay@apwedding.com", tone: "olive", role: "ADMIN" as const, relation: "Groom's Father" },
    { key: "anousha", name: "Anousha Chowdhry", email: "anousha@apwedding.com", tone: "amber", role: "FAMILY" as const, relation: "Bride's Sister" },
    { key: "trisha", name: "Trisha Mehan", email: "trisha@apwedding.com", tone: "sky", role: "FAMILY" as const, relation: "Groom's Sister" },
    { key: "aditya", name: "Aditya Vaidya", email: "aditya@apwedding.com", tone: "slate", role: "FAMILY" as const, relation: "Anousha's Partner" },
  ];

  // The couple and both sets of parents think in different currencies —
  // everyone picks their own and the figures convert for them.
  const currencyByKey: Record<string, string> = {
    avantika: "GBP", prateek: "GBP", namrita: "GBP", dheeraj: "GBP",
    preeti: "SGD", ajay: "SGD", anousha: "GBP", trisha: "SGD", aditya: "SGD",
  };

  const wedding = await db.wedding.create({
    data: {
      slug: "avantika-prateek",
      partnerAName: "Avantika",
      partnerBName: "Prateek",
      weddingType: "North Indian",
      startDate: WEDDING_START,
      endDate: WEDDING_END,
      baseCurrency: "GBP",
      // Their own weighted attendance figure from the Guest List Summary.
      estimatedGuests: 220,
      totalBudget: 255_370,
      contingencyPct: 8,
      cities: ["Bali"],
      hasPlanner: true,
      rsvpEnabled: true,
      guestsPerRoom: 2,
      traditions: [
        "baraat", "milni", "varmala", "pheras", "sindoor", "mangalsutra",
        "kanyadaan", "joota-chupai", "vidaai", "chooda", "kalire", "havan", "sehra",
      ],
      onboardedAt: day(-120),
    },
  });

  const users: Record<string, string> = {};
  const members: Record<string, string> = {};
  for (const person of people) {
    const user = await db.user.create({
      data: {
        name: person.name,
        email: person.email,
        passwordHash: password,
        avatarTone: person.tone,
        displayCurrency: currencyByKey[person.key] ?? "GBP",
        // Everyone signs in with the shared starter password and is prompted
        // to set their own.
        mustSetPassword: true,
      },
    });
    const member = await db.weddingMember.create({
      data: { weddingId: wedding.id, userId: user.id, role: person.role, relation: person.relation },
    });
    users[person.key] = user.id;
    members[person.key] = member.id;
  }

  // ── Currency ───────────────────────────────────────────────────────────────
  console.log(`→ Loading ${data.fx.length} FX pairs…`);
  for (const rate of data.fx) {
    await db.currencyRate.create({
      data: {
        weddingId: wedding.id,
        fromCurrency: rate.from,
        toCurrency: rate.to,
        rate: rate.rate,
        effectiveDate: day(-30),
        source: "manual",
      },
    });
  }

  // Who is paying — straight from the family budget split.
  const payers: Record<string, string> = {};
  for (const [index, family] of ["Chowdhry", "Mehan"].entries()) {
    const row = data.budgetFamilies.find((f) => f.family === family);
    const payer = await db.payer.create({
      data: {
        weddingId: wedding.id,
        name: `${family} Family`,
        kind: "family",
        sortOrder: index,
      },
    });
    payers[family] = payer.id;
    console.log(`   ${family}: £${(row?.budgetGBP ?? 0).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`);
  }

  // ── The venue ──────────────────────────────────────────────────────────────
  // Chosen: a resort takeover at Conrad Bali. Details from the venue comparison
  // sheet — 360 rooms on site, 20 minutes from Denpasar.
  console.log("→ Creating the venue…");
  const conrad = await db.venue.create({
    data: {
      weddingId: wedding.id,
      name: "Conrad Bali",
      address: "Jalan Pratama 168, Tanjung Benoa",
      city: "Bali, Indonesia",
      capacity: 400,
      contactName: null,
      curfewMinute: null,
      alcoholAllowed: true,
      outsideCatering: false,
      hasRainBackup: true,
      hasPowerBackup: true,
      hasBridalRoom: true,
      notes:
        "Resort takeover. 360 rooms on site, 20 minutes from Denpasar (DPS). " +
        "Direct flights from Singapore (2h) and Delhi (5h); London is 15h via Doha. " +
        "In-house catering only — confirm whether Indian catering can be brought in.",
    },
    select: { id: true },
  });

  // ── Events ─────────────────────────────────────────────────────────────────
  console.log("→ Creating events…");
  const eventSeed = [
    { key: "haldi", name: "Haldi", kind: "HALDI" as const, date: "2027-06-16", start: 600, end: 780, tone: "haldi", guests: 259, dress: "Yellows and whites", description: "Turmeric, marigolds and far too much laughing." },
    { key: "mehendi", name: "Mehendi", kind: "MEHENDI" as const, date: "2027-06-16", start: 960, end: 1320, tone: "mehendi", guests: 259, dress: "Greens and pastels", description: "Henna, dholak and dinner as the sun goes down." },
    { key: "sangeet", name: "Sangeet", kind: "SANGEET" as const, date: "2027-06-17", start: 1140, end: 1500, tone: "sangeet", guests: 259, dress: "Cocktail Indian", description: "Both families perform. Nobody is exempt." },
    { key: "shaadi", name: "Shaadi", kind: "SHAADI" as const, date: "2027-06-18", start: 1020, end: 1500, tone: "shaadi", guests: 259, dress: "Traditional formal", description: "Baraat, milni, varmala and pheras under the mandap." },
    { key: "reception", name: "Reception", kind: "RECEPTION" as const, date: "2027-06-19", start: 1140, end: 1410, tone: "reception", guests: 259, dress: "Black tie / Indian formal", description: "The last night — dinner, speeches and a proper send-off." },
  ];

  const events: Record<string, string> = {};
  for (const [index, event] of eventSeed.entries()) {
    const row = await db.event.create({
      data: {
        weddingId: wedding.id,
        name: event.name,
        slug: event.key,
        kind: event.kind,
        date: civil(event.date),
        startMinute: event.start,
        endMinute: event.end,
        venueId: conrad.id,
        sortOrder: index,
        estimatedGuests: event.guests,
        accentTone: event.tone,
        dressCode: event.dress,
        description: event.description,
      },
    });
    events[event.key] = row.id;
  }

  // ── Venue shortlist ────────────────────────────────────────────────────────
  console.log(`→ Loading ${data.venues.length} venue options…`);
  const VENUE_STATUS: Record<string, VendorStatus> = {
    "Proposal Received": "QUOTE_RECEIVED",
    "Enquiry Sent": "CONTACTED",
    "Ruled Out": "REJECTED",
    "Initial Conversation": "CONTACTED",
  };

  const venueVendors: Record<string, string> = {};
  for (const option of data.venues) {
    // Conrad Bali is the chosen venue — everything else in the shortlist is out.
    const isChosen = option.name === "Conrad Bali";
    const status = isChosen
      ? ("SELECTED" as const)
      : VENUE_STATUS[option.status ?? ""] ?? "RESEARCHING";
    const pros: string[] = [];
    const cons: string[] = [];
    if (option.singaporeFlights?.startsWith("Yes")) pros.push(`Direct from Singapore (${option.singaporeFlights.replace("Yes, ", "")})`);
    if (option.delhiFlights?.startsWith("Yes")) pros.push(`Direct from Delhi (${option.delhiFlights.replace("Yes, ", "")})`);
    if (option.londonFlights?.startsWith("No")) cons.push(`No direct London flight — ${option.londonFlights.replace("No, ", "")}`);
    if (option.roomsOnSite) pros.push(`${option.roomsOnSite} rooms on site`);
    if (option.notes) cons.push(option.notes);

    const vendor = await db.vendor.create({
      data: {
        weddingId: wedding.id,
        businessName: option.name,
        category: "VENUE",
        status,
        city: [option.region, option.country].filter(Boolean).join(", ") || null,
        packageInfo: option.propertyType,
        notes: isChosen
          ? "Chosen. Resort takeover — contract still to be signed."
          : option.notes,
        pros,
        cons,
        isFavourite: isChosen,
        currency: "GBP",
        quoteAmount: option.estTotalGBP ?? null,
        ownerId: members.avantika,
        attributes: {
          create: [
            option.country ? { key: "Country", value: option.country } : null,
            option.airport ? { key: "Nearest airport", value: option.airport } : null,
            option.roomsOnSite ? { key: "Rooms on site", value: String(Math.round(option.roomsOnSite)) } : null,
            option.transferMins ? { key: "Airport transfer", value: `${Math.round(option.transferMins)} mins` } : null,
            option.londonFlights ? { key: "From London", value: option.londonFlights } : null,
            option.singaporeFlights ? { key: "From Singapore", value: option.singaporeFlights } : null,
            option.delhiFlights ? { key: "From Delhi", value: option.delhiFlights } : null,
            option.propertyType ? { key: "Property type", value: option.propertyType } : null,
          ].filter(Boolean) as { key: string; value: string }[],
        },
      },
      select: { id: true },
    });
    venueVendors[option.name] = vendor.id;
  }

  // The planner they've actually spoken to.
  const planner = await db.vendor.create({
    data: {
      weddingId: wedding.id,
      businessName: "Eventures",
      category: "PLANNER",
      status: "CONTACTED",
      contactName: "Venessa Hunter",
      email: "vishal@eventures.asia",
      city: "Indonesia",
      packageInfo: "Full planning — venue sourcing, vendor negotiation, decor, entertainment, transfers, room blocks, RSVP and on-site delivery.",
      notes: "Initial conversation held. Their cost estimates are the basis of the current budget.",
      currency: "USD",
      quoteAmount: 24_000,
      ownerId: members.dheeraj,
      events: { create: Object.values(events).map((eventId) => ({ eventId })) },
    },
    select: { id: true },
  });

  // ── Guests ─────────────────────────────────────────────────────────────────
  console.log(`→ Loading ${data.guests.length} guests…`);
  const householdIds = new Map<string, string>();
  const guestIdByName = new Map<string, string>();
  const availabilityByName = new Map(
    data.availability.map((a) => [a.name.toLowerCase(), a.cantDo]),
  );

  for (const guest of data.guests) {
    const householdName = guest.household || `${guest.lastName || guest.firstName} Household`;

    let householdId = householdIds.get(householdName);
    if (!householdId) {
      const household = await db.household.create({
        data: {
          weddingId: wedding.id,
          name: householdName,
          side: sideOf(guest.side),
          relationship: cleanLabel(guest.category),
          rsvpToken: rsvpToken(),
          // Invitations genuinely haven't gone out — no venue, no date.
          invitationStatus: "NOT_CONTACTED",
        },
        select: { id: true },
      });
      householdId = household.id;
      householdIds.set(householdName, householdId);
    }

    const isChild = guest.ageGroup === "Child" || guest.ageGroup === "Infant";
    const tags = [
      `tier:${guest.tier}`,
      guest.probabilityScore ? `likelihood:${Math.round(guest.probabilityScore)}` : null,
      guest.ageGroup ? `age:${guest.ageGroup.toLowerCase()}` : null,
    ].filter(Boolean) as string[];

    const cantDo = availabilityByName.get(guest.fullName.toLowerCase());

    const created = await db.guest.create({
      data: {
        weddingId: wedding.id,
        householdId,
        firstName: guest.firstName,
        lastName: guest.lastName,
        side: sideOf(guest.side),
        relationship: cleanLabel(guest.category),
        isChild,
        // Everyone is flying in — this is a destination wedding.
        needsAccommodation: true,
        needsTransport: true,
        isVIP: guest.category?.startsWith("0") ?? false,
        tags,
        notes: cantDo ? `Availability: can't do ${cantDo}` : null,
      },
      select: { id: true },
    });
    guestIdByName.set(guest.fullName.toLowerCase(), created.id);

    // A resort takeover: everyone who comes is on site for the whole week, so
    // every guest is invited to every function. Tier C isn't invited at all.
    const onTheList = guest.tier === "A" || guest.tier === "B";

    await db.eventInvitation.createMany({
      data: Object.values(events).map((eventId) => ({
        guestId: created.id,
        eventId,
        status: onTheList ? ("PENDING" as const) : ("NOT_INVITED" as const),
      })),
    });
  }

  // ── Rooms ──────────────────────────────────────────────────────────────────
  console.log(`→ Loading ${data.rooms.length} room allocations…`);
  const hotel = await db.hotel.create({
    data: {
      weddingId: wedding.id,
      name: "Conrad Bali",
      city: "Bali, Indonesia",
      contractedRooms: data.rooms.length,
      currency: "USD",
      ratePerNight: 350,
      notes:
        "On-site rooms at the Conrad. 360 available; the plan below uses 112. " +
        "Rates firm up when the contract is signed.",
      rooms: {
        create: [{ roomType: "Twin / Double", count: data.rooms.length, capacity: 3, ratePerNight: 350 }],
      },
    },
    include: { rooms: true },
  });

  let staysCreated = 0;
  for (const room of data.rooms) {
    for (const occupant of room.occupants) {
      const guestId = guestIdByName.get(occupant.toLowerCase());
      if (!guestId) continue;
      await db.stay.create({
        data: {
          weddingId: wedding.id,
          guestId,
          hotelId: hotel.id,
          roomId: hotel.rooms[0].id,
          roomNumber: String(room.number),
          checkIn: civil("2027-06-15"),
          checkOut: civil("2027-06-20"),
        },
      });
      staysCreated += 1;
    }
  }
  console.log(`   ${staysCreated} guests allocated to rooms`);

  // ── Budget ─────────────────────────────────────────────────────────────────
  console.log("→ Building the budget…");
  const { categories, budgetItems } = await seedBudget(wedding.id, events, planner.id);

  // ── Milni ──────────────────────────────────────────────────────────────────
  console.log(`→ Loading ${data.milni.length} milni pairings…`);
  for (const pairing of data.milni) {
    await db.responsibility.create({
      data: {
        weddingId: wedding.id,
        title: `Milni — ${pairing.relationship}`,
        area: "Rituals",
        eventId: events.shaadi,
        importance: 3,
        notes: `${pairing.bride ?? "—"} (bride's side) greets ${pairing.groom ?? "—"} (groom's side).`,
        status: "UNASSIGNED",
      },
    });
  }

  // ── The plan ───────────────────────────────────────────────────────────────
  console.log("→ Generating the master plan…");
  const plan = await generateMasterPlan(wedding.id, { clampPastTo: day(-30) });
  console.log(`   ${plan.created} tasks, ${plan.dependenciesCreated} dependencies`);
  await progressTasks(wedding.id, members, categories);

  await seedOperations({
    db, weddingId: wedding.id, events, members, users,
    plannerId: planner.id, venueVendors, payers, budgetItems, day,
  });

  const counts = await db.$transaction([
    db.guest.count({ where: { weddingId: wedding.id } }),
    db.household.count({ where: { weddingId: wedding.id } }),
    db.task.count({ where: { weddingId: wedding.id } }),
    db.vendor.count({ where: { weddingId: wedding.id } }),
    db.stay.count({ where: { weddingId: wedding.id } }),
  ]);

  console.log(
    `\n✓ ${counts[0]} guests in ${counts[1]} households · ${counts[2]} tasks · ` +
    `${counts[3]} vendors · ${counts[4]} room allocations`,
  );
  console.log("\n  Accounts (password: wedding2027)");
  for (const person of people) {
    console.log(`   ${person.email.padEnd(28)} ${person.name} — ${person.relation}`);
  }
}

// ────────────────────────────────────────────────────────────────── Budget

async function seedBudget(
  weddingId: string,
  events: Record<string, string>,
  plannerId: string,
) {
  // Categories derived from their own cost lines, grouped sensibly.
  const categorySeed = [
    { key: "accommodation", name: "Accommodation", allocated: 108_600, tone: "sky" },
    { key: "catering", name: "Catering & Bar", allocated: 22_000, tone: "olive" },
    { key: "decor", name: "Decor & Florals", allocated: 11_600, tone: "shaadi" },
    { key: "photo", name: "Photography & Film", allocated: 7_800, tone: "indigo" },
    { key: "entertainment", name: "Music & Entertainment", allocated: 14_000, tone: "sangeet" },
    { key: "beauty", name: "Hair, Makeup & Mehendi", allocated: 6_000, tone: "rose" },
    { key: "logistics", name: "Travel & Transfers", allocated: 10_500, tone: "teal" },
    { key: "planning", name: "Planning & Coordination", allocated: 18_600, tone: "slate" },
    { key: "rituals", name: "Rituals & Pandit", allocated: 1_600, tone: "haldi" },
    { key: "stationery", name: "Stationery & Gifts", allocated: 5_000, tone: "reception" },
  ];

  const categories: Record<string, string> = {};
  for (const [index, category] of categorySeed.entries()) {
    const row = await db.budgetCategory.create({
      data: {
        weddingId,
        name: category.name,
        allocatedAmount: category.allocated,
        sortOrder: index,
        accentTone: category.tone,
      },
    });
    categories[category.key] = row.id;
  }

  // Their cost lines, in USD as recorded, with the estimate they've settled on.
  const included = data.budgetItems.filter(
    (item) =>
      item.exclude !== null &&
      !["Grand Total", "Hotel", "Wedding Planner", "Other Wedding Costs"].includes(item.item),
  );

  const CATEGORY_FOR: { match: RegExp; key: string; event?: string; model?: "PER_GUEST" }[] = [
    { match: /sound|lighting|dj/i, key: "entertainment" },
    { match: /photograph|video/i, key: "photo" },
    { match: /transport/i, key: "logistics" },
    { match: /decorat/i, key: "decor" },
    { match: /alcohol|bartender|catering/i, key: "catering" },
    { match: /mehendi/i, key: "beauty", event: "mehendi" },
    { match: /make ?up|hair/i, key: "beauty" },
    { match: /dhol|firedancer|firework|balinese/i, key: "entertainment" },
    { match: /cake/i, key: "catering" },
    { match: /pandit/i, key: "rituals", event: "shaadi" },
    { match: /hamper|stationary|stationery/i, key: "stationery" },
    { match: /vendor flight/i, key: "logistics" },
  ];

  const budgetItems: Record<string, string> = {};

  for (const item of included) {
    const mapping = CATEGORY_FOR.find((c) => c.match.test(item.item));
    const amount = item.ncPmEstimate ?? item.dcEstimate ?? item.vishalInitial ?? 0;
    if (!amount) continue;

    const row = await db.budgetItem.create({
      data: {
        weddingId,
        categoryId: categories[mapping?.key ?? "planning"],
        name: item.item.length > 90 ? `${item.item.slice(0, 87)}…` : item.item,
        eventId: mapping?.event ? events[mapping.event] : null,
        costModel: "FIXED",
        currency: "USD",
        allocatedAmount: amount,
        estimateAmount: amount,
        notes:
          item.exclude === "No"
            ? "Currently excluded from the working estimate."
            : item.vishalInitial && item.vishalInitial !== amount
              ? `Planner's initial estimate was $${item.vishalInitial.toLocaleString()}.`
              : null,
      },
      select: { id: true },
    });
    budgetItems[item.item] = row.id;
  }

  // The two lines that dominate everything, kept explicit and guest-driven.
  const accommodation = await db.budgetItem.create({
    data: {
      weddingId,
      categoryId: categories.accommodation,
      name: "Guest accommodation",
      costModel: "PER_ROOM",
      currency: "USD",
      allocatedAmount: 140_000,
      unitRate: 1_750, // 5 nights at ~$350
      notes: "5 nights per room. Moves with how many guests need a bed.",
    },
    select: { id: true },
  });
  budgetItems["Guest accommodation"] = accommodation.id;

  const plannerFee = await db.budgetItem.create({
    data: {
      weddingId,
      categoryId: categories.planning,
      name: "Wedding planner",
      vendorId: plannerId,
      costModel: "FIXED",
      currency: "USD",
      allocatedAmount: 24_000,
      quoteAmount: 24_000,
      notes: "Eventures — full planning and on-site delivery.",
    },
    select: { id: true },
  });
  budgetItems["Wedding planner"] = plannerFee.id;

  const catering = await db.budgetItem.create({
    data: {
      weddingId,
      categoryId: categories.catering,
      name: "Catered events — per guest",
      costModel: "PER_GUEST",
      guestBasis: "CONFIRMED_PLUS_PENDING",
      currency: "USD",
      allocatedAmount: 55_000,
      unitRate: 240,
      notes: "Across all five functions. Recalculates as the guest list firms up.",
    },
    select: { id: true },
  });
  budgetItems["Catering"] = catering.id;

  return { categories, budgetItems };
}

/** Put the generated plan into a believable early-stage state. */
async function progressTasks(
  weddingId: string,
  members: Record<string, string>,
  categories: Record<string, string>,
) {
  const tasks = await db.task.findMany({
    where: { weddingId },
    orderBy: { dueDate: "asc" },
    select: { id: true, templateKey: true, phase: true, dueDate: true },
  });

  const owners = Object.values(members);

  // What they have genuinely done: agreed the guest list, set a budget,
  // shortlisted venues, spoken to a planner.
  const done = new Set([
    "foundation-guest-estimate", "foundation-budget", "foundation-split",
    "foundation-events", "foundation-cities", "foundation-traditions",
    "invite-guest-list", "hotel-estimate", "venue-research",
  ]);
  const inProgress = new Set([
    "foundation-date", "venue-availability", "venue-pricing", "venue-walkthrough",
    "foundation-planner", "hotel-shortlist", "travel-collect", "foundation-style",
  ]);

  for (const [index, task] of tasks.entries()) {
    const base = (task.templateKey ?? "").split(":")[0];
    let status: "NOT_STARTED" | "IN_PROGRESS" | "DONE" = "NOT_STARTED";
    if (done.has(base)) status = "DONE";
    else if (inProgress.has(base)) status = "IN_PROGRESS";

    await db.task.update({
      where: { id: task.id },
      data: {
        status,
        completedAt: status === "DONE" ? day(-20 - (index % 60)) : null,
        ownerId: index % 5 === 4 ? null : owners[index % owners.length],
        categoryId: pickCategory(base, categories),
      },
    });
  }
}

function pickCategory(
  templateKey: string,
  categories: Record<string, string>,
): string | null {
  const map: Record<string, string> = {
    venue: "accommodation", catering: "catering", decor: "decor", photo: "photo",
    bride: "stationery", groom: "stationery", jewel: "stationery",
    sangeet: "entertainment", ent: "entertainment", hmua: "beauty",
    mehendi: "beauty", hotel: "accommodation", transport: "logistics",
    travel: "logistics", invite: "stationery", gifts: "stationery",
    shaadi: "rituals",
  };
  const key = map[templateKey.split("-")[0]];
  return key ? categories[key] ?? null : null;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
