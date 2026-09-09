"use client";

/**
 * Flights in and out.
 *
 * This was a list you could read and nothing else: arrivals came in from the
 * spreadsheet, "needs pickup" was a badge with no way to answer it, and a
 * changed flight meant editing the database. Adding, correcting and removing a
 * journey now happens here, and the pickup is assigned on the same row that
 * tells you it's needed — which is the whole point of the row.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlays";
import { Checkbox, FormField, Input, Select } from "@/components/ui/form";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { createTravel, deleteTravel, setTravelJourney, updateTravel } from "@/server/actions/logistics";

export interface TravelRow {
  id: string;
  guestId: string;
  guestName: string;
  direction: "ARRIVAL" | "DEPARTURE";
  mode: string;
  carrier: string | null;
  serviceNumber: string | null;
  hub: string | null;
  /** ISO, because it crosses the server boundary. */
  scheduledAt: string;
  pickupRequired: boolean;
  journeyId: string | null;
}

const MODES = ["FLIGHT", "TRAIN", "CAR", "BUS"] as const;
const MODE_LABEL: Record<string, string> = {
  FLIGHT: "Flight",
  TRAIN: "Train",
  CAR: "Car",
  BUS: "Bus",
};

interface Draft {
  id: string | null;
  guestId: string;
  direction: "ARRIVAL" | "DEPARTURE";
  mode: string;
  carrier: string;
  serviceNumber: string;
  hub: string;
  date: string;
  time: string;
  pickupRequired: boolean;
}

function emptyDraft(): Draft {
  return {
    id: null,
    guestId: "",
    direction: "ARRIVAL",
    mode: "FLIGHT",
    carrier: "",
    serviceNumber: "",
    hub: "",
    date: "",
    time: "",
    pickupRequired: false,
  };
}

function draftFrom(row: TravelRow): Draft {
  const when = new Date(row.scheduledAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    id: row.id,
    guestId: row.guestId,
    direction: row.direction,
    mode: row.mode,
    carrier: row.carrier ?? "",
    serviceNumber: row.serviceNumber ?? "",
    hub: row.hub ?? "",
    date: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
    time: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
  pickupRequired: row.pickupRequired,
  };
}

