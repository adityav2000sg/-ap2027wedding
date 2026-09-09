"use client";

/**
 * Adding a vendor properly.
 *
 * Quick-add takes a name and a category, which is right for capturing a
 * recommendation mid-conversation. This is the other case: you've had the call,
 * you have the quote, and you want it all down while you remember it.
 *
 * The money fields are four separate numbers rather than one, because the
 * forecast engine treats them as a precedence chain — contracted beats
 * negotiated beats quoted — and flattening them would lose the distinction
 * between "they said £8k" and "we've signed for £8k".
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlays";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { CURRENCY_CODES } from "@/lib/money";
import { VENDOR_CATEGORY_LABEL } from "@/domain/impact";
import { createVendor } from "@/server/actions/vendors";

// Kept in step with the enums the server action validates against — a label
// here that isn't a real value fails on submit rather than in the type system.
const CATEGORIES = [
  "VENUE", "CATERING", "DECOR", "PHOTOGRAPHY", "VIDEOGRAPHY", "MAKEUP", "MEHENDI",
  "DJ", "ENTERTAINMENT", "CHOREOGRAPHY", "PLANNER", "PRIEST", "INVITATIONS",
  "TRANSPORTATION", "HOTELS", "JEWELLERY", "OUTFITS", "GIFTS", "RENTALS",
  "SECURITY", "HOSPITALITY", "AV", "LIGHTING", "OTHER",
] as const;

const STATUSES: [string, string][] = [
  ["RESEARCHING", "Researching"],
  ["CONTACTED", "Contacted"],
  ["QUOTE_RECEIVED", "Quote received"],
  ["SHORTLISTED", "Shortlisted"],
  ["NEGOTIATING", "Negotiating"],
  ["SELECTED", "Selected"],
  ["CONTRACTED", "Contracted"],
  ["ACTIVE", "Working with them"],
  ["COMPLETED", "Done"],
  ["REJECTED", "Ruled out"],
];

export function VendorComposer({
  open,
  onOpenChange,
  events,
  members,
  baseCurrency,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  events: { id: string; name: string }[];
  members: { id: string; name: string }[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    businessName: "",
    category: "VENUE" as string,
    status: "RESEARCHING" as string,
    contactName: "",
    phone: "",
    email: "",
    website: "",
    city: "",
    packageInfo: "",
    notes: "",
    currency: baseCurrency,
    quoteAmount: "",
    negotiatedAmount: "",
    contractedAmount: "",
    depositAmount: "",
    ownerId: "",
  });
  const [eventIds, setEventIds] = React.useState<string[]>([]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    setForm({
      businessName: "", category: "VENUE", status: "RESEARCHING",
      contactName: "", phone: "", email: "", website: "", city: "",
      packageInfo: "", notes: "", currency: baseCurrency,
      quoteAmount: "", negotiatedAmount: "", contractedAmount: "",
      depositAmount: "", ownerId: "",
    });
    setEventIds([]);
    setError(null);
  }

  async function submit() {
    if (!form.businessName.trim()) {
      setError("Give the vendor a name.");
      return;
    }
    setPending(true);
    setError(null);

    const result = await createVendor({
      ...form,
      // Empty strings mean "not known yet", which is different from zero.
      quoteAmount: form.quoteAmount || undefined,
      negotiatedAmount: form.negotiatedAmount || undefined,
      contractedAmount: form.contractedAmount || undefined,
      depositAmount: form.depositAmount || undefined,
      ownerId: form.ownerId || undefined,
      eventIds,
    });

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    reset();
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Add a vendor"
      width="lg"
      description="Everything you have. The blanks can be filled in later."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? "Adding…" : "Add vendor"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Business name" htmlFor="v-name" required>
            <Input
              id="v-name"
              value={form.businessName}
              onChange={(e) => set("businessName", e.target.value)}
              placeholder="Conrad Bali"
              autoFocus
            />
          </FormField>

          <FormField label="What do they do?" htmlFor="v-category">
            <Select
              id="v-category"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {VENDOR_CATEGORY_LABEL[value] ?? value}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Where are they at?" htmlFor="v-status">
            <Select
              id="v-status"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {STATUSES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Who's dealing with them?" htmlFor="v-owner">
            <Select
              id="v-owner"
              value={form.ownerId}
              onChange={(e) => set("ownerId", e.target.value)}
            >
              <option value="">Nobody yet</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </FormField>
        </div>

        <Divider>Getting hold of them</Divider>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Contact name" htmlFor="v-contact">
            <Input
              id="v-contact"
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
            />
          </FormField>
          <FormField label="Phone" htmlFor="v-phone">
            <Input
              id="v-phone"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              inputMode="tel"
            />
          </FormField>
          <FormField label="Email" htmlFor="v-email">
            <Input
              id="v-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              inputMode="email"
            />
          </FormField>
          <FormField label="Website" htmlFor="v-web">
            <Input
              id="v-web"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="conradbali.com"
            />
          </FormField>
          <FormField label="City" htmlFor="v-city">
            <Input
              id="v-city"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </FormField>
        </div>

        <Divider>Money</Divider>

        <FormField label="Currency" htmlFor="v-currency">
          <Select
            id="v-currency"
            value={form.currency}
            onChange={(e) => set("currency", e.target.value)}
            className="sm:w-40"
          >
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </Select>
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Quoted" htmlFor="v-quote">
            <Input
              id="v-quote"
              value={form.quoteAmount}
              onChange={(e) => set("quoteAmount", e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </FormField>
          <FormField label="Negotiated down to" htmlFor="v-negotiated">
            <Input
              id="v-negotiated"
              value={form.negotiatedAmount}
              onChange={(e) => set("negotiatedAmount", e.target.value)}
              inputMode="decimal"
            />
          </FormField>
          <FormField label="Contracted" htmlFor="v-contracted">
            <Input
              id="v-contracted"
              value={form.contractedAmount}
              onChange={(e) => set("contractedAmount", e.target.value)}
              inputMode="decimal"
            />
          </FormField>
          <FormField label="Deposit" htmlFor="v-deposit">
            <Input
              id="v-deposit"
              value={form.depositAmount}
              onChange={(e) => set("depositAmount", e.target.value)}
              inputMode="decimal"
            />
          </FormField>
        </div>
        <p className="text-[11.5px] leading-snug text-ink-faint">
          The forecast uses the firmest figure you've given — contracted first,
          then negotiated, then quoted — so it's worth filling only what's real.
        </p>

        <Divider>Which functions?</Divider>

        <div className="flex flex-wrap gap-1.5">
          {events.map((event) => {
            const on = eventIds.includes(event.id);
            return (
              <button
                key={event.id}
                type="button"
                onClick={() =>
                  setEventIds((ids) =>
                    on ? ids.filter((i) => i !== event.id) : [...ids, event.id],
                  )
                }
                aria-pressed={on}
                className={cn(
                  "min-h-[36px] rounded-full border px-3 text-[12.5px] transition-colors",
                  on
                    ? "border-saffron/40 bg-saffron-soft text-saffron"
                    : "border-line-strong text-ink-soft hover:border-ink-faint hover:text-ink",
                )}
              >
                {event.name}
              </button>
            );
          })}
        </div>

        <FormField label="What's in the package?" htmlFor="v-package">
          <Textarea
            id="v-package"
            rows={2}
            value={form.packageInfo}
            onChange={(e) => set("packageInfo", e.target.value)}
            placeholder="What the quote actually covers."
          />
        </FormField>

        <FormField label="Notes" htmlFor="v-notes">
          <Textarea
            id="v-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Impressions, who recommended them, anything to remember."
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

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        {children}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
