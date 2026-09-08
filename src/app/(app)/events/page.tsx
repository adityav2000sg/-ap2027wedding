import Link from "next/link";
import { redirect } from "next/navigation";

import { buildBudgetView } from "@/domain/budget";
import { EVENT_KIND_LABEL } from "@/domain/events";
import { computeEventReadiness } from "@/domain/readiness";
import { analyseTasks } from "@/domain/tasks";
import { formatLongDate, formatMinute, toISODate } from "@/lib/dates";
import { formatCompactMoney } from "@/lib/money";
import { cn, toneClasses } from "@/lib/cn";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { variantUrl } from "@/server/media";
import { loadSnapshot } from "@/server/snapshot";
import { AddEventButton, EditEventButton } from "./event-editor";
import { buildEditorContext } from "./editor-context";

export default async function EventsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const snapshot = await loadSnapshot(viewer.weddingId);
  const tasks = analyseTasks(snapshot);
  const budget = buildBudgetView(snapshot, viewer.displayCurrency);
  const currency = viewer.displayCurrency;
  const canSeeMoney = viewer.permissions.has("budget.view");
  const canEdit = viewer.permissions.has("events.edit");

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

  const editorContext = buildEditorContext(snapshot);

  const days = new Set(snapshot.events.map((e) => toISODate(e.date))).size;

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">
            {snapshot.events.length > 0
              ? `${days} ${days === 1 ? "day" : "days"}, ${snapshot.events.length} ${
                  snapshot.events.length === 1 ? "function" : "functions"
                }`
              : "Nothing scheduled yet"}
          </div>
          <h1 className="font-script text-[54px] text-ink">Events</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-muted">
            Each function has its own command centre — run of show, guests, vendors,
            budget and blockers.
          </p>
        </div>
        {canEdit ? <AddEventButton context={editorContext} /> : null}
      </header>

      {snapshot.events.length === 0 ? (
        <EmptyState
          title="No functions yet"
          description="Add the first one — a haldi, a puja, the shaadi itself. Everything else in the app hangs off these."
          action={canEdit ? <AddEventButton context={editorContext} label="Add the first function" /> : undefined}
        />
      ) : (
        <div className="space-y-px">
          {snapshot.events.map((event, index) => {
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
              <div
                key={event.id}
                style={{ animationDelay: `${Math.min(index * 70, 350)}ms` }}
                className={cn(
                  "group relative flex flex-col gap-5 border-b border-line py-6",
                  "animate-rise sm:flex-row sm:items-center",
                )}
              >
                {/*
                  The whole row is the link — a stretched anchor beneath the
                  content — so the edit button can sit inside it without an
                  anchor nested in an anchor.
                */}
                <Link
                  href={`/events/${event.slug}`}
                  className="absolute inset-0 z-0 rounded-lg"
                >
                  <span className="sr-only">Open {event.name}</span>
                </Link>

                {/* Accent edge that grows on hover */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-0 h-full w-[2px] origin-top scale-y-0 rounded-full",
                    "transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    "group-hover:scale-y-100",
                    tone.dot,
                  )}
                />

                {cover ? (
                  <div className="pointer-events-none relative z-10 h-24 w-full shrink-0 overflow-hidden rounded-lg bg-surface-sunken sm:h-20 sm:w-28">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
                    />
                  </div>
                ) : null}

                <div className="pointer-events-none relative z-10 min-w-0 flex-1 pl-3">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
                    <h2 className="font-display text-[24px] leading-tight text-ink transition-colors duration-500 group-hover:text-saffron">
                      {event.name}
                    </h2>
                    {event.isPrivate ? (
                      <Badge size="xs" variant="outline">
                        Private
                      </Badge>
                    ) : null}
                    {event.kind !== "CUSTOM" ? (
                      <span className="hidden text-[11.5px] text-ink-faint sm:inline">
                        {EVENT_KIND_LABEL[event.kind]}
                      </span>
                    ) : null}
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

                <dl className="pointer-events-none relative z-10 flex shrink-0 gap-7 pl-3 sm:pl-0">
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

                <div className="relative z-10 flex shrink-0 items-center gap-2">
                  {readiness.blockers.length > 0 ? (
                    <Badge variant="attention" size="xs">
                      {readiness.blockers.length} blockers
                    </Badge>
                  ) : (
                    <Badge variant="positive" size="xs">
                      On track
                    </Badge>
                  )}
                  {canEdit ? (
                    <div className="opacity-0 transition-opacity duration-500 focus-within:opacity-100 group-hover:opacity-100">
                      <EditEventButton
                        context={editorContext}
                        event={{
                          id: event.id,
                          name: event.name,
                          kind: event.kind,
                          date: toISODate(event.date),
                          startMinute: event.startMinute,
                          endMinute: event.endMinute,
                          venueId: event.venueId,
                          dressCode: event.dressCode,
                          description: event.description,
                          notes: event.notes,
                          estimatedGuests: event.estimatedGuests,
                          accentTone: event.accentTone,
                          isPrivate: event.isPrivate,
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
