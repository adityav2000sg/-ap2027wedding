"use client";

/**
 * Transfers, shuttles and the cars on the day.
 *
 * Two things live here, and they answer each other: the vehicles you have, and
 * the runs you're asking them to do. A run over its vehicle's capacity is the
 * failure this screen exists to prevent, so seats used against seats available
 * is on every row rather than in anybody's head.
 *
 * Like the room board, it was previously a printout — a list of journeys that
 * couldn't be changed, above a pickup list that couldn't be assigned.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { formatMediumDate, formatMinute } from "@/lib/dates";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlays";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { CloseIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import {
  archiveVehicle,
  createJourney,
  createVehicle,
  deleteJourney,
  updateJourney,
} from "@/server/actions/logistics";

export interface JourneyRow {
  id: string;
  purpose: string;
  /** ISO date. */
  date: string;
  startMinute: number;
  endMinute: number;
  fromLocation: string | null;
  toLocation: string | null;
  vehicleId: string | null;
  eventId: string | null;
  passengerIds: string[];
}

export interface VehicleRow {
  id: string;
  label: string;
  vehicleType: string;
  capacity: number;
  driverName: string | null;
}

const VEHICLE_TYPES = ["Sedan", "SUV", "Van", "Minibus", "Coach", "Boat"] as const;

