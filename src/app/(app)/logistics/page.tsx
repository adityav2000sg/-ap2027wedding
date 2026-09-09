import { redirect } from "next/navigation";

import {
  guestsNeedingPickup,
  roomsContracted,
  roomsRequired,
} from "@/domain/guests";
import { cn } from "@/lib/cn";
import { BedIcon, PlaneIcon, RouteIcon } from "@/components/ui/icons";
import { ExportMenu } from "@/components/wedding/export-menu";
import { Responsibilities } from "./responsibilities";
import { RoomBoard } from "./room-board";
import { TransportBoard } from "./transport-board";
import { TravelBoard } from "./travel-board";
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

  const householdNameById = new Map(snapshot.households.map((h) => [h.id, h.name]));
  const hotelNameById = new Map(snapshot.hotels.map((h) => [h.id, h.name]));
  const guestRecordById = new Map(snapshot.guests.map((g) => [g.id, g]));

  // Grouped by room, in room order, with everyone in it.
  const roomsForBoard = [
    ...snapshot.stays
      .filter((stay) => stay.roomNumber)
      .reduce((map, stay) => {
        const key = stay.roomNumber!;
        const guest = guestRecordById.get(stay.guestId);
        if (!guest) return map;

        const room = map.get(key) ?? {
          number: key,
          hotelName: hotelNameById.get(stay.hotelId) ?? "",
          occupants: [] as {
            guestId: string;
            name: string;
            householdName: string | null;
            side: string;
            isChild: boolean;
            isSenior: boolean;
            accessibilityNeeds: string | null;
          }[],
        };

        room.occupants.push({
          guestId: guest.id,
          name: `${guest.firstName} ${guest.lastName}`.trim(),
          householdName: guest.householdId
            ? householdNameById.get(guest.householdId) ?? null
            : null,
          side: guest.side,
          isChild: guest.isChild,
          isSenior: guest.isSenior,
          accessibilityNeeds: guest.accessibilityNeeds,
        });

        map.set(key, room);
        return map;
      }, new Map<string, { number: string; hotelName: string; occupants: { guestId: string; name: string; householdName: string | null; side: string; isChild: boolean; isSenior: boolean; accessibilityNeeds: string | null }[] }>())
      .values(),
  ].sort((a, b) => Number(a.number) - Number(b.number) || a.number.localeCompare(b.number));

  const pickups = snapshot.travel.filter(
    (t) => t.direction === "ARRIVAL" && t.pickupRequired,
  );
  const unassignedPickups = pickups.filter((t) => !t.journeyId);

  const unownedResponsibilities = snapshot.responsibilities.filter((r) => !r.ownerId);

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
          <RoomBoard
            canEdit={viewer.permissions.has("logistics.edit")}
            perRoom={snapshot.wedding.guestsPerRoom}
            rooms={roomsForBoard}
            unhoused={unhoused.map((guest) => ({
              guestId: guest.id,
              name: `${guest.firstName} ${guest.lastName}`.trim(),
              householdName: guest.householdId
                ? householdNameById.get(guest.householdId) ?? null
                : null,
              side: guest.side,
              isChild: guest.isChild,
              isSenior: guest.isSenior,
              accessibilityNeeds: guest.accessibilityNeeds,
            }))}
          />
        }
        travel={
          <TravelBoard
            canEdit={viewer.permissions.has("logistics.edit")}
            rows={snapshot.travel.map((record) => ({
              id: record.id,
              guestId: record.guestId,
              guestName: guestById.get(record.guestId) ?? "Unknown guest",
              direction: record.direction,
              mode: record.mode,
              carrier: record.carrier,
              serviceNumber: record.serviceNumber,
              hub: record.hub,
              scheduledAt: new Date(record.scheduledAt).toISOString(),
              pickupRequired: record.pickupRequired,
              journeyId: record.journeyId,
            }))}
            guests={snapshot.guests
              .map((guest) => ({
                id: guest.id,
                name: `${guest.firstName} ${guest.lastName}`.trim(),
              }))
              .sort((a, b) => a.name.localeCompare(b.name))}
            journeys={snapshot.journeys.map((journey) => ({
              id: journey.id,
              purpose: journey.purpose,
              date: new Date(journey.date).toISOString(),
            }))}
          />
        }
        transport={
          <TransportBoard
            canEdit={viewer.permissions.has("logistics.edit")}
            journeys={snapshot.journeys.map((journey) => ({
              id: journey.id,
              purpose: journey.purpose,
              date: new Date(journey.date).toISOString(),
              startMinute: journey.startMinute,
              endMinute: journey.endMinute,
              fromLocation: journey.fromLocation,
              toLocation: journey.toLocation,
              vehicleId: journey.vehicleId,
              eventId: journey.eventId,
              passengerIds: journey.passengerIds,
            }))}
            vehicles={snapshot.vehicles.map((vehicle) => ({
              id: vehicle.id,
              label: vehicle.label,
              vehicleType: vehicle.vehicleType,
              capacity: vehicle.capacity,
              driverName: vehicle.driverName,
            }))}
            guests={snapshot.guests
              .map((guest) => ({
                id: guest.id,
                name: `${guest.firstName} ${guest.lastName}`.trim(),
              }))
              .sort((a, b) => a.name.localeCompare(b.name))}
            events={snapshot.events.map((event) => ({ id: event.id, name: event.name }))}
            pickupsWaiting={unassignedPickups.length}
          />
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
