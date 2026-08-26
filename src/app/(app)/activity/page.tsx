import { redirect } from "next/navigation";

import { formatLongDate, formatTimeAgo, toISODate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Avatar, EmptyState } from "@/components/ui/primitives";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";

export default async function ActivityPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const entries = await db.activityLog.findMany({
    where: { weddingId: viewer.weddingId },
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { actor: { select: { name: true, avatarTone: true } } },
  });

  // Group by day so a long feed reads as a history, not a stream.
  const byDay = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = toISODate(entry.createdAt);
    const list = byDay.get(key) ?? [];
    list.push(entry);
    byDay.set(key, list);
  }

  return (
    <div className="mx-auto max-w-[820px] px-5 py-8 sm:px-8">
      <header className="mb-7">
        <div className="eyebrow mb-2">What's been happening</div>
        <h1 className="font-display text-[34px] leading-tight text-ink">Activity</h1>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">
          Every change, who made it and when. Nothing is lost.
        </p>
      </header>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing has happened yet"
          description="As people add guests, log payments and move vendors along, it all lands here."
        />
      ) : (
        <div className="space-y-8">
          {[...byDay.entries()].map(([day, dayEntries]) => (
            <section key={day}>
              <div className="rule-heading mb-3">
                <h2 className="font-display text-[16px] text-ink-soft">
                  {formatLongDate(new Date(`${day}T00:00:00.000Z`))}
                </h2>
              </div>

              <ol className="relative">
                <div aria-hidden className="absolute bottom-3 left-[13px] top-3 w-px bg-line" />
                {dayEntries.map((entry) => (
                  <li key={entry.id} className="relative flex gap-3.5 py-2.5">
                    <span className="relative z-10 shrink-0">
                      {entry.actor && entry.source === "MANUAL" ? (
                        <Avatar
                          name={entry.actor.name}
                          tone={entry.actor.avatarTone}
                          size="sm"
                          className="ring-2 ring-canvas"
                        />
                      ) : (
                        <span
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-canvas",
                            entry.source === "AI"
                              ? "bg-plum-soft text-plum"
                              : "bg-sky-soft text-sky",
                          )}
                        >
                          {entry.source === "AI" ? "AI" : "•"}
                        </span>
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] leading-snug text-ink-soft">
                        {entry.summary}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        {formatTimeAgo(entry.createdAt)}
                        {entry.entityLabel ? ` · ${entry.entityLabel}` : ""}
                        {entry.source === "AUTOMATED" ? " · automatic" : ""}
                        {entry.source === "AI" ? " · AI Planner" : ""}
                      </p>

                      {/* Show the actual before/after when there is one. */}
                      {entry.before && entry.after ? (
                        <Diff before={entry.before} after={entry.after} />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;

  const changes = Object.keys(a)
    .filter((key) => key in b && String(b[key]) !== String(a[key]))
    .slice(0, 3);

  if (changes.length === 0) return null;

  return (
    <ul className="mt-1 space-y-0.5">
      {changes.map((key) => (
        <li key={key} className="text-[11.5px] text-ink-faint">
          <span className="text-ink-muted">{humanise(key)}</span>{" "}
          <span className="line-through">{String(b[key] ?? "—")}</span>
          {" → "}
          <span className="text-ink-soft">{String(a[key] ?? "—")}</span>
        </li>
      ))}
    </ul>
  );
}

function humanise(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/ Id$/, "")
    .trim();
}
