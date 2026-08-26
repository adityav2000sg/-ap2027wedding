"use server";

import { z } from "zod";

import { formatMediumDate } from "@/lib/dates";
import { logViewerActivity } from "@/server/activity";
import { db } from "@/server/db";
import {
  optionalCivilDate,
  optionalId,
  optionalMoney,
  optionalString,
  revalidateWedding,
  withAction,
} from "./shared";

const OUTFIT_STATUS = [
  "IDEA", "SHORTLISTING", "ORDERED", "RECEIVED", "ALTERATIONS", "READY", "WORN", "RETURNED",
] as const;

export const OUTFIT_STATUS_LABEL: Record<string, string> = {
  IDEA: "Inspiration",
  SHORTLISTING: "Shortlisted",
  ORDERED: "Ordered",
  RECEIVED: "Received",
  ALTERATIONS: "Alterations",
  READY: "Ready",
  WORN: "Worn",
  RETURNED: "Returned",
};

const outfitSchema = z.object({
  personId: z.string().min(1, "Whose outfit is this?"),
  eventId: optionalId.optional(),
  outfitType: z.string().trim().min(1, "What is it?").max(120),
  designer: optionalString.optional(),
  vendorId: optionalId.optional(),
  cost: optionalMoney.optional(),
  currency: z.string().length(3).default("GBP"),
  status: z.enum(OUTFIT_STATUS).default("IDEA"),
  orderDate: optionalCivilDate.optional(),
  deliveryDate: optionalCivilDate.optional(),
  notes: optionalString.optional(),
});

export async function createOutfit(input: unknown) {
  return withAction("wardrobe.edit", async (viewer) => {
    const data = outfitSchema.parse(input);

    const person = await db.wardrobePerson.findFirst({
      where: { id: data.personId, weddingId: viewer.weddingId },
      select: { id: true, name: true },
    });
    if (!person) throw new Error("That person isn't in the wardrobe yet.");

    const outfit = await db.outfit.create({
      data: { weddingId: viewer.weddingId, ...data },
      select: { id: true, outfitType: true },
    });

    await logViewerActivity(viewer, {
      entityType: "outfit",
      entityId: outfit.id,
      entityLabel: outfit.outfitType,
      action: "created",
      summary: `${viewer.name} added ${person.name}'s ${outfit.outfitType.toLowerCase()}.`,
    });

    revalidateWedding();
    return { id: outfit.id };
  });
}

export async function updateOutfit(input: unknown) {
  return withAction("wardrobe.edit", async (viewer) => {
    const data = outfitSchema
      .partial()
      .extend({ id: z.string().min(1) })
      .parse(input);
    const { id, ...patch } = data;

    const existing = await db.outfit.findFirst({
      where: { id, weddingId: viewer.weddingId },
      include: { person: { select: { name: true } } },
    });
    if (!existing) throw new Error("That outfit no longer exists.");

    const updated = await db.outfit.update({
      where: { id },
      data: patch,
      select: { id: true, outfitType: true, status: true },
    });

    const summary =
      patch.status && patch.status !== existing.status
        ? `${existing.person.name}'s ${updated.outfitType.toLowerCase()} moved to ${OUTFIT_STATUS_LABEL[patch.status]}.`
        : `${viewer.name} updated ${existing.person.name}'s ${updated.outfitType.toLowerCase()}.`;

    await logViewerActivity(viewer, {
      entityType: "outfit",
      entityId: updated.id,
      entityLabel: updated.outfitType,
      action: patch.status ? "status_changed" : "updated",
      summary,
      before: { status: existing.status },
      after: patch as Record<string, unknown>,
      undoable: true,
    });

    revalidateWedding();
    return { id: updated.id };
  });
}

export async function archiveOutfit(id: string) {
  return withAction("wardrobe.edit", async (viewer) => {
    const outfit = await db.outfit.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, outfitType: true },
    });
    if (!outfit) throw new Error("That outfit no longer exists.");

    await db.outfit.update({ where: { id }, data: { archivedAt: new Date() } });
    await logViewerActivity(viewer, {
      entityType: "outfit",
      entityId: outfit.id,
      entityLabel: outfit.outfitType,
      action: "archived",
      summary: `${viewer.name} removed ${outfit.outfitType}.`,
      undoable: true,
    });

    revalidateWedding();
    return { id };
  });
}

// ───────────────────────────────────────────────────────────────── Fittings

const fittingSchema = z.object({
  outfitId: z.string().min(1),
  kind: z.enum(["FIRST", "SECOND", "FINAL", "TRIAL"]).default("FIRST"),
  scheduledAt: z.string().min(1, "When is it?"),
  location: optionalString.optional(),
  notes: optionalString.optional(),
});

/**
 * Booking a fitting creates a real task, so it turns up in the normal to-do
 * flow rather than being a date buried in the wardrobe.
 */
