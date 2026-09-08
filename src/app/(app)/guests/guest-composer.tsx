"use client";

/**
 * Adding someone to the guest list.
 *
 * The household field takes an existing family or a new name typed in — guest
 * lists grow one relative at a time, and forcing someone to go and create the
 * household first is how half a family ends up unattached.
 *
 * Dietary needs, accessibility and whether they need a bed are on this form
 * rather than buried in an edit screen, because they're what the caterer and
 * the hotel block are sized from, and they're never easier to capture than at
 * the moment somebody is added.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlays";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/form";
import { PlusIcon } from "@/components/ui/icons";
import { createGuest } from "@/server/actions/guests";

const DIETS: [string, string][] = [
  ["NOT_SPECIFIED", "Not specified"],
  ["NON_VEGETARIAN", "Eats everything"],
  ["VEGETARIAN", "Vegetarian"],
  ["JAIN", "Jain"],
  ["VEGAN", "Vegan"],
];

export function AddGuestButton({
  households,
  className,
}: {
  households: { id: string; name: string }[];
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        className={cn("h-9 shrink-0 gap-1.5", className)}
        onClick={() => setOpen(true)}
      >
        <PlusIcon size={14} />
        Add guest
      </Button>
      <GuestComposer open={open} onOpenChange={setOpen} households={households} />
    </>
  );
}

function GuestComposer({
  open,
  onOpenChange,
  households,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  households: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [addAnother, setAddAnother] = React.useState(false);

  const [form, setForm] = React.useState({
    firstName: "",
    lastName: "",
    side: "BOTH",
    relationship: "",
    householdId: "",
    newHouseholdName: "",
    phone: "",
    email: "",
    city: "",
    country: "India",
    dietary: "NOT_SPECIFIED",
    allergies: "",
    accessibilityNeeds: "",
    notes: "",
  });
  const [flags, setFlags] = React.useState({
    isVIP: false,
    isChild: false,
    isSenior: false,
    needsAccommodation: true,
    needsTransport: false,
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function reset(keepHousehold = false) {
    setForm((f) => ({
      firstName: "",
      lastName: keepHousehold ? f.lastName : "",
      side: keepHousehold ? f.side : "BOTH",
      relationship: keepHousehold ? f.relationship : "",
      householdId: keepHousehold ? f.householdId : "",
      newHouseholdName: keepHousehold ? f.newHouseholdName : "",
      phone: "",
      email: "",
      city: keepHousehold ? f.city : "",
      country: keepHousehold ? f.country : "India",
      dietary: "NOT_SPECIFIED",
      allergies: "",
      accessibilityNeeds: "",
      notes: "",
    }));
    if (!keepHousehold) {
      setFlags({
        isVIP: false, isChild: false, isSenior: false,
        needsAccommodation: true, needsTransport: false,
      });
    }
    setError(null);
  }

  async function submit() {
    if (!form.firstName.trim()) {
      setError("A first name at least.");
      return;
    }
    setPending(true);
    setError(null);

    const result = await createGuest({
      ...form,
      ...flags,
      householdId: form.householdId || undefined,
      newHouseholdName: form.newHouseholdName || undefined,
    });

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
    // Families are added several at a time, so keep the household and stay open.
    if (addAnother) reset(true);
    else {
      reset();
      onOpenChange(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Add a guest"
      width="md"
      description="Only a name is required. The rest can wait."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox
            checked={addAnother}
            onCheckedChange={setAddAnother}
            label="Add another after this"
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Done
            </Button>
            <Button variant="primary" onClick={submit} disabled={pending}>
              {pending ? "Adding…" : "Add guest"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First name" htmlFor="g-first" required>
            <Input
              id="g-first"
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              autoFocus
            />
          </FormField>
          <FormField label="Last name" htmlFor="g-last">
            <Input
              id="g-last"
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Which household?" htmlFor="g-household">
          <Select
            id="g-household"
            value={form.householdId}
            onChange={(e) => set("householdId", e.target.value)}
          >
            <option value="">New household…</option>
            {households.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </Select>
        </FormField>

        {!form.householdId ? (
          <FormField
            label="Name the new household"
            htmlFor="g-newhousehold"
            hint="How the invitation would be addressed — “The Anands”, say."
          >
            <Input
              id="g-newhousehold"
              value={form.newHouseholdName}
              onChange={(e) => set("newHouseholdName", e.target.value)}
              placeholder={form.lastName ? `${form.lastName}` : "Family name"}
            />
          </FormField>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Whose side?" htmlFor="g-side">
            <Select id="g-side" value={form.side} onChange={(e) => set("side", e.target.value)}>
              <option value="BOTH">Both</option>
              <option value="BRIDE">Bride's</option>
              <option value="GROOM">Groom's</option>
            </Select>
          </FormField>
          <FormField label="How are they related?" htmlFor="g-rel">
            <Input
              id="g-rel"
              value={form.relationship}
              onChange={(e) => set("relationship", e.target.value)}
              placeholder="Cousin, Family friend…"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Phone" htmlFor="g-phone">
            <Input
              id="g-phone"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              inputMode="tel"
            />
          </FormField>
          <FormField label="Email" htmlFor="g-email">
            <Input
              id="g-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              inputMode="email"
            />
          </FormField>
          <FormField label="City" htmlFor="g-city">
            <Input
              id="g-city"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </FormField>
          <FormField label="Country" htmlFor="g-country">
            <Input
              id="g-country"
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Anything they can't eat?" htmlFor="g-diet">
          <Select id="g-diet" value={form.dietary} onChange={(e) => set("dietary", e.target.value)}>
            {DIETS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Allergies" htmlFor="g-allergies">
          <Input
            id="g-allergies"
            value={form.allergies}
            onChange={(e) => set("allergies", e.target.value)}
            placeholder="Nuts, shellfish…"
          />
        </FormField>

        <FormField label="Anything they'd need help with?" htmlFor="g-access">
          <Input
            id="g-access"
            value={form.accessibilityNeeds}
            onChange={(e) => set("accessibilityNeeds", e.target.value)}
            placeholder="Ground floor room, wheelchair access…"
          />
        </FormField>

        <div className="space-y-2 rounded-xl border border-line p-3">
          <Checkbox
            checked={flags.needsAccommodation}
            onCheckedChange={(v) => setFlags((f) => ({ ...f, needsAccommodation: v }))}
            label="Needs a room"
          />
          <Checkbox
            checked={flags.needsTransport}
            onCheckedChange={(v) => setFlags((f) => ({ ...f, needsTransport: v }))}
            label="Needs transport"
          />
          <Checkbox
            checked={flags.isChild}
            onCheckedChange={(v) => setFlags((f) => ({ ...f, isChild: v }))}
            label="A child"
          />
          <Checkbox
            checked={flags.isSenior}
            onCheckedChange={(v) => setFlags((f) => ({ ...f, isSenior: v }))}
            label="Elderly — may need a closer room"
          />
          <Checkbox
            checked={flags.isVIP}
            onCheckedChange={(v) => setFlags((f) => ({ ...f, isVIP: v }))}
            label="VIP"
          />
        </div>

        <FormField label="Notes" htmlFor="g-notes">
          <Textarea
            id="g-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </FormField>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
