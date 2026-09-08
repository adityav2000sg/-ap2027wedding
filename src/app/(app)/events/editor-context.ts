/**
 * The slice of the wedding the event editor's live checks read.
 *
 * The editor re-runs `checkEventDraft` on every keystroke, so it needs the
 * other functions and the venues in the browser — but not the whole snapshot.
 * This is the narrow, serialisable projection: seven fields per event, six per
 * venue, dates as ISO strings.
 */

import { toISODate } from "@/lib/dates";
import type { WeddingSnapshot } from "@/domain/types";
import type { EventEditorContext } from "./event-editor";

export function buildEditorContext(snapshot: WeddingSnapshot): EventEditorContext {
  return {
    weddingStart: toISODate(snapshot.wedding.startDate),
    weddingEnd: toISODate(snapshot.wedding.endDate),
    events: snapshot.events.map((event) => ({
      id: event.id,
      name: event.name,
      kind: event.kind,
      date: toISODate(event.date),
      startMinute: event.startMinute,
      endMinute: event.endMinute,
      venueId: event.venueId,
    })),
    venues: snapshot.venues.map((venue) => ({
      id: venue.id,
      name: venue.name,
      city: venue.city,
      capacity: venue.capacity,
      curfewMinute: venue.curfewMinute,
      alcoholAllowed: venue.alcoholAllowed,
      hasRainBackup: venue.hasRainBackup,
    })),
    guestCount: snapshot.guests.length,
  };
}
