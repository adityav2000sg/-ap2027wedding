"use client";

/**
 * The navigation drawer for phones.
 *
 * The desktop rail carries fourteen destinations. The phone tab bar has room
 * for four, which left ten — Budget, Vendors, Logistics, Documents and the rest
 * — reachable only by typing a URL. This is where the other ten live.
 *
 * Labelled "Menu" rather than left as a bare hamburger, because a large part of
 * the audience here is parents on phones who shouldn't have to know that three
 * lines mean navigation.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/cn";
import { Avatar, Badge } from "@/components/ui/primitives";
import { isActiveHref, NAV_GROUPS, type NavItem } from "./nav";
import { NAV_ICONS } from "./nav-icons";
import { CurrencyPicker } from "./currency-picker";
import { signOut } from "@/app/login/actions";
import type { ShellViewer } from "./rail";

export function MobileNav({
  open,
  onOpenChange,
  items,
  viewer,
  wedding,
  alertCount,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  items: NavItem[];
  viewer: ShellViewer;
  wedding: { partnerAName: string; partnerBName: string; daysToGo: number };
  alertCount: number;
}) {
  const pathname = usePathname();
  const [signingOut, startSignOut] = useTransition();

  // Following a link should close the drawer. The pathname changing is the only
  // reliable signal — a link to the current page won't fire a navigation.
  React.useEffect(() => {
    onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => item.group === group.key),
  })).filter((group) => group.items.length > 0);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px] lg:hidden",
            "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-[320px] flex-col",
            "border-r border-line bg-surface shadow-overlay outline-none lg:hidden",
            "data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>

          <div className="border-b border-line px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="font-script text-[38px] leading-none text-ink">
              {wedding.partnerAName}
              <span className="mx-1.5 text-saffron">&</span>
              {wedding.partnerBName}
            </div>
            <p className="mt-2 text-[12px] text-ink-muted">
              {wedding.daysToGo >= 0
                ? `${wedding.daysToGo} days to go`
                : "The wedding has happened"}
            </p>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
            {groups.map((group) => (
              <div key={group.key} className="mb-1">
                {group.label ? (
                  <p className="px-2 pb-1 pt-3 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
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
                      // 44px tall: the smallest target a thumb reliably hits.
                      className={cn(
                        "flex min-h-[44px] items-center gap-3 rounded-xl px-2.5 text-[14.5px] transition-colors active:scale-[0.99]",
                        active
                          ? "bg-saffron-soft text-saffron"
                          : "text-ink-soft active:bg-surface-sunken",
                      )}
                    >
                      <Icon size={18} />
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/" && alertCount > 0 ? (
                        <Badge variant="critical" size="xs" className="tabular px-1.5">
                          {alertCount}
                        </Badge>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="border-t border-line px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <div className="flex items-center gap-3 px-2 py-1.5">
              <Avatar name={viewer.name} tone={viewer.tone} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-ink">{viewer.name}</p>
                <p className="truncate text-[11.5px] text-ink-muted">{viewer.relation}</p>
              </div>
              <CurrencyPicker current={viewer.displayCurrency} compact />
            </div>

            <button
              type="button"
              disabled={signingOut}
              onClick={() => startSignOut(async () => { await signOut(); })}
              className="mt-1 flex min-h-[44px] w-full items-center rounded-xl px-2.5 text-left text-[14px] text-ink-muted transition-colors active:bg-surface-sunken disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
