"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { Avatar, Badge, Button } from "@/components/ui/primitives";
import { MenuIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { QuickAdd } from "./quick-add";
import { Rail, type ShellViewer } from "./rail";
import { isActiveHref, type NavItem } from "./nav";
import { NAV_ICONS } from "./nav-icons";

export interface ShellWedding {
  partnerAName: string;
  partnerBName: string;
  dateRange: string;
  daysToGo: number;
}

export interface QuickAddOptions {
  events: { id: string; name: string }[];
  members: { id: string; name: string }[];
  vendors: { id: string; businessName: string }[];
  categories: { id: string; name: string }[];
  payers: { id: string; name: string }[];
  households: { id: string; name: string }[];
  venues: { id: string; name: string }[];
  baseCurrency: string;
  /** First day of the wedding, `YYYY-MM-DD` — the default date for a new function. */
  weddingStart: string;
  canEditBudget: boolean;
  canEditGuests: boolean;
  canEditVendors: boolean;
  canEditEvents: boolean;
}

export function AppShell({
  items,
  viewer,
  wedding,
  alertCount,
  quickAddOptions,
  children,
}: {
  items: NavItem[];
  viewer: ShellViewer;
  wedding: ShellWedding;
  alertCount: number;
  quickAddOptions: QuickAddOptions;
  children: React.ReactNode;
}) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pathname = usePathname();

  // Global shortcuts. Ignored while the user is typing in a field.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (typing) return;
      if (event.key === "/") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "c" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setQuickAddOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const mobileItems = items.filter((item) => item.mobile).slice(0, 4);

  return (
    <div className="flex min-h-dvh">
      <Rail
        items={items}
        viewer={viewer}
        alertCount={alertCount}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenQuickAdd={() => setQuickAddOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="glass sticky top-0 z-30 flex items-center gap-1.5 border-b border-line px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:hidden">
          {/* Labelled, not a bare hamburger — half the people using this are
              parents on phones, and three lines is not self-explanatory. */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="relative flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-ink-soft transition-colors active:bg-surface-sunken"
          >
            <MenuIcon size={19} />
            <span className="text-[12.5px]">Menu</span>
            {alertCount > 0 ? (
              <span className="absolute left-[26px] top-1.5 h-1.5 w-1.5 rounded-full bg-critical" />
            ) : null}
          </button>

          <Link href="/" className="min-w-0 flex-1 text-center">
            <div className="truncate font-display text-[15px] leading-tight text-ink">
              {wedding.partnerAName}
              <span className="mx-1 text-saffron">&</span>
              {wedding.partnerBName}
            </div>
            <div className="text-[10.5px] text-ink-muted">
              {wedding.daysToGo >= 0
                ? `${wedding.daysToGo} days to go`
                : wedding.dateRange}
            </div>
          </Link>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setQuickAddOpen(true)}
            aria-label="Quick add"
            className="min-h-[44px] min-w-[40px]"
          >
            <PlusIcon size={18} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="min-h-[44px] min-w-[40px]"
          >
            <SearchIcon size={17} />
          </Button>
        </header>

        <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>

        {/* Mobile tab bar — the wedding-week phone experience */}
        <nav className="glass fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden">
          {mobileItems.map((item) => {
            const active = isActiveHref(pathname, item.href);
            const Icon = NAV_ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] transition-colors",
                  active ? "text-saffron" : "text-ink-muted",
                )}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.href === "/" && alertCount > 0 ? (
                  <Badge
                    variant="critical"
                    size="xs"
                    className="tabular absolute right-[22%] top-1 px-1"
                  >
                    {alertCount}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
          {/* Add moved to the top bar so this slot can lead to the other ten
              screens, which previously had no route in on a phone at all. */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] text-ink-muted"
          >
            <MenuIcon size={18} />
            <span>More</span>
          </button>
        </nav>
      </div>

      <MobileNav
        open={menuOpen}
        onOpenChange={setMenuOpen}
        items={items}
        viewer={viewer}
        wedding={wedding}
        alertCount={alertCount}
      />

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} items={items} />
      <QuickAdd
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        options={quickAddOptions}
      />
    </div>
  );
}
