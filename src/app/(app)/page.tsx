import Link from "next/link";
import { redirect } from "next/navigation";

import { buildBudgetView } from "@/domain/budget";
import { computeEventReadiness, computeWeddingReadiness } from "@/domain/readiness";
import { computeAlerts } from "@/domain/risk";
import { analyseTasks, dueWithin, nextBestActions } from "@/domain/tasks";
import { evaluateMilestones, nextMilestone } from "@/domain/milestones";
import {
  daysBetween,
  formatDateRange,
  formatMinute,
  formatShortDate,
  formatRelativeDay,
  formatTimeAgo,
  toISODate,
} from "@/lib/dates";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Meter } from "@/components/ui/primitives";
import { ArrowRightIcon } from "@/components/ui/icons";
import { EventJourney } from "@/components/wedding/event-journey";
import { MoodboardStrip } from "@/components/wedding/moodboard-strip";
import { NextBestActions, TodaysAgenda } from "@/components/wedding/next-actions";
import { PlanningPulse } from "@/components/wedding/planning-pulse";
import { ReadinessDial } from "@/components/wedding/readiness-dial";
import { RightNow } from "@/components/wedding/right-now";
import { toTaskRow } from "@/components/wedding/task-row-data";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { variantUrl } from "@/server/media";
import { loadSnapshot } from "@/server/snapshot";
import { WeddingWeekPanel } from "./wedding-week-panel";
import { HeroCountdown } from "./hero-countdown";

