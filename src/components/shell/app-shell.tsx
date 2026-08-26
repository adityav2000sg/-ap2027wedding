"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { Avatar, Badge, Button } from "@/components/ui/primitives";
import { PlusIcon, SearchIcon } from "@/components/ui/icons";
import { CommandPalette } from "./command-palette";
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
  baseCurrency: string;
  canEditBudget: boolean;
  canEditGuests: boolean;
  canEditVendors: boolean;
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
        <header className="glass sticky top-0 z-30 flex items-center gap-2 border-b border-line px-4 py-2.5 lg:hidden">
          <Link href="/" className="min-w-0 flex-1">
            <div className="truncate font-display text-[16px] leading-tight text-ink">
              {wedding.partnerAName}
              <span className="mx-1 text-saffron">&</span>
              {wedding.partnerBName}
            </div>
            <div className="text-[11px] text-ink-muted">
              {wedding.daysToGo >= 0
                ? `${wedding.daysToGo} days to go`
                : wedding.dateRange}
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <SearchIcon size={16} />
          </Button>
          <Avatar name={viewer.name} tone={viewer.tone} size="md" />
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
                  "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] transition-colors",
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
          <button
            type="button"
            onClick={() => setQuickAddOpen(true)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] text-ink-muted"
          >
            <PlusIcon size={18} />
            <span>Add</span>
          </button>
        </nav>
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} items={items} />
      <QuickAdd
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        options={quickAddOptions}
      />
    </div>
  );
}
