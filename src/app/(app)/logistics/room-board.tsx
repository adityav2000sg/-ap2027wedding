"use client";

/**
 * Who sleeps where.
 *
 * Room allocation is not data entry, it's rearranging: a couple wants to be
 * near her parents, somebody's flight lands late, a room turns out to have one
 * bed rather than two. The job is moving people between rooms over and over,
 * so that is the one thing this is built around.
 *
 * Pick a guest, pick a room, done — and the destination list shows how full
 * each room already is, because "which room has space" is the question you're
 * actually asking every single time.
 *
 * Deliberately not drag and drop. It reads well in a demo and fails on a phone,
 * which is where half of this will be done, and it hides capacity at the moment
 * you most need to see it.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { Avatar, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { Input, Select } from "@/components/ui/form";
import { SearchIcon } from "@/components/ui/icons";
import { setGuestRoom } from "@/server/actions/logistics";

export interface RoomOccupant {
  guestId: string;
  name: string;
  householdName: string | null;
  side: string;
  isChild: boolean;
  isSenior: boolean;
  accessibilityNeeds: string | null;
}

export interface Room {
  number: string;
  hotelName: string;
  occupants: RoomOccupant[];
}

export function RoomBoard({
  rooms,
  unhoused,
  perRoom,
  canEdit,
}: {
  rooms: Room[];
  unhoused: RoomOccupant[];
  /** What a room is meant to sleep, so over-filling can be flagged. */
  perRoom: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [moving, setMoving] = React.useState<string | null>(null);

  // Naming the hotel under every room only helps when there's more than one to
  // tell apart. With a single venue it's the same three words 112 times.
  const showHotel = React.useMemo(
    () => new Set(rooms.map((room) => room.hotelName).filter(Boolean)).size > 1,
    [rooms],
  );

  const roomNumbers = React.useMemo(
    () =>
      rooms
        .map((room) => room.number)
        .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    [rooms],
  );

  /** The next number nobody is in, for putting someone somewhere new. */
  const nextFree = React.useMemo(() => {
    const used = new Set(rooms.map((r) => Number(r.number)).filter(Number.isFinite));
    let candidate = 1;
    while (used.has(candidate)) candidate += 1;
    return String(candidate);
  }, [rooms]);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return rooms;
    return rooms.filter(
      (room) =>
        room.number.includes(q) ||
        room.occupants.some(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            (o.householdName ?? "").toLowerCase().includes(q),
        ),
    );
  }, [rooms, query]);

  async function move(guestId: string, roomNumber: string | null) {
    setBusy(guestId);
    await setGuestRoom(guestId, roomNumber);
    setBusy(null);
    setMoving(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-muted">
          {rooms.length} {rooms.length === 1 ? "room" : "rooms"} in use
          {unhoused.length > 0 ? (
            <span className="text-attention">
              {" "}
              · {unhoused.length} still need a bed
            </span>
          ) : null}
        </p>

        <div className="relative min-w-0 flex-1 sm:max-w-[240px]">
          <SearchIcon
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a name or room…"
            className="h-9 w-full pl-8 text-[12.5px]"
          />
        </div>
      </div>

      {/* Anyone with nowhere to sleep, first. */}
      {unhoused.length > 0 ? (
        <section className="mb-6 rounded-xl border border-attention/25 bg-attention-soft/40 p-3.5">
          <h3 className="mb-2 text-[12.5px] font-medium text-attention">
            {unhoused.length} {unhoused.length === 1 ? "person needs" : "people need"} a
            room
          </h3>
          <ul className="space-y-1">
            {unhoused.map((person) => (
              <li key={person.guestId} className="flex flex-wrap items-center gap-2">
                <Avatar
                  name={person.name}
                  tone={person.side === "BRIDE" ? "rose" : "indigo"}
                  size="xs"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {person.name}
                  {person.householdName ? (
                    <span className="ml-1.5 text-[11.5px] text-ink-faint">
                      {person.householdName}
                    </span>
                  ) : null}
                </span>
                {canEdit ? (
                  <RoomPicker
                    rooms={rooms}
                    roomNumbers={roomNumbers}
                    nextFree={nextFree}
                    perRoom={perRoom}
                    current={null}
                    busy={busy === person.guestId}
                    onPick={(room) => move(person.guestId, room)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title={query ? "No room or name matches" : "No rooms allocated yet"}
          description={
            query
              ? "Try a different name or number."
              : "Put someone in a room and it'll appear here."
          }
        />
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map((room) => {
              const over = room.occupants.length > perRoom;
              return (
                <motion.li
                  key={room.number}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "rounded-xl border p-3",
                    over ? "border-attention/40 bg-attention-soft/30" : "border-line",
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="tabular text-[14px] font-medium text-ink">
                      Room {room.number}
                    </span>
                    {showHotel ? (
                      <span className="text-[11.5px] text-ink-faint">{room.hotelName}</span>
                    ) : null}
                    <span
                      className={cn(
                        "tabular ml-auto text-[11.5px]",
                        over ? "text-attention" : "text-ink-muted",
                      )}
                    >
                      {room.occupants.length} of {perRoom}
                    </span>
                    {over ? (
                      <Badge size="xs" variant="attention">
                        Over capacity
                      </Badge>
                    ) : null}
                  </div>

                  <ul className="space-y-1">
                    {room.occupants.map((person) => (
                      <li
                        key={person.guestId}
                        className={cn(
                          "flex flex-wrap items-center gap-2",
                          busy === person.guestId && "opacity-50",
                        )}
                      >
                        <Avatar
                          name={person.name}
                          tone={person.side === "BRIDE" ? "rose" : "indigo"}
                          size="xs"
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                          {person.name}
                          {person.isChild ? (
                            <span className="ml-1.5 text-[11px] text-ink-faint">child</span>
                          ) : null}
                          {person.isSenior ? (
                            <span className="ml-1.5 text-[11px] text-ink-faint">elderly</span>
                          ) : null}
                          {person.accessibilityNeeds ? (
                            <span className="ml-1.5 text-[11px] text-info">
                              {person.accessibilityNeeds}
                            </span>
                          ) : null}
                        </span>

                        {canEdit ? (
                          moving === person.guestId ? (
                            <RoomPicker
                              rooms={rooms}
                              roomNumbers={roomNumbers}
                              nextFree={nextFree}
                              perRoom={perRoom}
                              current={room.number}
                              busy={busy === person.guestId}
                              autoFocus
                              onPick={(next) => move(person.guestId, next)}
                              onCancel={() => setMoving(null)}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setMoving(person.guestId)}
                              className="shrink-0 rounded-lg border border-line-strong px-2 py-1 text-[11.5px] text-ink-soft transition-colors hover:border-ink-faint hover:bg-surface-sunken hover:text-ink"
                            >
                              Move
                            </button>
                          )
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </>
  );
}

/**
 * Where to put someone.
 *
 * Every room is listed with how full it is, so the choice is made with the
 * capacity in front of you rather than remembered.
 */
function RoomPicker({
  rooms,
  roomNumbers,
  nextFree,
  perRoom,
  current,
  busy,
  autoFocus,
  onPick,
  onCancel,
}: {
  rooms: Room[];
  roomNumbers: string[];
  nextFree: string;
  perRoom: number;
  current: string | null;
  busy: boolean;
  autoFocus?: boolean;
  onPick(room: string | null): void;
  onCancel?(): void;
}) {
  const occupancy = React.useMemo(
    () => new Map(rooms.map((room) => [room.number, room.occupants.length])),
    [rooms],
  );

  /**
   * Who is already in each room.
   *
   * "Room 12 — 2 of 2" tells you there's no space; it doesn't tell you whether
   * the person you're placing should be in there anyway. Putting somebody with
   * their own family, or beside the relative they're travelling with, is the
   * whole job — so the names come with the number.
   */
  const occupantNames = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const room of rooms) {
      const names = room.occupants.map((person) => person.name);
      map.set(
        room.number,
        names.length <= 2
          ? names.join(", ")
          : `${names.slice(0, 2).join(", ")} +${names.length - 2}`,
      );
    }
    return map;
  }, [rooms]);

  return (
    <span className="flex shrink-0 items-center gap-1">
      <Select
        autoFocus={autoFocus}
        disabled={busy}
        value={current ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          if (value === "__none") onPick(null);
          else if (value) onPick(value);
        }}
        className="h-8 w-auto min-w-[150px] text-[12px]"
      >
        <option value="">
          {current ? `Room ${current} — stay put` : "Choose a room…"}
        </option>
        {roomNumbers
          .filter((number) => number !== current)
          .map((number) => {
            const taken = occupancy.get(number) ?? 0;
            const names = occupantNames.get(number);
            return (
              <option key={number} value={number}>
                Room {number} — {taken === 0 ? "empty" : names}
                {taken > 0 ? ` · ${taken} of ${perRoom}${taken >= perRoom ? ", full" : ""}` : ""}
              </option>
            );
          })}
        <option value={nextFree}>Room {nextFree} — new, empty</option>
        {current ? <option value="__none">Take out of this room</option> : null}
      </Select>

      {onCancel ? (
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </span>
  );
}
