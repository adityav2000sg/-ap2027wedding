/**
 * Permissions.
 *
 * Every authenticated member has the same capability set. Permission names are
 * retained as feature-level guards so server actions still require a signed-in
 * viewer and cannot accidentally become public. They are not user roles.
 */

export const PERMISSIONS = [
  "wedding.configure",
  "members.manage",
  "events.edit",
  "tasks.edit",
  "guests.edit",
  "vendors.edit",
  "budget.view",
  "budget.edit",
  "payments.approve",
  "documents.view",
  "documents.upload",
  "timeline.edit",
  "logistics.edit",
  "wardrobe.edit",
  "ai.use",
  "ai.execute",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface Viewer {
  userId: string;
  memberId: string;
  weddingId: string;
  name: string;
  email: string;
  relation: string;
  avatarTone: string;
  /** The currency this person reads every figure in. */
  displayCurrency: string;
  permissions: Set<Permission>;
}

/** A fresh capability set for any authenticated wedding member. */
export function resolvePermissions(): Set<Permission> {
  return new Set(PERMISSIONS);
}

export function can(viewer: Viewer, permission: Permission): boolean {
  return viewer.permissions.has(permission);
}

export class PermissionError extends Error {
  constructor(permission: Permission) {
    super(`You don't have permission to do that (${permission}).`);
    this.name = "PermissionError";
  }
}

/** Throws unless the viewer holds the permission. Call this in every mutation. */
export function requirePermission(viewer: Viewer, permission: Permission): void {
  if (!can(viewer, permission)) throw new PermissionError(permission);
}
