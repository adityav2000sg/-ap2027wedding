/**
 * Two corrections to imported data.
 *
 *   npm run fix:allocations            # dry run
 *   npm run fix:allocations -- --apply
 *
 * 1. Room 12 held four people from two households — Avya and Prisha Sawhney
 *    together with Neeta and Sanjay Chowdhry. The Chowdhrys move to their own
 *    room; the Sawhney girls keep 12.
 *
 * 2. The men's reception outfits came in as a tuxedo and two suits. The
 *    reception is Indian, so they become Indo-western and bandhgala.
 *
 * 3. Aditya Vaidya has an account and is in the wedding party, but was never
 *    added to the wardrobe, so he had no tab of his own — and once added, no
 *    looks against any of the five functions.
 *
 * Idempotent and safe to re-run: each change checks the current value first and
 * does nothing if it has already been made, or if somebody has since changed it
 * to something else. Nothing is deleted.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Reception is Indian, so no black tie. Repeats of Sangeet's bandhgala are
 *  fine for the fathers; the groom gets something distinct from both his
 *  bandhgala and his shaadi sherwani. */
const RECEPTION_OUTFITS: { person: string; from: string; to: string }[] = [
  { person: "Prateek", from: "Tuxedo", to: "Indo-western" },
  { person: "Ajay Mehan", from: "Suit", to: "Bandhgala" },
  { person: "Dheeraj Chowdhry", from: "Suit", to: "Bandhgala" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const planned: string[] = [];
  const skipped: string[] = [];

  // ── 1. Room 12 ──────────────────────────────────────────────────────────
  const room12 = await db.stay.findMany({
    where: { roomNumber: "12" },
    include: { guest: { select: { firstName: true, lastName: true, householdId: true } } },
  });

  const moving = room12.filter((stay) =>
    ["Neeta", "Sanjay"].includes(stay.guest.firstName) &&
    stay.guest.lastName === "Chowdhry",
  );

  if (room12.length <= 2) {
    skipped.push("Room 12 already has two or fewer people — leaving it alone.");
  } else if (moving.length === 0) {
    skipped.push("Nobody named Neeta or Sanjay Chowdhry is in room 12 any more.");
  } else {
    // Take the next free number rather than a hardcoded one, so this still does
    // the right thing if the room list has moved on.
    const used = new Set(
      (await db.stay.findMany({ where: { roomNumber: { not: null } }, select: { roomNumber: true } }))
        .map((s) => Number(s.roomNumber))
        .filter((n) => Number.isFinite(n)),
    );
    let free = 1;
    while (used.has(free)) free += 1;

    planned.push(
      `Move ${moving.map((s) => `${s.guest.firstName} ${s.guest.lastName}`).join(" and ")} ` +
      `from room 12 to room ${free}.`,
    );

    if (apply) {
      await db.stay.updateMany({
        where: { id: { in: moving.map((s) => s.id) } },
        data: { roomNumber: String(free) },
      });
    }
  }

  // ── 2. Reception outfits ────────────────────────────────────────────────
  for (const change of RECEPTION_OUTFITS) {
    const outfit = await db.outfit.findFirst({
      where: {
        person: { name: change.person },
        event: { name: "Reception" },
      },
      select: { id: true, outfitType: true },
    });

    if (!outfit) {
      skipped.push(`No reception outfit found for ${change.person}.`);
      continue;
    }
    if (outfit.outfitType === change.to) continue; // already done
    if (outfit.outfitType !== change.from) {
      skipped.push(
        `${change.person}'s reception outfit is "${outfit.outfitType}", not "${change.from}" — leaving it.`,
      );
      continue;
    }

    planned.push(`${change.person}: ${change.from} → ${change.to} for the reception.`);
    if (apply) {
      await db.outfit.update({
        where: { id: outfit.id },
        data: { outfitType: change.to },
      });
    }
  }

  // ── 3. Anyone in the wedding party with no wardrobe tab ─────────────────
  const MISSING_PEOPLE = ["Aditya Vaidya"];

  for (const name of MISSING_PEOPLE) {
    const existing = await db.wardrobePerson.findFirst({ where: { name } });
    if (existing) continue;

    const wedding = await db.wedding.findFirst({ select: { id: true } });
    if (!wedding) {
      skipped.push("No wedding found, so no wardrobe person was added.");
      break;
    }

    // Take how they're described from their membership rather than restating
    // it here. Guessing produced "Bride's Brother-in-law" for someone who isn't
    // married into the family yet.
    const member = await db.weddingMember.findFirst({
      where: { user: { name } },
      select: { relation: true },
    });
    if (!member) {
      skipped.push(`${name} has no membership to take a relation from.`);
      continue;
    }
    const person = { name, role: member.relation };

    planned.push(`Add ${person.name} to the wardrobe as ${person.role}.`);
    if (apply) {
      // Onto the end of the list. Left at the default of 0 he ties with the
      // bride and lands second, ahead of the groom and both sets of parents.
      const last = await db.wardrobePerson.aggregate({
        where: { weddingId: wedding.id },
        _max: { sortOrder: true },
      });

      await db.wardrobePerson.create({
        data: {
          weddingId: wedding.id,
          name: person.name,
          role: person.role,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
        },
      });
    }
  }

  // ── 4. A look for every function, for anyone who has none ───────────────
  //
  // The same five the other men are carrying — kurta through to the reception.
  // Left as ideas rather than decisions: this is a row to fill in, not a claim
  // that anything has been chosen.
  const MENS_LOOKS: { event: string; outfitType: string }[] = [
    { event: "Haldi", outfitType: "Kurta" },
    { event: "Mehendi", outfitType: "Kurta set" },
    { event: "Sangeet", outfitType: "Bandhgala" },
    { event: "Shaadi", outfitType: "Sherwani" },
    { event: "Reception", outfitType: "Bandhgala" },
  ];

  for (const name of MISSING_PEOPLE) {
    const person = await db.wardrobePerson.findFirst({
      where: { name },
      select: { id: true, weddingId: true },
    });
    if (!person) continue;

    for (const look of MENS_LOOKS) {
      const event = await db.event.findFirst({
        where: { weddingId: person.weddingId, name: look.event, archivedAt: null },
        select: { id: true },
      });
      if (!event) {
        skipped.push(`No "${look.event}" function, so no look was added for ${name}.`);
        continue;
      }

      const existing = await db.outfit.findFirst({
        where: { personId: person.id, eventId: event.id, archivedAt: null },
      });
      if (existing) continue;

      planned.push(`Add ${name} a ${look.outfitType.toLowerCase()} for the ${look.event}.`);
      if (apply) {
        await db.outfit.create({
          data: {
            weddingId: person.weddingId,
            personId: person.id,
            eventId: event.id,
            outfitType: look.outfitType,
            // Matching what everyone else carries, so the wardrobe totals and
            // the "nothing ordered yet" counts stay consistent.
            status: "IDEA",
            currency: "GBP",
          },
        });
      }
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────
  if (skipped.length > 0) {
    console.log("\nSkipped:\n");
    for (const note of skipped) console.log(`   ${note}`);
  }

  if (planned.length === 0) {
    console.log("\n✓ Nothing to change — already applied.\n");
    return;
  }

  console.log(`\n${apply ? "Applied" : "Would apply"}:\n`);
  for (const note of planned) console.log(`   ${note}`);
  console.log(apply ? "\n✓ Done.\n" : "\nDry run. Re-run with --apply to write.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
