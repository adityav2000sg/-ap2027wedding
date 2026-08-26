import Link from "next/link";
import { redirect } from "next/navigation";

import { buildBudgetView } from "@/domain/budget";
import { computeEventReadiness } from "@/domain/readiness";
import { analyseTasks } from "@/domain/tasks";
import { formatLongDate, formatMinute } from "@/lib/dates";
import { formatCompactMoney } from "@/lib/money";
import { cn, toneClasses } from "@/lib/cn";
import { Badge } from "@/components/ui/primitives";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { variantUrl } from "@/server/media";
import { loadSnapshot } from "@/server/snapshot";

export default async function EventsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const snapshot = await loadSnapshot(viewer.weddingId);
  const tasks = analyseTasks(snapshot);
  const budget = buildBudgetView(snapshot, viewer.displayCurrency);
  const currency = viewer.displayCurrency;
  const canSeeMoney = viewer.permissions.has("budget.view");

  // A cover image per event, if the couple has pinned anything to its board.
  const boards = await db.moodboard.findMany({
    where: { weddingId: viewer.weddingId, scope: "EVENT", archivedAt: null },
    include: { items: { orderBy: { sortOrder: "asc" }, take: 1, include: { media: true } } },
  });
  const coverByEvent = new Map(
    boards
      .filter((b) => b.eventId && b.items[0])
      .map((b) => [b.eventId!, variantUrl(b.items[0].media, "grid")]),
  );

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
      <header className="mb-8">
        <div className="eyebrow mb-2">Four days, five functions</div>
        <h1 className="font-display text-[34px] leading-tight text-ink">Events</h1>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">
          Each function has its own command centre — run of show, guests, vendors,
          budget and blockers.
        </p>
      </header>

      <div className="space-y-px">
        {snapshot.events.map((event) => {
          const counts = budget.drivers.eventCounts.get(event.id)!;
          const readiness = computeEventReadiness(snapshot, event, tasks, budget, counts);
          const money = budget.byEvent.get(event.id);
          const venue = event.venueId
            ? snapshot.venues.find((v) => v.id === event.venueId)
            : null;
          const tone = toneClasses(event.accentTone);
          const cover = coverByEvent.get(event.id);
          const openTasks = tasks.filter((t) => t.eventId === event.id && !t.isDone);

          return (
            <Link
              key={event.id}
              href={`/events/${event.slug}`}
              className="group relative flex flex-col gap-5 border-b border-line py-6 sm:flex-row sm:items-center"
            >
              {/* Accent edge that grows on hover */}
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-0 h-full w-[2px] origin-top scale-y-0 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-y-100",
                  tone.dot,
                )}
              />

              {cover ? (
                <div className="h-24 w-full shrink-0 overflow-hidden rounded-lg bg-surface-sunken sm:h-20 sm:w-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
              ) : null}

              <div className="min-w-0 flex-1 pl-3">
                <div className="flex items-center gap-2.5">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
                  <h2 className="font-display text-[24px] leading-tight text-ink transition-colors group-hover:text-saffron">
                    {event.name}
                  </h2>
                </div>
                <p className="mt-1 text-[13px] text-ink-soft">
                  {formatLongDate(event.date)} · {formatMinute(event.startMinute)}–
                  {formatMinute(event.endMinute)}
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-muted">
                  {venue ? venue.name : (
                    <span className="text-critical">Venue not confirmed</span>
                  )}
                  {event.dressCode ? ` · ${event.dressCode}` : ""}
                </p>
              </div>

              <dl className="flex shrink-0 gap-7 pl-3 sm:pl-0">
                <Stat label="Ready" value={`${readiness.percent}%`} />
                <Stat
                  label="Expected"
                  value={counts.expected || event.estimatedGuests}
                />
                {canSeeMoney ? (
                  <Stat
                    label="Forecast"
                    value={money ? formatCompactMoney(money.forecast, currency) : "—"}
                  />
                ) : null}
                <Stat label="Open tasks" value={openTasks.length} />
              </dl>

              {readiness.blockers.length > 0 ? (
                <Badge variant="attention" size="xs" className="shrink-0">
                  {readiness.blockers.length} blockers
                </Badge>
              ) : (
                <Badge variant="positive" size="xs" className="shrink-0">
                  On track
                </Badge>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dd className="tabular font-display text-[19px] leading-none text-ink">{value}</dd>
      <dt className="mt-1 text-[11px] text-ink-muted">{label}</dt>
    </div>
  );
}
