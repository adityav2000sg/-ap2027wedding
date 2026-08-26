/**
 * Permissions.
 *
 * Roles map to a capability set. The UI hides what you can't do, but the *check*
 * that matters happens server-side in `requirePermission` before every mutation
 * — hiding a button is a courtesy, not a control.
 *
 * Deliberately coarse. A wedding has six or seven people in it; a fine-grained
 * ACL would be more work to manage than the thing it protects.
 */

import type { MemberRole } from "@prisma/client";

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

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<MemberRole, Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((p) => p !== "wedding.configure"),
  PLANNER: [
    "events.edit", "tasks.edit", "guests.edit", "vendors.edit",
    "budget.view", "budget.edit", "documents.view", "documents.upload",
    "timeline.edit", "logistics.edit", "wardrobe.edit", "ai.use", "ai.execute",
  ],
  FAMILY: [
    "tasks.edit", "guests.edit", "budget.view", "documents.view",
    "wardrobe.edit", "logistics.edit", "ai.use",
  ],
  // Contributors can do work but can't see what anything costs.
  CONTRIBUTOR: ["tasks.edit", "documents.view", "ai.use"],
  VIEWER: ["documents.view"],
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  PLANNER: "Planner",
  FAMILY: "Family",
  CONTRIBUTOR: "Helper",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTION: Record<MemberRole, string> = {
  OWNER: "Full control, including wedding settings and who else has access.",
  ADMIN: "Can change anything except the core wedding configuration.",
  PLANNER: "Runs the planning — everything except member access.",
  FAMILY: "Can help with tasks, guests and logistics, and see the budget.",
  CONTRIBUTOR: "Can work on tasks. Cannot see any financial information.",
  VIEWER: "Read-only access to documents.",
};

export interface Viewer {
  userId: string;
  memberId: string;
  weddingId: string;
  name: string;
  email: string;
  role: MemberRole;
  relation: string;
  avatarTone: string;
  /** The currency this person reads every figure in. */
  displayCurrency: string;
  permissions: Set<Permission>;
}

/**
 * Effective permissions = role defaults, plus any per-member overrides.
 * Overrides are `{ "budget.view": false }` style and can revoke as well as grant.
 */
export function resolvePermissions(
  role: MemberRole,
  overrides: unknown,
): Set<Permission> {
  const permissions = new Set<Permission>(ROLE_PERMISSIONS[role]);
  if (overrides && typeof overrides === "object") {
    for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
      if (!PERMISSIONS.includes(key as Permission)) continue;
      if (value === true) permissions.add(key as Permission);
      if (value === false) permissions.delete(key as Permission);
    }
  }
  return permissions;
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
