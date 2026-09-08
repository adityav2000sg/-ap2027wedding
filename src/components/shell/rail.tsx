"use client";

/**
 * The navigation sidebar.
 *
 * It was a 72px icon rail, which looked handsome and told nobody anything —
 * fourteen glyphs with no labels means guessing, or hovering one at a time for a
 * tooltip. Names are on now. Chrome that has to be decoded isn't quiet, it's
 * just quietly in the way.
 *
 * Grouped as the drawer groups them, so the two navigations teach each other.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { Avatar, Badge } from "@/components/ui/primitives";
import { Popover, Tooltip } from "@/components/ui/overlays";
import { PlusIcon, SearchIcon } from "@/components/ui/icons";
import { isActiveHref, NAV_GROUPS, type NavItem } from "./nav";
import { NAV_ICONS } from "./nav-icons";
import { signOut } from "@/app/login/actions";
import { CurrencyPicker } from "./currency-picker";
import { NotificationBell, type NotificationItem } from "./notifications";

export interface ShellViewer {
  name: string;
  relation: string;
  tone: string;
  email: string;
  displayCurrency: string;
}

export function Rail({
  items,
  viewer,
  alertCount,
  notifications,
  unreadCount,
  onOpenSearch,
  onOpenQuickAdd,
}: {
  items: NavItem[];
  viewer: ShellViewer;
  alertCount: number;
  notifications: NotificationItem[];
  unreadCount: number;
  onOpenSearch(): void;
  onOpenQuickAdd(): void;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => item.group === group.key),
  })).filter((group) => group.items.length > 0);

  return (
    <aside className="sticky top-0 hidden h-dvh w-[212px] shrink-0 flex-col border-r border-line bg-surface-soft px-3 py-4 lg:flex">
      <Monogram />

      <div className="mt-4 flex flex-col gap-0.5">
        <RailButton label="Search" shortcut="⌘K" onClick={onOpenSearch}>
          <SearchIcon size={16} />
        </RailButton>
        <RailButton label="Quick add" shortcut="C" onClick={onOpenQuickAdd}>
          <PlusIcon size={16} />
        </RailButton>
      </div>

      <div className="my-3 h-px bg-line" />

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-2">
        {groups.map((group) => (
          <div key={group.key}>
            {group.label ? (
              <p className="px-2.5 pb-1 pt-3 text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                {group.label}
              </p>
            ) : (
              <div className="my-2 h-px bg-line" />
            )}

            {group.items.map((item) => {
              const active = isActiveHref(pathname, item.href);
              const Icon = NAV_ICONS[item.icon];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-9 items-center gap-2.5 rounded-xl px-2.5 text-[13px] transition-all duration-400 transition-natural active:scale-[0.98]",
                    active
                      ? "text-saffron"
                      : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId={reduce ? undefined : "rail-active"}
                      className="absolute inset-0 rounded-xl bg-saffron-soft"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                  <span className="relative shrink-0"><Icon size={16} /></span>
                  <span className="relative min-w-0 flex-1 truncate">{item.label}</span>

                  {item.href === "/" && alertCount > 0 ? (
                    <Badge
                      variant="critical"
                      size="xs"
                      className="tabular relative min-w-[16px] justify-center px-1"
                    >
                      {alertCount}
                    </Badge>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-2 flex items-center gap-1 border-t border-line pt-3">
        <ViewerMenu viewer={viewer} />
        <span className="ml-auto flex items-center gap-0.5">
          <NotificationBell items={notifications} unread={unreadCount} />
          <CurrencyPicker current={viewer.displayCurrency} />
        </span>
      </div>
    </aside>
  );
}

function Monogram() {
  return (
    <Link
      href="/"
      aria-label="Home — Avantika and Prateek"
      className="group flex items-center gap-2.5 rounded-xl px-1.5 py-1 transition-colors"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface transition-colors group-hover:border-saffron/40">
        <span className="font-display text-[14px] leading-none text-ink">
          A
          <span className="mx-[1px] text-[10px] text-saffron">|</span>
          P
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[14px] leading-tight text-ink">
          Avantika <span className="text-saffron">&</span> Prateek
        </span>
      </span>
    </Link>
  );
}

function RailButton({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip
      side="right"
      content={
        <span className="flex items-center gap-1.5">
          {label}
          {shortcut ? (
            <kbd className="rounded border border-canvas/25 px-1 text-[9.5px]">
              {shortcut}
            </kbd>
          ) : null}
        </span>
      }
    >
      <button
        type="button"
        onClick={onClick}
        className="flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-[13px] text-ink-muted transition-all duration-400 transition-natural hover:bg-surface-sunken hover:text-ink active:scale-[0.98]"
      >
        <span className="shrink-0">{children}</span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {shortcut ? (
          <kbd className="shrink-0 rounded border border-line px-1 text-[9.5px] text-ink-faint">
            {shortcut}
          </kbd>
        ) : null}
      </button>
    </Tooltip>
  );
}

function ViewerMenu({ viewer }: { viewer: ShellViewer }) {
  const [pending, start] = useTransition();

  return (
    <Popover
      align="start"
      className="w-56"
      trigger={
        <button
          type="button"
          aria-label={`${viewer.name} — account menu`}
          className="rounded-full ring-offset-2 ring-offset-surface-soft transition-transform hover:scale-105 active:scale-95"
        >
          <Avatar name={viewer.name} tone={viewer.tone} size="lg" />
        </button>
      }
    >
      <div className="px-2 py-1.5">
        <div className="text-[12.5px] font-medium text-ink">{viewer.name}</div>
        <div className="mt-0.5 text-[11.5px] text-ink-muted">{viewer.relation}</div>
        <Badge variant="neutral" size="xs" className="mt-1.5">
          Member
        </Badge>
      </div>
      <div className="my-1 h-px bg-line" />
      <Link
        href="/settings"
        className="block rounded-md px-2 py-1.5 text-[13px] text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink"
      >
        Wedding settings
      </Link>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { await signOut(); })}
        className="block w-full rounded-md px-2 py-1.5 text-left text-[13px] text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </Popover>
  );
}