function toTime(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function toMinute(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

interface Draft {
  id: string | null;
  purpose: string;
  date: string;
  start: string;
  end: string;
  fromLocation: string;
  toLocation: string;
  vehicleId: string;
  eventId: string;
  passengerIds: string[];
  notes: string;
}

function emptyDraft(): Draft {
  return {
    id: null,
    purpose: "",
    date: "",
    start: "09:00",
    end: "10:00",
    fromLocation: "",
    toLocation: "",
    vehicleId: "",
    eventId: "",
    passengerIds: [],
    notes: "",
  };
}

function draftFrom(row: JourneyRow): Draft {
  return {
    id: row.id,
    purpose: row.purpose,
    date: new Date(row.date).toISOString().slice(0, 10),
    start: toTime(row.startMinute),
    end: toTime(row.endMinute),
    fromLocation: row.fromLocation ?? "",
    toLocation: row.toLocation ?? "",
    vehicleId: row.vehicleId ?? "",
    eventId: row.eventId ?? "",
    passengerIds: row.passengerIds,
    notes: "",
  };
}

export function TransportBoard({
  journeys,
  vehicles,
  guests,
  events,
  pickupsWaiting,
  canEdit,
}: {
  journeys: JourneyRow[];
  vehicles: VehicleRow[];
  guests: { id: string; name: string }[];
  events: { id: string; name: string }[];
  /** Arrivals flagged for collection that aren't on a run yet. */
  pickupsWaiting: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [vehicleDraft, setVehicleDraft] = React.useState<{
    label: string;
    vehicleType: string;
    capacity: string;
    driverName: string;
    driverPhone: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState<string | null>(null);

  const guestName = React.useMemo(
    () => new Map(guests.map((guest) => [guest.id, guest.name])),
    [guests],
  );
  const vehicleById = React.useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])),
    [vehicles],
  );

  const sorted = React.useMemo(
    () =>
      journeys
        .slice()
        .sort(
          (a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime() ||
            a.startMinute - b.startMinute,
        ),
    [journeys],
  );

  async function saveJourney() {
    if (!draft) return;
    if (!draft.purpose.trim()) {
      setError("What is this run for?");
      return;
    }
    if (!draft.date) {
      setError("Which day?");
      return;
    }

    setBusy("save");
    setError(null);
    const payload = {
      purpose: draft.purpose,
      date: draft.date,
      startMinute: toMinute(draft.start),
      endMinute: toMinute(draft.end),
      vehicleId: draft.vehicleId || null,
      eventId: draft.eventId || null,
      fromLocation: draft.fromLocation,
      toLocation: draft.toLocation,
      notes: draft.notes,
      passengerIds: draft.passengerIds,
    };

    const result = draft.id
      ? await updateJourney({ id: draft.id, ...payload })
      : await createJourney(payload);

    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft(null);
    router.refresh();
  }

  async function saveVehicle() {
    if (!vehicleDraft) return;
    if (!vehicleDraft.label.trim()) {
      setError("Give the vehicle a name.");
      return;
    }

    setBusy("vehicle");
    setError(null);
    const result = await createVehicle({
      label: vehicleDraft.label,
      vehicleType: vehicleDraft.vehicleType,
      capacity: Number(vehicleDraft.capacity) || 4,
      driverName: vehicleDraft.driverName,
      driverPhone: vehicleDraft.driverPhone,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setVehicleDraft(null);
    router.refresh();
  }

  async function removeJourney(id: string) {
    setBusy(id);
    await deleteJourney(id);
    setBusy(null);
    setConfirmingDelete(null);
    router.refresh();
  }

  async function removeVehicle(id: string) {
    setBusy(id);
    await archiveVehicle(id);
    setBusy(null);
    router.refresh();
  }

  return (
    <>
      {/* The fleet */}
      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[12.5px] font-medium text-ink">
            Vehicles
            <span className="tabular ml-2 font-normal text-ink-muted">
              {vehicles.length}
            </span>
          </h3>
          {canEdit ? (
            <Button
              variant="secondary"
              size="xs"
              className="gap-1.5"
              onClick={() => {
                setError(null);
                setVehicleDraft({
                  label: "",
                  vehicleType: "Van",
                  capacity: "8",
                  driverName: "",
                  driverPhone: "",
                });
              }}
            >
              <PlusIcon size={13} />
              Add a vehicle
            </Button>
          ) : null}
        </div>

        {vehicles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-[12.5px] text-ink-muted">
            No vehicles yet. Add the coach or the airport cars and you can put
            journeys on them.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {vehicles.map((vehicle) => {
              const used = journeys
                .filter((journey) => journey.vehicleId === vehicle.id)
                .reduce((most, journey) => Math.max(most, journey.passengerIds.length), 0);
              return (
                <li
                  key={vehicle.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 py-2",
                    busy === vehicle.id && "opacity-50",
                  )}
                >
                  <span>
                    <span className="block text-[12.5px] text-ink">{vehicle.label}</span>
                    <span className="tabular block text-[11px] text-ink-muted">
                      {vehicle.vehicleType} · {vehicle.capacity} seats
                      {vehicle.driverName ? ` · ${vehicle.driverName}` : ""}
                      {used > vehicle.capacity ? " · over capacity" : ""}
                    </span>
                  </span>
                  {canEdit ? (
                    <button
                      type="button"
                      aria-label={`Remove ${vehicle.label}`}
                      onClick={() => removeVehicle(vehicle.id)}
                      className="rounded-lg p-1 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-critical"
                    >
                      <CloseIcon size={12} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* The runs */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-muted">
          {journeys.length} {journeys.length === 1 ? "journey" : "journeys"} planned
          {pickupsWaiting > 0 ? (
            <span className="text-attention">
              {" "}
              · {pickupsWaiting} {pickupsWaiting === 1 ? "arrival" : "arrivals"} still
              waiting for one
            </span>
          ) : null}
        </p>

        {canEdit ? (
          <Button
            variant="primary"
            size="sm"
            className="h-9 shrink-0 gap-1.5"
            onClick={() => {
              setError(null);
              setDraft(emptyDraft());
            }}
          >
            <PlusIcon size={14} />
            Plan a journey
          </Button>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="No transport scheduled"
          description="Airport transfers, shuttles between the hotel and the venue, and the cars for the couple all live here."
        />
      ) : (
        <ul>
          {sorted.map((journey, index) => {
            const vehicle = journey.vehicleId ? vehicleById.get(journey.vehicleId) : null;
            const over = vehicle ? journey.passengerIds.length > vehicle.capacity : false;
            return (
              <motion.li
                key={journey.id}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.24,
                  ease: [0.22, 1, 0.36, 1],
                  delay: reduce ? 0 : Math.min(index * 0.012, 0.18),
                }}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3",
                  busy === journey.id && "opacity-50",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-ink">{journey.purpose}</span>
                  <span className="block text-[11.5px] text-ink-muted">
                    {formatMediumDate(new Date(journey.date))} ·{" "}
                    {formatMinute(journey.startMinute)}–{formatMinute(journey.endMinute)}
                    {journey.fromLocation
                      ? ` · ${journey.fromLocation} → ${journey.toLocation ?? ""}`
                      : ""}
                  </span>
                  {journey.passengerIds.length > 0 ? (
                    <span className="mt-0.5 block truncate text-[11.5px] text-ink-faint">
                      {journey.passengerIds
                        .map((id) => guestName.get(id) ?? "Guest")
                        .join(", ")}
                    </span>
                  ) : null}
                </span>

                {vehicle ? (
                  <span className="shrink-0 text-right">
                    <span className="block text-[12.5px] text-ink">{vehicle.label}</span>
                    <span
                      className={cn(
                        "tabular block text-[11px]",
                        over ? "text-critical" : "text-ink-muted",
                      )}
                    >
                      {journey.passengerIds.length}/{vehicle.capacity} seats
                    </span>
                  </span>
                ) : (
                  <Badge size="xs" variant="attention">
                    No vehicle
                  </Badge>
                )}

                {canEdit ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setError(null);
                        setDraft(draftFrom(journey));
                      }}
                    >
                      Edit
                    </Button>
                    {confirmingDelete === journey.id ? (
                      <>
                        <Button
                          variant="danger"
                          size="xs"
                          onClick={() => removeJourney(journey.id)}
                        >
                          Remove
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setConfirmingDelete(null)}
                        >
                          Keep
                        </Button>
                      </>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remove ${journey.purpose}`}
                        onClick={() => setConfirmingDelete(journey.id)}
                        className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-critical"
                      >
                        <TrashIcon size={14} />
                      </button>
                    )}
                  </span>
                ) : null}
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* Journey composer */}
      <Sheet
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
        title={draft?.id ? "Edit this journey" : "Plan a journey"}
        description="A run, the vehicle doing it, and who is on board."
        width="sm"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-critical">{error}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={busy === "save"}
                onClick={saveJourney}
              >
                {busy === "save" ? "Saving…" : draft?.id ? "Save changes" : "Add it"}
              </Button>
            </div>
          </div>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <FormField label="What is it for?" htmlFor="j-purpose">
              <Input
                id="j-purpose"
                value={draft.purpose}
                onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
                placeholder="Airport run — Thursday afternoon"
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Day" htmlFor="j-date">
                <Input
                  id="j-date"
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </FormField>
              <FormField label="Leaves" htmlFor="j-start">
                <Input
                  id="j-start"
                  type="time"
                  value={draft.start}
                  onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                />
              </FormField>
              <FormField label="Back by" htmlFor="j-end">
                <Input
                  id="j-end"
                  type="time"
                  value={draft.end}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="From" htmlFor="j-from">
                <Input
                  id="j-from"
                  value={draft.fromLocation}
                  onChange={(e) => setDraft({ ...draft, fromLocation: e.target.value })}
                  placeholder="Denpasar airport"
                />
              </FormField>
              <FormField label="To" htmlFor="j-to">
                <Input
                  id="j-to"
                  value={draft.toLocation}
                  onChange={(e) => setDraft({ ...draft, toLocation: e.target.value })}
                  placeholder="The hotel"
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Vehicle" htmlFor="j-vehicle">
                <Select
                  id="j-vehicle"
                  value={draft.vehicleId}
                  onChange={(e) => setDraft({ ...draft, vehicleId: e.target.value })}
                >
                  <option value="">Not decided yet</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.label} — {vehicle.capacity} seats
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="For which function" htmlFor="j-event">
                <Select
                  id="j-event"
                  value={draft.eventId}
                  onChange={(e) => setDraft({ ...draft, eventId: e.target.value })}
                >
                  <option value="">Not tied to one</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <PassengerPicker
              guests={guests}
              chosen={draft.passengerIds}
              capacity={
                draft.vehicleId ? vehicleById.get(draft.vehicleId)?.capacity ?? null : null
              }
              onChange={(passengerIds) => setDraft({ ...draft, passengerIds })}
            />

            <FormField label="Notes" htmlFor="j-notes">
              <Textarea
                id="j-notes"
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Driver's number, where to meet…"
              />
            </FormField>
          </div>
        ) : null}
      </Sheet>

      {/* Vehicle composer */}
      <Sheet
        open={vehicleDraft !== null}
        onOpenChange={(open) => !open && setVehicleDraft(null)}
        title="Add a vehicle"
        description="What you have to move people in."
        width="sm"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-critical">{error}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setVehicleDraft(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={busy === "vehicle"}
                onClick={saveVehicle}
              >
                {busy === "vehicle" ? "Saving…" : "Add it"}
              </Button>
            </div>
          </div>
        }
      >
        {vehicleDraft ? (
          <div className="space-y-4">
            <FormField label="What is it?" htmlFor="v-label">
              <Input
                id="v-label"
                value={vehicleDraft.label}
                onChange={(e) =>
                  setVehicleDraft({ ...vehicleDraft, label: e.target.value })
                }
                placeholder="Hotel coach"
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Type" htmlFor="v-type">
                <Select
                  id="v-type"
                  value={vehicleDraft.vehicleType}
                  onChange={(e) =>
                    setVehicleDraft({ ...vehicleDraft, vehicleType: e.target.value })
                  }
                >
                  {VEHICLE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Seats" htmlFor="v-capacity">
                <Input
                  id="v-capacity"
                  type="number"
                  min={1}
                  value={vehicleDraft.capacity}
                  onChange={(e) =>
                    setVehicleDraft({ ...vehicleDraft, capacity: e.target.value })
                  }
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Driver" htmlFor="v-driver">
                <Input
                  id="v-driver"
                  value={vehicleDraft.driverName}
                  onChange={(e) =>
                    setVehicleDraft({ ...vehicleDraft, driverName: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Their number" htmlFor="v-phone">
                <Input
                  id="v-phone"
                  value={vehicleDraft.driverPhone}
                  inputMode="tel"
                  onChange={(e) =>
                    setVehicleDraft({ ...vehicleDraft, driverPhone: e.target.value })
                  }
                />
              </FormField>
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

/**
 * Who is on board.
 *
 * One at a time, with the seats left counted down as you go — a multi-select
 * over two hundred names is unusable on a phone, and the number that matters
 * is how many more will fit.
 */
function PassengerPicker({
  guests,
  chosen,
  capacity,
  onChange,
}: {
  guests: { id: string; name: string }[];
  chosen: string[];
  capacity: number | null;
  onChange(ids: string[]): void;
}) {
  const nameById = React.useMemo(
    () => new Map(guests.map((guest) => [guest.id, guest.name])),
    [guests],
  );
  const available = guests.filter((guest) => !chosen.includes(guest.id));
  const over = capacity !== null && chosen.length > capacity;

  return (
    <FormField
      label="On board"
      htmlFor="j-passenger"
      hint={
        capacity === null
          ? `${chosen.length} on this run`
          : over
            ? `${chosen.length} people for ${capacity} seats — too many`
            : `${chosen.length} of ${capacity} seats taken`
      }
    >
      <Select
        id="j-passenger"
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...chosen, e.target.value]);
        }}
      >
        <option value="">Add someone…</option>
        {available.map((guest) => (
          <option key={guest.id} value={guest.id}>
            {guest.name}
          </option>
        ))}
      </Select>

      {chosen.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {chosen.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(chosen.filter((other) => other !== id))}
                className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2 py-1 text-[12px] text-ink-soft transition-colors hover:border-critical/40 hover:text-critical"
              >
                {nameById.get(id) ?? "Guest"}
                <CloseIcon size={11} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </FormField>
  );
}
