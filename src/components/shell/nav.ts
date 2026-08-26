import type { Permission } from "@/server/permissions";

/**
 * Navigation definition.
 *
 * `icon` is a *key*, not a component: this list is built on the server and
 * handed to a client component, and functions can't cross that boundary. The
 * client resolves the key through `NAV_ICONS`.
 */
export type IconKey =
  | "home" | "calendar" | "tasks" | "guests" | "vendors" | "budget"
  | "timeline" | "logistics" | "wardrobe" | "moodboard" | "documents" | "ai"
  | "activity" | "settings";

export interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  /** Hidden entirely when the viewer lacks this permission. */
  requires?: Permission;
  /** Shown in the mobile tab bar. */
  mobile?: boolean;
  group: "plan" | "people" | "money" | "day" | "system";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home", group: "plan", mobile: true },
  { href: "/events", label: "Events", icon: "calendar", group: "plan" },
  { href: "/tasks", label: "Tasks", icon: "tasks", group: "plan", mobile: true },

  { href: "/guests", label: "Guests", icon: "guests", group: "people", mobile: true },
  { href: "/vendors", label: "Vendors", icon: "vendors", group: "people" },

  { href: "/budget", label: "Budget", icon: "budget", group: "money", requires: "budget.view" },

  { href: "/timeline", label: "Timeline", icon: "timeline", group: "day", mobile: true },
  { href: "/logistics", label: "Logistics", icon: "logistics", group: "day" },
  { href: "/wardrobe", label: "Wardrobe", icon: "wardrobe", group: "day" },
  { href: "/moodboard", label: "Moodboard", icon: "moodboard", group: "day" },
  { href: "/documents", label: "Documents", icon: "documents", group: "day", requires: "documents.view" },

  { href: "/ai", label: "AI Planner", icon: "ai", group: "system", requires: "ai.use" },
  { href: "/activity", label: "Activity", icon: "activity", group: "system" },
  { href: "/settings", label: "Settings", icon: "settings", group: "system" },
];

export const NAV_GROUPS: { key: NavItem["group"]; label: string }[] = [
  { key: "plan", label: "Plan" },
  { key: "people", label: "People" },
  { key: "money", label: "Money" },
  { key: "day", label: "The days themselves" },
  { key: "system", label: "" },
];

export function visibleNavItems(permissions: string[]): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.requires || permissions.includes(item.requires),
  );
}

/** Longest-prefix match, so /events/sangeet highlights Events. */
export function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