export function TravelBoard({
  rows,
  guests,
  journeys,
  canEdit,
}: {
  rows: TravelRow[];
  guests: { id: string; name: string }[];
  journeys: { id: string; purpose: string; date: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState<string | null>(null);

  const sorted = React.useMemo(
    () =>
      rows
        .slice()
        .sort(
          (a, b) =>
            new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
        ),
    [rows],
  );

  const needingPickup = sorted.filter((row) => row.pickupRequired && !row.journeyId);

  async function save() {
    if (!draft) return;
    if (!draft.guestId) {
      setError("Whose journey is this?");
      return;
    }
    if (!draft.date) {
      setError("Which day?");
      return;
    }

    setBusy("save");
    setError(null);
    const payload = {
      guestId: draft.guestId,
      direction: draft.direction,
      mode: draft.mode,
      carrier: draft.carrier,
      serviceNumber: draft.serviceNumber,
      hub: draft.hub,
      // A flight with no time is still a flight — midday keeps it on the right
      // day rather than refusing the whole record.
      scheduledAt: `${draft.date}T${draft.time || "12:00"}`,
      pickupRequired: draft.pickupRequired,
    };

    const result = draft.id
      ? await updateTravel({ id: draft.id, ...payload })
      : await createTravel(payload);

    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft(null);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    await deleteTravel(id);
    setBusy(null);
    setConfirmingDelete(null);
    router.refresh();
  }

  async function assignPickup(id: string, journeyId: string) {
    setBusy(id);
    await setTravelJourney(id, journeyId || null);
    setBusy(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-muted">
          {rows.length} {rows.length === 1 ? "journey" : "journeys"} logged
          {needingPickup.length > 0 ? (
            <span className="text-attention">
              {" "}
              · {needingPickup.length} still need collecting
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
            Add travel
          </Button>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="No travel details yet"
          description="Add the flights as they come in — arrivals first, since those are the ones somebody has to be at the airport for."
        />
      ) : (
        <ul>
          {sorted.map((row, index) => (
            <motion.li
              key={row.id}
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.24,
                ease: [0.22, 1, 0.36, 1],
                delay: reduce ? 0 : Math.min(index * 0.012, 0.18),
              }}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-2.5",
                busy === row.id && "opacity-50",
              )}
            >
              <span className="w-[70px] shrink-0 text-[11.5px] text-ink-muted">
                {row.direction === "ARRIVAL" ? "Arriving" : "Leaving"}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-ink">{row.guestName}</span>
                <span className="block text-[11.5px] text-ink-muted">
                  {[MODE_LABEL[row.mode] ?? row.mode, row.carrier, row.serviceNumber, row.hub]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>

              <span className="tabular shrink-0 text-[12px] text-ink-soft">
                {formatDateTime(new Date(row.scheduledAt))}
              </span>

              {row.pickupRequired ? (
                canEdit ? (
                  <Select
                    value={row.journeyId ?? ""}
                    disabled={busy === row.id}
                    onChange={(e) => assignPickup(row.id, e.target.value)}
                    className="h-8 w-auto min-w-[150px] max-w-full shrink-0 text-[12px]"
                  >
                    <option value="">Needs a pickup…</option>
                    {journeys.map((journey) => (
                      <option key={journey.id} value={journey.id}>
                        {journey.purpose}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge size="xs" variant={row.journeyId ? "positive" : "attention"}>
                    {row.journeyId ? "Pickup set" : "Needs pickup"}
                  </Badge>
                )
              ) : null}

              {canEdit ? (
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setError(null);
                      setDraft(draftFrom(row));
                    }}
                  >
                    Edit
                  </Button>
                  {confirmingDelete === row.id ? (
                    <>
                      <Button variant="danger" size="xs" onClick={() => remove(row.id)}>
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
                      aria-label={`Remove ${row.guestName}'s journey`}
                      onClick={() => setConfirmingDelete(row.id)}
                      className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-critical"
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </span>
              ) : null}
            </motion.li>
          ))}
        </ul>
      )}

      <Sheet
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
        title={draft?.id ? "Edit this journey" : "Add travel"}
        description="Flights, trains and drives, in or out."
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
                onClick={save}
              >
                {busy === "save" ? "Saving…" : draft?.id ? "Save changes" : "Add it"}
              </Button>
            </div>
          </div>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <FormField label="Who" htmlFor="t-guest">
              <Select
                id="t-guest"
                value={draft.guestId}
                // A journey belongs to the person it was created for; moving it
                // to somebody else is deleting and re-adding.
                disabled={Boolean(draft.id)}
                onChange={(e) => setDraft({ ...draft, guestId: e.target.value })}
              >
                <option value="">Choose a guest…</option>
                {guests.map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {guest.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Direction" htmlFor="t-direction">
                <Select
                  id="t-direction"
                  value={draft.direction}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      direction: e.target.value as "ARRIVAL" | "DEPARTURE",
                    })
                  }
                >
                  <option value="ARRIVAL">Arriving</option>
                  <option value="DEPARTURE">Leaving</option>
                </Select>
              </FormField>
              <FormField label="How" htmlFor="t-mode">
                <Select
                  id="t-mode"
                  value={draft.mode}
                  onChange={(e) => setDraft({ ...draft, mode: e.target.value })}
                >
                  {MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {MODE_LABEL[mode]}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Day" htmlFor="t-date">
                <Input
                  id="t-date"
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </FormField>
              <FormField label="Time" htmlFor="t-time" hint="Local time at the airport.">
                <Input
                  id="t-time"
                  type="time"
                  value={draft.time}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Airline or operator" htmlFor="t-carrier">
                <Input
                  id="t-carrier"
                  value={draft.carrier}
                  onChange={(e) => setDraft({ ...draft, carrier: e.target.value })}
                  placeholder="Singapore Airlines"
                />
              </FormField>
              <FormField label="Flight number" htmlFor="t-service">
                <Input
                  id="t-service"
                  value={draft.serviceNumber}
                  onChange={(e) => setDraft({ ...draft, serviceNumber: e.target.value })}
                  placeholder="SQ948"
                />
              </FormField>
            </div>

            <FormField label="Airport or station" htmlFor="t-hub">
              <Input
                id="t-hub"
                value={draft.hub}
                onChange={(e) => setDraft({ ...draft, hub: e.target.value })}
                placeholder="Denpasar (DPS)"
              />
            </FormField>

            <Checkbox
              checked={draft.pickupRequired}
              onCheckedChange={(value) =>
                setDraft({ ...draft, pickupRequired: Boolean(value) })
              }
              label="Somebody needs to collect them"
              description="Puts them on the pickup list, ready to go on a transport run."
            />
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