export async function createFitting(input: unknown) {
  return withAction("wardrobe.edit", async (viewer) => {
    const data = fittingSchema.parse(input);
    const scheduledAt = new Date(data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) throw new Error("That date isn't valid.");

    const outfit = await db.outfit.findFirst({
      where: { id: data.outfitId, weddingId: viewer.weddingId },
      include: { person: { select: { name: true } } },
    });
    if (!outfit) throw new Error("That outfit no longer exists.");

    const label = `${outfit.person.name} — ${KIND_LABEL[data.kind]} fitting`;

    const result = await db.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          weddingId: viewer.weddingId,
          title: label,
          description: [outfit.outfitType, data.location].filter(Boolean).join(" · "),
          priority: data.kind === "FINAL" ? "HIGH" : "MEDIUM",
          importance: data.kind === "FINAL" ? 4 : 3,
          phase: "TWO_MONTHS",
          eventId: outfit.eventId,
          dueDate: new Date(
            Date.UTC(
              scheduledAt.getUTCFullYear(),
              scheduledAt.getUTCMonth(),
              scheduledAt.getUTCDate(),
            ),
          ),
          createdById: viewer.memberId,
        },
        select: { id: true },
      });

      const fitting = await tx.fitting.create({
        data: {
          outfitId: outfit.id,
          kind: data.kind,
          scheduledAt,
          location: data.location ?? null,
          notes: data.notes ?? null,
          taskId: task.id,
        },
        select: { id: true },
      });

      return { fittingId: fitting.id, taskId: task.id };
    });

    await logViewerActivity(viewer, {
      entityType: "outfit",
      entityId: outfit.id,
      entityLabel: outfit.outfitType,
      action: "fitting_booked",
      summary: `${viewer.name} booked ${label.toLowerCase()} for ${formatMediumDate(scheduledAt)}. A task has been created.`,
    });

    revalidateWedding();
    return result;
  });
}

export async function completeFitting(id: string) {
  return withAction("wardrobe.edit", async (viewer) => {
    const fitting = await db.fitting.findFirst({
      where: { id, outfit: { weddingId: viewer.weddingId } },
      include: { outfit: { include: { person: { select: { name: true } } } } },
    });
    if (!fitting) throw new Error("That fitting no longer exists.");

    await db.$transaction(async (tx) => {
      await tx.fitting.update({ where: { id }, data: { completedAt: new Date() } });
      if (fitting.taskId) {
        await tx.task.updateMany({
          where: { id: fitting.taskId, status: { notIn: ["DONE", "CANCELLED"] } },
          data: { status: "DONE", completedAt: new Date() },
        });
      }
    });

    await logViewerActivity(viewer, {
      entityType: "outfit",
      entityId: fitting.outfitId,
      entityLabel: fitting.outfit.outfitType,
      action: "fitting_completed",
      summary: `${fitting.outfit.person.name}'s ${KIND_LABEL[fitting.kind].toLowerCase()} fitting is done.`,
    });

    revalidateWedding();
    return { id };
  });
}

// ──────────────────────────────────────────────────────────────── Jewellery

const jewellerySchema = z.object({
  name: z.string().trim().min(1, "What is it?").max(160),
  personId: optionalId.optional(),
  eventId: optionalId.optional(),
  ownership: z.enum(["OWNED", "PURCHASED", "RENTED", "BORROWED"]).default("OWNED"),
  jeweller: optionalString.optional(),
  cost: optionalMoney.optional(),
  currency: z.string().length(3).default("GBP"),
  pickupDate: optionalCivilDate.optional(),
  returnDate: optionalCivilDate.optional(),
  responsibleId: optionalId.optional(),
  storageNote: optionalString.optional(),
  insured: z.boolean().default(false),
  notes: optionalString.optional(),
});

export async function createJewellery(input: unknown) {
  return withAction("wardrobe.edit", async (viewer) => {
    const data = jewellerySchema.parse(input);
    const item = await db.jewelleryItem.create({
      data: { weddingId: viewer.weddingId, ...data },
      select: { id: true, name: true },
    });

    await logViewerActivity(viewer, {
      entityType: "jewellery",
      entityId: item.id,
      entityLabel: item.name,
      action: "created",
      summary: `${viewer.name} added ${item.name} to the jewellery list.`,
    });

    revalidateWedding();
    return { id: item.id };
  });
}

export async function updateJewellery(input: unknown) {
  return withAction("wardrobe.edit", async (viewer) => {
    const data = jewellerySchema
      .partial()
      .extend({ id: z.string().min(1) })
      .parse(input);
    const { id, ...patch } = data;

    const item = await db.jewelleryItem.findFirst({
      where: { id, weddingId: viewer.weddingId },
      select: { id: true, name: true },
    });
    if (!item) throw new Error("That item no longer exists.");

    await db.jewelleryItem.update({ where: { id }, data: patch });
    revalidateWedding();
    return { id };
  });
}

// ─────────────────────────────────────────────────────────────────── People

export async function createWardrobePerson(name: string, role: string) {
  return withAction("wardrobe.edit", async (viewer) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1, "Who is it?").max(120),
        role: z.string().trim().min(1, "How are they related?").max(80),
      })
      .parse({ name, role });

    const count = await db.wardrobePerson.count({ where: { weddingId: viewer.weddingId } });
    const person = await db.wardrobePerson.create({
      data: { weddingId: viewer.weddingId, ...parsed, sortOrder: count },
      select: { id: true, name: true },
    });

    revalidateWedding();
    return { id: person.id, name: person.name };
  });
}

const KIND_LABEL: Record<string, string> = {
  FIRST: "First",
  SECOND: "Second",
  FINAL: "Final",
  TRIAL: "Trial",
};
