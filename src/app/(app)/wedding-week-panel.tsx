"use client";

/**
 * Wedding-week mode.
 *
 * Once the wedding is days away the question changes from "are we on track?" to
 * "what's happening right now?". This panel takes over the top of Home: what's
 * on now, what's next, what's still unresolved. Large type, minimal chrome —
 * it's read on a phone, in a crowd, in a hurry.
 */

import * as React from "react";
import Link from "next/link";

import { cn, toneClasses } from "@/lib/cn";
import { formatMinute, toISODate } from "@/lib/dates";
import { Badge } from "@/components/ui/primitives";
import type { Alert } from "@/domain/risk";

interface Entry {
  id: string;
  title: string;
  date: string;
  startMinute: number;
  endMinute: number;
  location: string | null;
  status: string;
  vendorName: string | null;
  ownerName: string | null;
}

export function WeddingWeekPanel({
  snapshot,
  alerts,
}: {
  snapshot: {
    events: { id: string; name: string; date: string; startMinute: number; tone: string; slug: string }[];
    timeline: Entry[];
    today: string;
  };
  alerts: Alert[];
}) {
  // Re-read the clock every 30s so "now" and "next" stay honest on a screen
  // that might be left open all day.
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = toISODate(now);
  const minuteNow = now.getHours() * 60 + now.getMinutes();

  const todayEntries = snapshot.timeline
    .filter((entry) => toISODate(new Date(entry.date)) === todayKey)
    .sort((a, b) => a.startMinute - b.startMinute);

  const current = todayEntries.find(
    (entry) => entry.startMinute <= minuteNow && entry.endMinute > minuteNow,
  );
  const upcoming = todayEntries
    .filter((entry) => entry.startMinute > minuteNow)
    .slice(0, 3);

  const todayEvents = snapshot.events.filter(
    (event) => toISODate(new Date(event.date)) === todayKey,
  );

  return (
    <section className="mb-6 overflow-hidden rounded-[var(--radius-panel)] border border-saffron/25 bg-saffron-soft/50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-saffron/20 px-5 py-3">
        <div>
          <div className="eyebrow text-saffron">Wedding week · Today's command centre</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {todayEvents.length > 0 ? (
              todayEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.slug}`}
                  className="flex items-center gap-1.5 font-display text-[19px] text-ink hover:text-saffron"
                >
                  <span className={cn("h-2 w-2 rounded-full", toneClasses(event.tone).dot)} />
                  {event.name}
                </Link>
              ))
            ) : (
              <span className="font-display text-[19px] text-ink">
                No function today
              </span>
            )}
          </div>
        </div>
        <Link
          href="/timeline"
          className="text-[12.5px] font-medium text-saffron hover:underline"
        >
          Full run of show →
        </Link>
      </div>

      <div className="grid gap-px bg-saffron/15 sm:grid-cols-3">
        <div className="bg-canvas px-5 py-4">
          <div className="eyebrow mb-1.5">Happening now</div>
          {current ? (
            <>
              <p className="font-display text-[20px] leading-tight text-ink">
                {current.title}
              </p>
              <p className="mt-1 text-[12.5px] text-ink-muted">
                until {formatMinute(current.endMinute)}
                {current.location ? ` · ${current.location}` : ""}
              </p>
              {current.vendorName ? (
                <p className="mt-0.5 text-[12px] text-ink-faint">{current.vendorName}</p>
              ) : null}
            </>
          ) : (
            <p className="text-[13px] text-ink-muted">Nothing scheduled right now.</p>
          )}
        </div>

        <div className="bg-canvas px-5 py-4">
          <div className="eyebrow mb-1.5">Next</div>
          {upcoming.length > 0 ? (
            <ul className="space-y-2">
              {upcoming.map((entry, index) => (
                <li key={entry.id}>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "tabular shrink-0 text-[13px]",
                        index === 0 ? "font-semibold text-saffron" : "text-ink-muted",
                      )}
                    >
                      {formatMinute(entry.startMinute)}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 truncate",
                        index === 0 ? "text-[15px] text-ink" : "text-[13px] text-ink-soft",
                      )}
                    >
                      {entry.title}
                    </span>
                  </div>
                  {index === 0 && entry.location ? (
                    <p className="mt-0.5 pl-[52px] text-[11.5px] text-ink-faint">
                      {entry.location}
                      {entry.ownerName ? ` · ${entry.ownerName}` : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-muted">Nothing else scheduled today.</p>
          )}
        </div>

        <div className="bg-canvas px-5 py-4">
          <div className="eyebrow mb-1.5">Still unresolved</div>
          {alerts.length > 0 ? (
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li key={alert.key}>
                  <Link href={alert.href} className="group block">
                    <div className="flex items-start gap-1.5">
                      <Badge variant="critical" size="xs" className="mt-0.5 shrink-0">
                        !
                      </Badge>
                      <span className="text-[13px] leading-snug text-ink group-hover:text-critical">
                        {alert.title}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-positive">
              Nothing critical outstanding. Go and enjoy it.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
