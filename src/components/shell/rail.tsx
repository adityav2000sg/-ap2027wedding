"use client";

/**
 * The navigation rail.
 *
 * 72px of quiet chrome. Navigation is secondary furniture here — the wedding is
 * the primary visual object, so the rail is icons, a monogram and nothing else.
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
import { ROLE_LABEL } from "@/server/permissions";
import type { MemberRole } from "@prisma/client";
import { isActiveHref, type NavItem } from "./nav";
import { NAV_ICONS } from "./nav-icons";
import { signOut } from "@/app/login/actions";
import { CurrencyPicker } from "./currency-picker";

export interface ShellViewer {
  name: string;
  relation: string;
  role: MemberRole;
  tone: string;
  email: string;
  displayCurrency: string;
}

export function Rail({
  items,
  viewer,
  alertCount,
  onOpenSearch,
  onOpenQuickAdd,
}: {
  items: NavItem[];
  viewer: ShellViewer;
  alertCount: number;
  onOpenSearch(): void;
  onOpenQuickAdd(): void;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col items-center border-r border-line bg-surface-soft py-4 lg:flex">
      <Monogram />

      <div className="mt-5 flex flex-col items-center gap-1">
        <RailButton label="Search" shortcut="⌘K" onClick={onOpenSearch}>
          <SearchIcon size={17} />
        </RailButton>
        <RailButton label="Quick add" shortcut="C" onClick={onOpenQuickAdd}>
          <PlusIcon size={17} />
        </RailButton>
      </div>

      <div className="my-4 h-px w-7 bg-line" />

      <nav className="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto">
        {items.map((item) => {
          const active = isActiveHref(pathname, item.href);
          const Icon = NAV_ICONS[item.icon];
          return (
            <Tooltip key={item.href} content={item.label} side="right">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 active:scale-90",
                  active
                    ? "text-saffron"
                    : "text-ink-faint hover:bg-surface-sunken hover:text-ink-soft",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId={reduce ? undefined : "rail-active"}
                    className="absolute inset-0 rounded-xl bg-saffron-soft"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative"><Icon size={17} /></span>

                {item.href === "/" && alertCount > 0 ? (
                  <Badge
                    variant="critical"
                    size="xs"
                    className="tabular absolute -right-0.5 -top-0.5 min-w-[16px] justify-center px-1"
                  >
                    {alertCount}
                  </Badge>
                ) : null}
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      <div className="mt-3 flex flex-col items-center gap-2">
        <CurrencyPicker current={viewer.displayCurrency} />
        <ViewerMenu viewer={viewer} />
      </div>
    </aside>
  );
}

function Monogram() {
  return (
    <Tooltip content="Avantika & Prateek" side="right">
      <Link
        href="/"
        aria-label="Home — Avantika and Prateek"
        className="group flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface transition-colors hover:border-saffron/40"
      >
        <span className="font-display text-[15px] leading-none text-ink">
          A
          <span className="mx-[1px] text-[11px] text-saffron">|</span>
          P
        </span>
      </Link>
    </Tooltip>
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
        aria-label={label}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-faint transition-all duration-200 hover:bg-surface-sunken hover:text-ink-soft active:scale-95"
      >
        {children}
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
          {ROLE_LABEL[viewer.role]}
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
