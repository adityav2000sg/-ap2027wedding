import { redirect } from "next/navigation";

import {
  guestsNeedingPickup,
  roomsContracted,
  roomsRequired,
} from "@/domain/guests";
import { formatDateTime, formatMediumDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { BedIcon, PlaneIcon, RouteIcon } from "@/components/ui/icons";
import { ExportMenu } from "@/components/wedding/export-menu";
import { Responsibilities } from "./responsibilities";
import { getViewer } from "@/server/auth";
import { loadSnapshot } from "@/server/snapshot";
import { LogisticsTabs } from "./tabs";

export default async function LogisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const params = await searchParams;
  const snapshot = await loadSnapshot(viewer.weddingId);

  const guestById = new Map(
    snapshot.guests.map((g) => [g.id, `${g.firstName} ${g.lastName}`]),
  );
  const memberById = new Map(snapshot.members.map((m) => [m.id, m.name]));

  const needRooms = snapshot.guests.filter((g) => g.needsAccommodation);
  const housed = new Set(snapshot.stays.map((s) => s.guestId));
  const unhoused = needRooms.filter((g) => !housed.has(g.id));

  const pickups = snapshot.travel.filter(
    (t) => t.direction === "ARRIVAL" && t.pickupRequired,
  );
  const unassignedPickups = pickups.filter((t) => !t.journeyId);

  const unownedResponsibilities = snapshot.responsibilities.filter((r) => !r.ownerId);

  // Group stays by room number so the rooming list reads like a rooming list.
  const byRoom = new Map<string, { guests: string[]; hotel: string }>();
  for (const stay of snapshot.stays) {
    const key = stay.roomNumber ?? stay.id;
    const hotel = snapshot.hotels.find((h) => h.id === stay.hotelId)?.name ?? "";
    const entry = byRoom.get(key) ?? { guests: [], hotel };
    entry.guests.push(guestById.get(stay.guestId) ?? "Unknown");
    byRoom.set(key, entry);
  }
  const rooms = [...byRoom.entries()].sort(
    (a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]),
  );

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-8 sm:py-8">
      <header className="mb-7">
        <div className="eyebrow mb-2">Getting everyone there</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-script text-[30px] sm:text-[54px] text-ink">Logistics</h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">
              Rooms, flights, transfers and who's responsible for what.
            </p>
          </div>
          <ExportMenu kind="logistics" />
        </div>
      </header>

      {/* Headline numbers */}
      <div className="stat-row mb-6 border-y border-line py-5" style={{ ["--stat-cols" as string]: 4 }}>
        <Figure
          icon={<BedIcon size={14} />}
          value={`${roomsRequired(snapshot)}`}
          label="Rooms needed"
          detail={`${roomsContracted(snapshot)} held`}
          alarming={roomsRequired(snapshot) > roomsContracted(snapshot)}
        />
        <Figure
          icon={<BedIcon size={14} />}
          value={`${snapshot.stays.length}`}
          label="Guests allocated"
          detail={unhoused.length > 0 ? `${unhoused.length} still need one` : "everyone placed"}
          alarming={unhoused.length > 0}
        />
        <Figure
          icon={<PlaneIcon size={14} />}
          value={`${guestsNeedingPickup(snapshot)}`}
          label="Need collecting"
          detail={
            unassignedPickups.length > 0
              ? `${unassignedPickups.length} unassigned`
              : "all assigned"
          }
          alarming={unassignedPickups.length > 0}
        />
        <Figure
          icon={<RouteIcon size={14} />}
          value={`${snapshot.journeys.length}`}
          label="Journeys planned"
          detail={`${snapshot.vehicles.length} vehicles`}
        />
      </div>

      <LogisticsTabs
        initialView={params.view ?? "rooms"}
        rooms={
          snapshot.stays.length === 0 ? (
            <EmptyState
              title="No rooms allocated yet"
              description="Once the venue is confirmed and the room block is signed, allocate guests to rooms here. The plan from your spreadsheet is already loaded."
            />
          ) : (
            <>
              {unhoused.length > 0 ? (
                <div className="mb-5 rounded-lg border border-attention/25 bg-attention-soft px-3.5 py-2.5">
                  <p className="text-[12.5px] text-attention">
                    {unhoused.length} guests have said they need a bed but aren't in a
                    room yet.
                  </p>
                </div>
              ) : null}
              <ul className="grid gap-x-8 sm:grid-cols-2">
                {rooms.map(([number, room]) => (
                  <li
                    key={number}
                    className="flex items-baseline gap-4 border-b border-line py-2.5"
                  >
                    <span className="tabular w-9 shrink-0 font-display text-[16px] text-ink">
                      {number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-ink">
                        {room.guests.join(" · ")}
                      </span>
                      <span className="block text-[11px] text-ink-muted">{room.hotel}</span>
                    </span>
                    <span className="tabular shrink-0 text-[11.5px] text-ink-faint">
                      {room.guests.length}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )
        }
        travel={
          snapshot.travel.length === 0 ? (
            <EmptyState
              title="No travel details yet"
              description="Collect flight and arrival details from out-of-town guests, then assign airport pickups. Eleven guests have already flagged date conflicts — see their notes on the Guests page."
            />
          ) : (
            <ul>
              {snapshot.travel
                .slice()
                .sort(
                  (a, b) =>
                    new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
                )
                .map((record) => (
                  <li
                    key={record.id}
                    className="flex items-center gap-4 border-b border-line py-2.5"
                  >
                    <span className="w-[70px] shrink-0 text-[11.5px] text-ink-muted">
                      {record.direction === "ARRIVAL" ? "Arriving" : "Leaving"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-ink">
                        {guestById.get(record.guestId) ?? "Unknown guest"}
                      </span>
                      <span className="block text-[11.5px] text-ink-muted">
                        {[record.carrier, record.serviceNumber, record.hub]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-[12px] text-ink-soft">
                      {formatDateTime(new Date(record.scheduledAt))}
                    </span>
                    {record.pickupRequired ? (
                      <Badge
                        size="xs"
                        variant={record.journeyId ? "positive" : "attention"}
                        className="shrink-0"
                      >
                        {record.journeyId ? "Pickup set" : "Needs pickup"}
                      </Badge>
                    ) : null}
                  </li>
                ))}
            </ul>
          )
        }
        transport={
          snapshot.journeys.length === 0 ? (
            <EmptyState
              title="No transport scheduled"
              description="Airport transfers, shuttles between the hotel and the venue, and the cars for the couple all live here."
            />
          ) : (
            <ul>
              {snapshot.journeys.map((journey) => {
                const vehicle = snapshot.vehicles.find((v) => v.id === journey.vehicleId);
                return (
                  <li
                    key={journey.id}
                    className="flex items-center gap-4 border-b border-line py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] text-ink">{journey.purpose}</span>
                      <span className="block text-[11.5px] text-ink-muted">
                        {formatMediumDate(new Date(journey.date))}
                        {journey.fromLocation
                          ? ` · ${journey.fromLocation} → ${journey.toLocation ?? ""}`
                          : ""}
                      </span>
                    </span>
                    {vehicle ? (
                      <span className="shrink-0 text-right">
                        <span className="block text-[12.5px] text-ink">{vehicle.label}</span>
                        <span className="tabular block text-[11px] text-ink-muted">
                          {journey.passengerIds.length}/{vehicle.capacity} seats
                        </span>
                      </span>
                    ) : (
                      <Badge size="xs" variant="attention">No vehicle</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        }
        responsibilities={
          <Responsibilities
            canEdit={viewer.permissions.has("logistics.edit")}
            rows={snapshot.responsibilities.map((r) => ({
              id: r.id,
              title: r.title,
              area: r.area,
              ownerId: r.ownerId,
              backupId: r.backupId,
              eventId: r.eventId,
              importance: r.importance,
              status: r.status,
              notes: r.notes,
            }))}
            members={snapshot.members.map((m) => ({ id: m.id, name: m.name }))}
            events={snapshot.events.map((e) => ({ id: e.id, name: e.name }))}
          />
        }
      />
    </div>
  );
}

function Figure({
  icon, value, label, detail, alarming,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  detail?: string;
  alarming?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-ink-faint">{icon}</span>
        <span
          className={cn(
            "tabular font-display text-[24px] leading-none",
            alarming ? "text-critical" : "text-ink",
          )}
        >
          {value}
        </span>
      </div>
      <div className="mt-1.5 text-[11.5px] text-ink-muted">{label}</div>
      {detail ? (
        <div className={cn("text-[11px]", alarming ? "text-critical" : "text-ink-faint")}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}
