import "server-only";

/**
 * Shared plumbing for every server action.
 *
 * The rule this enforces: no mutation happens without resolving the viewer
 * server-side, checking a permission, and writing an activity entry. Hiding a
 * button in the UI is a courtesy; this is the control.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireViewer } from "@/server/auth";
import { PermissionError, requirePermission, type Permission, type Viewer } from "@/server/permissions";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/**
 * Wraps an action body with auth, permission checking and error shaping.
 * Zod issues come back as field errors so forms can highlight the right input.
 */
export async function withAction<T>(
  permission: Permission,
  body: (viewer: Viewer) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const viewer = await requireViewer();
    requirePermission(viewer, permission);
    return ok(await body(viewer));
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return fail(
        error.issues[0]?.message ?? "Some details need fixing.",
        fieldErrors,
      );
    }
    if (error instanceof PermissionError) {
      return fail(error.message);
    }
    // Next uses thrown objects for redirect/notFound — never swallow those.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_")
    ) {
      throw error;
    }
    console.error("[action]", error);
    return fail(
      error instanceof Error ? error.message : "Something went wrong.",
    );
  }
}

/**
 * Refresh every route that could be showing a number this change affects.
 *
 * Because the app is deeply interconnected — a vendor quote moves the budget,
 * the dashboard and the activity feed — targeted revalidation would be a
 * constant source of stale figures. The dataset is small; revalidating the
 * whole tree is both correct and fast.
 */
export function revalidateWedding(): void {
  revalidatePath("/", "layout");
}

/** Common coercions used across the action schemas. */
export const optionalString = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

export const optionalId = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 || value === "none" ? null : value))
  .nullable();

export const moneyAmount = z.coerce
  .number()
  .finite("Enter a valid amount.")
  .min(0, "Amount cannot be negative.")
  .max(9_999_999_999, "That amount is too large.");

export const optionalMoney = z
  .union([z.literal(""), z.coerce.number()])
  .transform((value) => (value === "" ? null : Number(value)))
  .nullable()
  .refine(
    (value) => value === null || (Number.isFinite(value) && value >= 0),
    "Enter a valid amount.",
  );

/** `YYYY-MM-DD` from a date input into a UTC-midnight civil date. */
export const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const optionalCivilDate = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")])
  .transform((value) => (value === "" ? null : new Date(`${value}T00:00:00.000Z`)))
  .nullable();

/** `HH:MM` into minutes from midnight. */
export const timeToMinutes = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Choose a valid time.")
  .transform((value) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  });
