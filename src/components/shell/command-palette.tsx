"use client";

/**
 * Command palette.
 *
 * Search across the whole wedding plus jump-to-page commands, keyboard driven
 * throughout. Results are debounced and fetched from `/api/search`, which
 * applies the viewer's permissions server-side — a Helper searching "payment"
 * gets nothing back, rather than getting results the UI then has to hide.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/cn";
import { SearchIcon } from "@/components/ui/icons";
import type { NavItem } from "./nav";

interface SearchResult {
  id: string;
  type: "guest" | "vendor" | "task" | "event" | "payment" | "document" | "outfit" | "timeline";
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  guest: "Guest",
  vendor: "Vendor",
  task: "Task",
  event: "Event",
  payment: "Payment",
  document: "Document",
  outfit: "Outfit",
  timeline: "Run of show",
};

interface Row {
  key: string;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  items: NavItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setActive(0);
    }
  }, [open]);

  // Debounced search. An AbortController keeps stale responses from landing
  // after a newer query has already resolved.
  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Search failed");
        const data = (await response.json()) as { results: SearchResult[] };
        setResults(data.results);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 140);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const navRows: Row[] = React.useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return items
      .filter((item) =>
        trimmed.length === 0
          ? true
          : item.label.toLowerCase().includes(trimmed) ||
            `go to ${item.label.toLowerCase()}`.includes(trimmed),
      )
      .map((item) => ({
        key: `nav-${item.href}`,
        title: `Go to ${item.label}`,
        subtitle: "",
        badge: "Page",
        href: item.href,
      }));
  }, [items, query]);

  const resultRows: Row[] = results.map((result) => ({
    key: `${result.type}-${result.id}`,
    title: result.title,
    subtitle: result.subtitle,
    badge: TYPE_LABEL[result.type],
    href: result.href,
  }));

  // Real results outrank navigation once the user has typed something.
  const rows = query.trim().length > 0
    ? [...resultRows, ...navRows.slice(0, 3)]
    : navRows;

  React.useEffect(() => setActive(0), [query, results.length]);

  React.useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(row: Row | undefined) {
    if (!row) return;
    onOpenChange(false);
    router.push(row.href);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px] data-[state=open]:animate-fade" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2",
            "overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-overlay outline-none",
            "animate-rise",
          )}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((i) => Math.min(i + 1, rows.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              choose(rows[active]);
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search guests, vendors, tasks, payments and documents
          </DialogPrimitive.Description>

          <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
            <SearchIcon size={16} className="shrink-0 text-ink-faint" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search guests, vendors, tasks, payments…"
              className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
              aria-label="Search"
            />
            {loading ? (
              <span className="text-[11px] text-ink-faint">Searching…</span>
            ) : null}
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
            {rows.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-[13px] text-ink-muted">
                  {query.trim().length > 0
                    ? `Nothing matches “${query.trim()}”.`
                    : "Start typing to search."}
                </p>
                {query.trim().length > 0 ? (
                  <p className="mt-1 text-[12px] text-ink-faint">
                    Try a guest's name, a vendor, or part of a task.
                  </p>
                ) : null}
              </div>
            ) : (
              rows.map((row, index) => (
                <button
                  key={row.key}
                  data-index={index}
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(row)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    index === active ? "bg-surface-sunken" : "hover:bg-surface-sunken/60",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">
                      {row.title}
                    </span>
                    {row.subtitle ? (
                      <span className="block truncate text-[11.5px] text-ink-muted">
                        {row.subtitle}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[10.5px] text-ink-muted">
                    {row.badge}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-line bg-surface-soft px-4 py-2 text-[11px] text-ink-faint">
            <span><Key>↑</Key><Key>↓</Key> navigate</span>
            <span><Key>↵</Key> open</span>
            <span><Key>esc</Key> close</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mr-0.5 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded border border-line bg-surface px-1 text-[10px] text-ink-muted">
      {children}
    </kbd>
  );
}
