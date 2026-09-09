import Link from "next/link";
import { redirect } from "next/navigation";

import { analyseTasks } from "@/domain/tasks";
import { detectConflicts, groupTimelineByDay, snapshotEventVenues } from "@/domain/timeline";
import { PHASE_LABEL } from "@/domain/task-library";
import { civilDate, formatDueLabel, formatLongDate, formatMinute } from "@/lib/dates";
import { cn, toneClasses } from "@/lib/cn";
import { Badge } from "@/components/ui/primitives";
import { EventRunOfShow } from "../events/[slug]/run-of-show";
import { getViewer } from "@/server/auth";
import { loadSnapshot } from "@/server/snapshot";
import { TimelineTabs } from "./tabs";

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; event?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const params = await searchParams;
  const snapshot = await loadSnapshot(viewer.weddingId);
  const tasks = analyseTasks(snapshot);

  const conflicts = detectConflicts(snapshot.timeline, snapshot.timelineDeps, {
    vendors: snapshot.vendors,
    venues: snapshot.venues,
    eventVenue: snapshotEventVenues(snapshot),
  });

  const memberLookup = new Map(
    snapshot.members.map((m) => [m.id, { name: m.name, tone: m.avatarTone }]),
  );
  const eventById = new Map(snapshot.events.map((e) => [e.id, e]));

  const days = groupTimelineByDay(snapshot.timeline);
  const canEditTimeline = viewer.permissions.has("timeline.edit");

  // Planning timeline: milestone tasks grouped by phase, in wedding order.
  const milestones = tasks
    .filter((t) => t.isMilestone || t.importance >= 5)
    .sort((a, b) => {
      const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aDate - bDate;
    });

  const byPhase = new Map<string, typeof milestones>();
  for (const task of milestones) {
    const list = byPhase.get(task.phase) ?? [];
    list.push(task);
    byPhase.set(task.phase, list);
  }

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-8 sm:py-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">When everything happens</div>
        <h1 className="font-script text-[30px] sm:text-[54px] text-ink">Timeline</h1>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">
          The months leading up to it, and the minutes within it.
        </p>
      </header>

      {conflicts.filter((c) => c.severity !== "info").length > 0 ? (
        <div className="mb-6 rounded-xl border border-important/25 bg-important-soft px-4 py-3">
          <h2 className="text-[13px] font-medium text-important">
            {conflicts.filter((c) => c.severity !== "info").length} scheduling{" "}
            {conflicts.filter((c) => c.severity !== "info").length === 1 ? "conflict" : "conflicts"}
          </h2>
          <ul className="mt-1.5 space-y-1">
            {conflicts
              .filter((c) => c.severity !== "info")
              .slice(0, 4)
              .map((conflict) => (
                <li key={conflict.key} className="text-[12.5px] leading-snug text-ink-soft">
                  <span className="font-medium text-ink">{conflict.title}</span> — {conflict.detail}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <TimelineTabs
        initialView={params.view ?? "plan"}
        planning={
          <div className="space-y-8">
            {/* This tab confused people, reasonably: it looks like a list you
                should be able to add to, and it isn't one. It's the task list
                seen a different way. */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-soft px-3.5 py-2.5">
              <p className="text-[12.5px] leading-snug text-ink-muted">
                Every task you have, sorted by when it needs doing rather than by
                area. Add or change anything on the{" "}
                <Link href="/tasks" className="text-saffron underline-offset-2 hover:underline">
                  Tasks
                </Link>{" "}
                page — this view follows.
              </p>
              <Link
                href="/tasks"
                className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[12.5px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
              >
                Open tasks
              </Link>
            </div>

            {[...byPhase.entries()].map(([phase, phaseTasks]) => (
              <section key={phase}>
                <div className="rule-heading mb-3">
                  <h2 className="font-display text-[18px] text-ink">
                    {PHASE_LABEL[phase as keyof typeof PHASE_LABEL] ?? phase}
                  </h2>
                </div>
                <ul>
                  {phaseTasks.map((task) => {
                    const event = task.eventId ? eventById.get(task.eventId) : null;
                    return (
                      <li key={task.id} className="border-b border-line last:border-b-0">
                        <Link
                          href={`/tasks?task=${task.id}`}
                          className="group flex items-center gap-4 py-2.5"
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              task.isDone ? "bg-positive"
                              : task.isOverdue ? "bg-critical"
                              : "bg-line-strong",
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block text-[13.5px] transition-colors group-hover:text-saffron",
                                task.isDone ? "text-ink-faint line-through" : "text-ink",
                              )}
                            >
                              {task.title}
                            </span>
                            {event ? (
                              <span
                                className={cn(
                                  "block text-[11.5px]",
                                  toneClasses(event.accentTone).text,
                                )}
                              >
                                {event.name}
                              </span>
                            ) : null}
                          </span>
                          {task.dueDate ? (
                            <span
                              className={cn(
                                "shrink-0 text-[11.5px]",
                                task.isOverdue ? "font-medium text-critical" : "text-ink-muted",
                              )}
                            >
                              {formatDueLabel(new Date(task.dueDate))}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        }
        runOfShow={
          <div className="space-y-10">
            <p className="rounded-xl border border-line bg-surface-soft px-3.5 py-2.5 text-[12.5px] leading-snug text-ink-muted">
              The run of show, hour by hour, for each day of the wedding week.
              This one is the real schedule rather than a view of something else —
              add a moment against any day below.
            </p>
            {days.map((day) => {
              const dayEvents = snapshot.events.filter(
                (e) => e.date.toISOString().slice(0, 10) === day.date,
              );
              return (
                <section key={day.date}>
                  <div className="mb-4 flex flex-wrap items-baseline gap-3">
                    <h2 className="font-display text-[22px] text-ink">
                      {formatLongDate(civilDate(day.date))}
                    </h2>
                    {dayEvents.map((event) => (
                      <Link
                        key={event.id}
                        href={`/events/${event.slug}`}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80",
                          toneClasses(event.accentTone).bg,
                          toneClasses(event.accentTone).text,
                          toneClasses(event.accentTone).border,
                        )}
                      >
                        {event.name}
                      </Link>
                    ))}
                  </div>

                  <EventRunOfShow
                    tone={dayEvents[0]?.accentTone ?? "saffron"}
                    entries={day.entries.map((entry) => ({
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
                      ownerId: entry.ownerId,
                      vendorId: entry.vendorId,
                    }))}
                    editing={
                      canEditTimeline
                        ? {
                            // A day usually belongs to one function; a moment
                            // added on a day with none is wedding-level.
                            eventId: dayEvents[0]?.id ?? null,
                            date: day.date,
                            defaultStartMinute:
                              dayEvents[0]?.startMinute ?? 9 * 60,
                            members: snapshot.members.map((m) => ({
                              id: m.id,
                              name: m.name,
                            })),
                            vendors: snapshot.vendors
                              .filter((v) => v.status !== "REJECTED")
                              .map((v) => ({ id: v.id, name: v.businessName })),
                          }
                        : undefined
                    }
                  />
                </section>
              );
            })}
          </div>
        }
      />
    </div>
  );
}
