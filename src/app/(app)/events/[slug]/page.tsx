import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buildBudgetView } from "@/domain/budget";
import { computeEventReadiness } from "@/domain/readiness";
import { analyseTasks } from "@/domain/tasks";
import { formatLongDate, formatMinute } from "@/lib/dates";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import { cn, toneClasses } from "@/lib/cn";
import { Badge, Meter } from "@/components/ui/primitives";
import { ArrowRightIcon } from "@/components/ui/icons";
import { TaskRow } from "@/components/wedding/task-row";
import { toTaskRow } from "@/components/wedding/task-row-data";
import { VENDOR_CATEGORY_LABEL, VENDOR_STATUS_TEXT } from "@/domain/impact";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { variantUrl } from "@/server/media";
import { loadSnapshot } from "@/server/snapshot";
import { EventRunOfShow } from "./run-of-show";

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const { slug } = await params;
  const snapshot = await loadSnapshot(viewer.weddingId);
  const event = snapshot.events.find((e) => e.slug === slug);
  if (!event) notFound();

  const tasks = analyseTasks(snapshot);
  const budget = buildBudgetView(snapshot, viewer.displayCurrency);
  const counts = budget.drivers.eventCounts.get(event.id)!;
  const readiness = computeEventReadiness(snapshot, event, tasks, budget, counts);
  const currency = viewer.displayCurrency;
  const canSeeMoney = viewer.permissions.has("budget.view");
  const tone = toneClasses(event.accentTone);

  const venue = event.venueId
    ? snapshot.venues.find((v) => v.id === event.venueId)
    : null;
  const eventTasks = tasks.filter((t) => t.eventId === event.id);
  const eventVendors = snapshot.vendors.filter((v) => v.eventIds.includes(event.id));
  const money = budget.byEvent.get(event.id);

  const memberLookup = new Map(
    snapshot.members.map((m) => [m.id, { name: m.name, tone: m.avatarTone }]),
  );
  const eventLookup = new Map(
    snapshot.events.map((e) => [e.id, { name: e.name, tone: e.accentTone }]),
  );

  const [board, outfits] = await Promise.all([
    db.moodboard.findFirst({
      where: { weddingId: viewer.weddingId, eventId: event.id, archivedAt: null },
      include: {
        items: { orderBy: { sortOrder: "asc" }, take: 6, include: { media: true } },
        _count: { select: { items: true } },
      },
    }),
    db.outfit.findMany({
      where: { weddingId: viewer.weddingId, eventId: event.id, archivedAt: null },
      include: { person: { select: { name: true } } },
    }),
  ]);

  const timeline = snapshot.timeline
    .filter((t) => t.eventId === event.id)
    .sort((a, b) => a.startMinute - b.startMinute);

  return (
    <div className="pb-16">
      {/* Header, tinted with the event's own accent */}
      <header className={cn("border-b border-line", tone.bg)}>
        <div className="mx-auto max-w-[1180px] px-5 py-9 sm:px-8">
          <Link
            href="/events"
            className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowRightIcon size={12} className="rotate-180" /> All events
          </Link>

          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className={cn("eyebrow mb-2", tone.text)}>
                {formatLongDate(event.date)}
              </div>
              <h1 className="font-display text-[42px] leading-none text-ink sm:text-[52px]">
                {event.name}
              </h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-soft">
                <span>
                  {formatMinute(event.startMinute)} – {formatMinute(event.endMinute)}
                </span>
                <span className="text-ink-faint">·</span>
                <span>
                  {venue ? venue.name : (
                    <span className="font-medium text-critical">Venue not confirmed</span>
                  )}
                </span>
                {event.dressCode ? (
                  <>
                    <span className="text-ink-faint">·</span>
                    <span>{event.dressCode}</span>
                  </>
                ) : null}
              </p>
              {event.description ? (
                <p className="mt-3 max-w-lg text-[13.5px] leading-relaxed text-ink-soft">
                  {event.description}
                </p>
              ) : null}
            </div>

            <div className="text-right">
              <div className="tabular font-display text-[40px] leading-none text-ink">
                {readiness.percent}%
              </div>
              <div className="eyebrow mt-1.5">Ready</div>
              <Meter
                value={readiness.percent}
                tone={event.accentTone}
                height={3}
                className="mt-2.5 w-32"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
        {/* Key numbers */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-b border-line py-6 sm:grid-cols-4">
          <Figure value={counts.confirmed} label="Coming" />
          <Figure value={counts.expected || event.estimatedGuests} label="Expected" />
          {canSeeMoney ? (
            <Figure
              value={money ? formatCompactMoney(money.forecast, currency) : "—"}
              label="Forecast"
            />
          ) : null}
          <Figure
            value={eventTasks.filter((t) => !t.isDone).length}
            label="Open tasks"
          />
        </div>

        {/* Blockers */}
        {readiness.blockers.length > 0 ? (
          <section className="py-7">
            <h2 className="font-display text-[20px] text-ink">
              What's holding {event.name} back
            </h2>
            <ul className="mt-3">
              {readiness.blockers.slice(0, 5).map((blocker) => (
                <li key={blocker.key} className="border-b border-line last:border-b-0">
                  {blocker.href ? (
                    <Link href={blocker.href} className="group flex items-start gap-4 py-3">
                      <span className="tabular w-11 shrink-0 pt-0.5 text-right text-[12.5px] font-semibold text-ink-soft">
                        −{blocker.pointsCost.toFixed(1)}%
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] text-ink transition-colors group-hover:text-saffron">
                          {blocker.label}
                        </span>
                        <span className="block text-[12px] text-ink-muted">
                          {blocker.detail}
                        </span>
                      </span>
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="hairline" />

        {/* Run of show */}
        <section className="py-8">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[22px] text-ink">Run of show</h2>
            <Link
              href={`/timeline?event=${event.id}`}
              className="text-[12.5px] font-medium text-ink-muted transition-colors hover:text-saffron"
            >
              Open timeline →
            </Link>
          </div>
          <p className="mb-5 text-[13px] text-ink-muted">
            Minute by minute, in order. Everything shifts together when one thing moves.
          </p>
          <EventRunOfShow
            tone={event.accentTone}
            entries={timeline.map((entry) => ({
              id: entry.id,
              title: entry.title,
              startMinute: entry.startMinute,
              endMinute: entry.endMinute,
              location: entry.location,
              status: entry.status,
              isLocked: entry.isLocked,
              notes: entry.notes,
              ownerName: entry.ownerId
                ? memberLookup.get(entry.ownerId)?.name ?? null
                : null,
              ownerTone: entry.ownerId
                ? memberLookup.get(entry.ownerId)?.tone ?? null
                : null,
              vendorName: entry.vendorId
                ? snapshot.vendors.find((v) => v.id === entry.vendorId)?.businessName ?? null
                : null,
            }))}
          />
        </section>

        <div className="hairline" />

        <div className="grid gap-x-12 gap-y-9 py-8 lg:grid-cols-2">
          {/* Vendors */}
          <section>
            <div className="rule-heading mb-3">
              <h2 className="font-display text-[19px] text-ink">Vendors</h2>
            </div>
            {eventVendors.length === 0 ? (
              <p className="text-[13px] text-ink-muted">
                Nobody booked for this function yet.
              </p>
            ) : (
              <ul>
                {eventVendors.map((vendor) => (
                  <li key={vendor.id} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/vendors/${vendor.id}`}
                      className="group flex items-center gap-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink transition-colors group-hover:text-saffron">
                          {vendor.businessName}
                        </span>
                        <span className="block text-[11.5px] text-ink-muted">
                          {VENDOR_CATEGORY_LABEL[vendor.category] ?? vendor.category}
                        </span>
                      </span>
                      <Badge size="xs">{VENDOR_STATUS_TEXT[vendor.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Wardrobe */}
          <section>
            <div className="rule-heading mb-3">
              <h2 className="font-display text-[19px] text-ink">What everyone's wearing</h2>
            </div>
            {outfits.length === 0 ? (
              <p className="text-[13px] text-ink-muted">No looks planned yet.</p>
            ) : (
              <ul>
                {outfits.map((outfit) => (
                  <li key={outfit.id} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/wardrobe?outfit=${outfit.id}`}
                      className="group flex items-center gap-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink transition-colors group-hover:text-saffron">
                          {outfit.person.name}
                        </span>
                        <span className="block text-[11.5px] text-ink-muted">
                          {outfit.outfitType}
                        </span>
                      </span>
                      <Badge size="xs">{outfit.status.toLowerCase()}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Inspiration */}
        {board && board.items.length > 0 ? (
          <>
            <div className="hairline" />
            <section className="py-8">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[19px] text-ink">Inspiration</h2>
                <Link
                  href={`/moodboard?board=${board.id}`}
                  className="text-[12.5px] font-medium text-ink-muted transition-colors hover:text-saffron"
                >
                  {board._count.items} images →
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {board.items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/moodboard?board=${board.id}`}
                    className="group aspect-square overflow-hidden rounded-lg bg-surface-sunken"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={variantUrl(item.media, "thumb")}
                      alt={item.caption ?? ""}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : null}

        <div className="hairline" />

        {/* Tasks */}
        <section className="py-8">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[19px] text-ink">Tasks</h2>
            <Link
              href={`/tasks?event=${event.id}`}
              className="text-[12.5px] font-medium text-ink-muted transition-colors hover:text-saffron"
            >
              All {eventTasks.length} →
            </Link>
          </div>
          <div className="-mx-3 divide-y divide-line">
            {eventTasks
              .filter((t) => !t.isDone)
              .sort((a, b) => b.leverage - a.leverage)
              .slice(0, 8)
              .map((task) => (
                <TaskRow
                  key={task.id}
                  showEvent={false}
                  task={toTaskRow(task, {
                    members: memberLookup,
                    events: eventLookup,
                    currency,
                  })}
                />
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Figure({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="tabular font-display text-[24px] leading-none text-ink">{value}</div>
      <div className="mt-1.5 text-[11.5px] text-ink-muted">{label}</div>
    </div>
  );
}