export default async function HomePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const snapshot = await loadSnapshot(viewer.weddingId);
  const tasks = analyseTasks(snapshot);
  const budget = buildBudgetView(snapshot, viewer.displayCurrency);
  const readiness = computeWeddingReadiness(snapshot, tasks, budget);
  const alerts = computeAlerts(snapshot, tasks, budget);
  const counts = budget.drivers.guestCounts;
  const currency = viewer.displayCurrency;
  const daysToGo = daysBetween(snapshot.today, snapshot.wedding.startDate);
  const canSeeMoney = viewer.permissions.has("budget.view");

  const memberLookup = new Map(
    snapshot.members.map((m) => [m.id, { name: m.name, tone: m.avatarTone }]),
  );
  const eventLookup = new Map(
    snapshot.events.map((e) => [e.id, { name: e.name, tone: e.accentTone }]),
  );
  const lookup = { members: memberLookup, events: eventLookup, currency };

  const [activity, moodboard, heroMedia] = await Promise.all([
    db.activityLog.findMany({
      where: { weddingId: viewer.weddingId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.moodboard.findFirst({
      where: { weddingId: viewer.weddingId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          orderBy: [{ isFavourite: "desc" }, { sortOrder: "asc" }],
          take: 5,
          include: { media: true },
        },
        _count: { select: { items: true } },
      },
    }),
    // Any photograph the couple has uploaded becomes the hero wash. Until then
    // the seeded reference image stands in.
    db.mediaAsset.findFirst({
      where: { weddingId: viewer.weddingId, kind: "PHOTO", archivedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const actions = nextBestActions(tasks, 5).map((t) => toTaskRow(t, lookup));
  const milestone = nextMilestone({ snapshot, tasks, budget });
  const achieved = evaluateMilestones({ snapshot, tasks, budget }).filter((m) => m.isMet);

  const journeyEvents = snapshot.events.map((event) => {
    const eventCounts = budget.drivers.eventCounts.get(event.id)!;
    const eventReadiness = computeEventReadiness(snapshot, event, tasks, budget, eventCounts);
    const venue = event.venueId
      ? snapshot.venues.find((v) => v.id === event.venueId)
      : null;
    return {
      id: event.id,
      slug: event.slug,
      name: event.name,
      dateLabel: formatShortDate(event.date),
      timeLabel: formatMinute(event.startMinute),
      tone: event.accentTone,
      readiness: eventReadiness.percent,
      expectedGuests: eventCounts.expected || event.estimatedGuests,
      blockers: eventReadiness.blockers.length,
      topBlocker: eventReadiness.blockers[0]?.label ?? null,
      forecast: budget.byEvent.get(event.id)?.forecast ?? null,
      venueName: venue?.name ?? null,
      currency,
    };
  });

  // Today's agenda — real run-of-show entries when the wedding is here,
  // otherwise the work actually due today.
  const todayKey = toISODate(snapshot.today);
  const todaysEntries = snapshot.timeline.filter(
    (entry) => toISODate(entry.date) === todayKey,
  );
  const agenda =
    todaysEntries.length > 0
      ? todaysEntries
          .sort((a, b) => a.startMinute - b.startMinute)
          .slice(0, 6)
          .map((entry) => ({
            id: entry.id,
            title: entry.title,
            startMinute: entry.startMinute,
            endMinute: entry.endMinute,
            people: entry.ownerId
              ? [{
                  name: memberLookup.get(entry.ownerId)?.name ?? "",
                  tone: memberLookup.get(entry.ownerId)?.tone ?? null,
                }]
              : [],
            href: `/timeline?entry=${entry.id}`,
            context: entry.location,
          }))
      : dueWithin(tasks, 0).slice(0, 6).map((task, index) => ({
          id: task.id,
          title: task.title,
          // Space today's work through the working day so it reads as a plan.
          startMinute: 600 + index * 90,
          endMinute: 645 + index * 90,
          people: task.ownerId
            ? [{
                name: memberLookup.get(task.ownerId)?.name ?? "",
                tone: memberLookup.get(task.ownerId)?.tone ?? null,
              }]
            : [],
          href: `/tasks?task=${task.id}`,
          context: task.area,
        }));

  const upcomingPayments = snapshot.payments
    .filter((p) => p.status !== "PAID" && p.status !== "CANCELLED")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 4);

  const paymentsThisMonth = snapshot.payments.filter((p) => {
    if (p.status === "PAID" || p.status === "CANCELLED") return false;
    const days = daysBetween(snapshot.today, new Date(p.dueDate));
    return days >= 0 && days <= 30;
  }).length;

  const isWeddingWeek = daysToGo <= 7 && daysToGo >= -1;
  const heroImageUrl = heroMedia
    ? variantUrl(heroMedia, "large")
    : "/brand/hero-mandap.jpg";

  return (
    <div className="pb-16">
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden border-b border-line">
        {/* Photographic wash, faded out towards the type. */}
        <div
          aria-hidden
          className="photo-fade pointer-events-none absolute inset-y-0 right-0 w-full opacity-[0.28] sm:w-[62%] sm:opacity-40"
          style={{
            backgroundImage: `url(${heroImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center 30%",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, var(--color-canvas) 22%, color-mix(in srgb, var(--color-canvas) 55%, transparent) 55%, transparent 100%)",
          }}
        />

        <div className="relative mx-auto max-w-[1180px] px-5 py-10 sm:px-8 sm:py-14">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-8">
            <div className="min-w-0">
              <div className="eyebrow">The wedding of</div>
              <h1 className="mt-2.5 font-display text-[46px] leading-[0.98] text-ink sm:text-[68px]">
                {snapshot.wedding.partnerAName}
                <span className="mx-3 font-light text-saffron">&</span>
                {snapshot.wedding.partnerBName}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-soft">
                <span>
                  {formatDateRange(snapshot.wedding.startDate, snapshot.wedding.endDate)}
                </span>
                <Dot />
                <span>
                  {snapshot.wedding.cities.length > 0
                    ? snapshot.wedding.cities.join(" or ")
                    : "Destination to be confirmed"}
                </span>
                <Dot />
                <span>{snapshot.wedding.weddingType} wedding</span>
              </div>

              {milestone ? (
                <div className="mt-7 max-w-xs">
                  <div className="eyebrow mb-1.5">Major milestone</div>
                  <div className="text-[15px] text-ink">{milestone.title}</div>
                  <Meter
                    value={milestone.progress * 100}
                    tone="saffron"
                    height={3}
                    className="mt-2"
                  />
                  <div className="mt-1.5 text-[11.5px] text-ink-muted">
                    {achieved.length} reached
                    <span className="mx-1.5 text-ink-faint">·</span>
                    {milestone.description}
                  </div>
                </div>
              ) : null}
            </div>

            <HeroCountdown
              daysToGo={daysToGo}
              readinessPercent={readiness.percent}
              readiness={readiness}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
        {isWeddingWeek ? (
          <div className="pt-6">
            <WeddingWeekPanel
              snapshot={{
                events: snapshot.events.map((e) => ({
                  id: e.id, name: e.name, date: e.date.toISOString(),
                  startMinute: e.startMinute, tone: e.accentTone, slug: e.slug,
                })),
                timeline: snapshot.timeline.map((t) => ({
                  id: t.id, title: t.title, date: t.date.toISOString(),
                  startMinute: t.startMinute, endMinute: t.endMinute,
                  location: t.location, status: t.status,
                  vendorName: t.vendorId
                    ? snapshot.vendors.find((v) => v.id === t.vendorId)?.businessName ?? null
                    : null,
                  ownerName: t.ownerId ? memberLookup.get(t.ownerId)?.name ?? null : null,
                })),
                today: snapshot.today.toISOString(),
              }}
              alerts={alerts.filter((a) => a.severity === "critical").slice(0, 3)}
            />
          </div>
        ) : null}

        {/* ── Event journey ────────────────────────────────────────────────── */}
        <div className="py-9">
          <EventJourney events={journeyEvents} showMoney={canSeeMoney} />
        </div>

        <div className="hairline" />

        {/* ── Right now · Planning pulse ───────────────────────────────────── */}
        <div className="grid gap-x-12 gap-y-10 py-9 lg:grid-cols-[1.35fr_1fr]">
          <section>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[22px] text-ink">Right now</h2>
              <Link
                href="/tasks"
                className="text-[12.5px] font-medium text-ink-muted transition-colors hover:text-saffron"
              >
                All tasks →
              </Link>
            </div>
            <p className="mb-4 text-[13px] text-ink-muted">
              What needs your attention, most pressing first.
            </p>
            <RightNow alerts={alerts} limit={6} />
          </section>

          <section>
            <h2 className="font-display text-[22px] text-ink">Planning pulse</h2>
            <p className="mb-6 mt-1 text-[13px] text-ink-muted">
              Where things stand today.
            </p>

            <PlanningPulse
              metrics={[
                {
                  key: "readiness",
                  value: readiness.percent,
                  format: "percent",
                  label: "Wedding readiness",
                  detail: `${readiness.blockers.length} things holding it back`,
                },
                ...(canSeeMoney
                  ? [{
                      key: "forecast",
                      value: budget.finance.forecast,
                      format: "money-compact" as const,
                      currency,
                      label: "Forecast spend",
                      detail: `Against a ${formatMoney(budget.finance.totalBudget, currency)} budget`,
                      href: "/budget",
                      tone: budget.finance.isOverBudget ? ("critical" as const) : ("default" as const),
                    }]
                  : []),
                {
                  key: "guests",
                  value: counts.invited || snapshot.wedding.estimatedGuests,
                  label: "Expected guests",
                  detail: `${counts.confirmed} confirmed, ${counts.pending} awaiting a reply`,
                  href: "/guests",
                },
                {
                  key: "payments",
                  value: paymentsThisMonth,
                  label: "Payments due this month",
                  href: "/budget?view=payments",
                  tone: paymentsThisMonth > 0 ? ("warning" as const) : ("default" as const),
                },
              ]}
            />

            <div className="mt-9">
              <MoodboardStrip
                boardId={moodboard?.id ?? null}
                boardName={moodboard?.name ?? "Overall Wedding"}
                itemCount={moodboard?._count.items ?? 0}
                canUpload={viewer.permissions.has("documents.upload")}
                images={(moodboard?.items ?? []).map((item) => ({
                  id: item.id,
                  url: variantUrl(item.media, "thumb"),
                  caption: item.caption ?? item.media.caption,
                  blurData: item.media.blurData,
                }))}
              />
            </div>
          </section>
        </div>

        <div className="hairline" />

        {/* ── Next best actions · Today's agenda ───────────────────────────── */}
        <div
          className={cn(
            "grid gap-x-12 gap-y-10 py-9",
            // Nothing on today? Give the whole width to what to do next
            // rather than leaving half a screen blank.
            agenda.length > 0 ? "lg:grid-cols-[1.35fr_1fr]" : "lg:grid-cols-1",
          )}
        >
          <section>
            <h2 className="font-display text-[22px] text-ink">Next best actions</h2>
            <p className="mb-3 mt-1 text-[13px] text-ink-muted">
              Ranked by urgency, importance and what they unblock.
            </p>
            <NextBestActions tasks={actions} />
          </section>

          {agenda.length === 0 ? null : (
          <section>
            <h2 className="font-display text-[22px] text-ink">
              {todaysEntries.length > 0 ? "Today's agenda" : "Due today"}
            </h2>
            <p className="mb-3 mt-1 text-[13px] text-ink-muted">
              {formatRelativeDay(snapshot.today)} ·{" "}
              {new Date(snapshot.today).toLocaleDateString("en-GB", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </p>
            <TodaysAgenda items={agenda} emptyMessage="" />
          </section>
          )}
        </div>

        <div className="hairline" />

        {/* ── Payments · Activity ──────────────────────────────────────────── */}
        <div className="grid gap-x-12 gap-y-10 py-9 lg:grid-cols-[1.35fr_1fr]">
          {canSeeMoney ? (
            <section>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[22px] text-ink">Money</h2>
                <Link
                  href="/budget"
                  className="text-[12.5px] font-medium text-ink-muted transition-colors hover:text-saffron"
                >
                  Open budget →
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
                <Figure label="Budget" value={formatCompactMoney(budget.finance.totalBudget, currency)} />
                <Figure
                  label="Forecast"
                  value={formatCompactMoney(budget.finance.forecast, currency)}
                  tone={budget.finance.isOverBudget ? "critical" : "default"}
                />
                <Figure label="Under contract" value={formatCompactMoney(budget.finance.committed, currency)} />
                <Figure label="Paid" value={formatCompactMoney(budget.finance.paid, currency)} />
              </div>

              {upcomingPayments.length > 0 ? (
                <div className="mt-7">
                  <div className="eyebrow mb-2">Coming up</div>
                  <ul>
                    {upcomingPayments.map((payment) => {
                      const vendor = payment.vendorId
                        ? snapshot.vendors.find((v) => v.id === payment.vendorId)
                        : null;
                      const days = daysBetween(snapshot.today, new Date(payment.dueDate));
                      return (
                        <li
                          key={payment.id}
                          className="flex items-center gap-4 border-b border-line py-2.5 last:border-b-0"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] text-ink">
                              {vendor?.businessName ?? payment.label}
                            </span>
                            <span
                              className={cn(
                                "text-[11.5px]",
                                days < 0 ? "font-medium text-critical" : "text-ink-muted",
                              )}
                            >
                              {days < 0
                                ? `${-days} ${-days === 1 ? "day" : "days"} overdue`
                                : formatRelativeDay(new Date(payment.dueDate), snapshot.today)}
                            </span>
                          </span>
                          <span className="tabular shrink-0 text-[13.5px] text-ink">
                            {formatCompactMoney(
                              budget.converter.toBase(payment.amount, payment.currency),
                              currency,
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="mt-6 text-[13px] text-ink-muted">
                  No payments scheduled yet. They'll appear here as vendors are
                  contracted.
                </p>
              )}
            </section>
          ) : (
            <section>
              <h2 className="font-display text-[22px] text-ink">Your part</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                You can see and work on everything except the finances. The
                tasks assigned to you are in the list above.
              </p>
            </section>
          )}

          <section>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[22px] text-ink">Lately</h2>
              <Link
                href="/activity"
                className="text-[12.5px] font-medium text-ink-muted transition-colors hover:text-saffron"
              >
                Everything →
              </Link>
            </div>
            <ul className="mt-4">
              {activity.map((entry) => (
                <li key={entry.id} className="border-b border-line py-2.5 last:border-b-0">
                  <p className="text-[13px] leading-snug text-ink-soft">{entry.summary}</p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    {formatTimeAgo(entry.createdAt)}
                    {entry.source === "AUTOMATED" ? " · automatic" : ""}
                    {entry.source === "AI" ? " · AI Planner" : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* ── AI insight ───────────────────────────────────────────────────── */}
        <div className="hairline" />
        <section className="py-7">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <div className="min-w-0 max-w-xl flex-1">
              <div className="eyebrow mb-1.5">Planner note</div>
              <p className="text-[14px] leading-relaxed text-ink-soft">
                {buildInsight(budget, alerts.length, canSeeMoney, snapshot.events.length, currency)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href="/vendors?category=VENUE"
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-saffron/40 hover:bg-saffron-soft hover:text-saffron"
              >
                Compare venues
              </Link>
              <Link
                href="/ai"
                className="rounded-full border border-plum/25 bg-plum-soft px-3 py-1.5 text-[12.5px] font-medium text-plum transition-opacity hover:opacity-80"
              >
                Ask why
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="text-ink-faint">·</span>;
}

function Figure({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "critical";
}) {
  return (
    <div>
      <div
        className={cn(
          "tabular font-display text-[22px] leading-none",
          tone === "critical" ? "text-critical" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] text-ink-muted">{label}</div>
    </div>
  );
}

/** A deterministic observation from the real numbers — true with or without an API key. */
function buildInsight(
  budget: ReturnType<typeof buildBudgetView>,
  alertCount: number,
  canSeeMoney: boolean,
  eventCount: number,
  currency: string,
): string {
  const noVenue = budget.drivers.eventCounts.size > 0;
  const overspending = budget.categories
    .filter((c) => c.variance > 0)
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 3);
  const potential = overspending.reduce((sum, c) => sum + c.variance, 0);

  if (noVenue && eventCount > 0 && budget.finance.committed === 0) {
    return (
      "Nothing is contracted yet, so every figure here is still an estimate. " +
      "Choosing the venue is the decision that turns most of this from a guess " +
      "into a plan — it sets the date, the room block and roughly two thirds of the budget."
    );
  }
  if (canSeeMoney && potential > 5_000) {
    return (
      `Around ${formatCompactMoney(potential, currency)} sits above allocation across ` +
      `${overspending.map((c) => c.name.toLowerCase()).join(", ")}. That's where a ` +
      `renegotiation would move the number most.`
    );
  }
  if (alertCount > 0) {
    return `There ${alertCount === 1 ? "is one thing" : `are ${alertCount} things`} on the attention list. Working down from the top is the fastest way to move readiness.`;
  }
  return "Nothing is flagged and nothing is overdue. A good week to get ahead on the run of show.";
}
