"use client";

/**
 * Quick add.
 *
 * Capture first, refine later. Each form asks for the minimum that makes the
 * record useful and nothing more — the detail sheets handle the rest. This is
 * the "don't force huge forms up front" rule made concrete.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { toISODate, today } from "@/lib/dates";
import { currencySymbol } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Sheet } from "@/components/ui/overlays";
import { Button } from "@/components/ui/primitives";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/form";
import {
  BriefcaseIcon,
  CheckSquareIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { createTask } from "@/server/actions/tasks";
import { createGuest } from "@/server/actions/guests";
import { createVendor } from "@/server/actions/vendors";
import { createPayment } from "@/server/actions/budget";
import type { QuickAddOptions } from "./app-shell";

type Kind = "task" | "guest" | "vendor" | "payment";

const KINDS: { key: Kind; label: string; icon: React.ComponentType<{ size?: number }>; hint: string }[] = [
  { key: "task", label: "Task", icon: CheckSquareIcon, hint: "Something that needs doing" },
  { key: "guest", label: "Guest", icon: UsersIcon, hint: "Someone on the list" },
  { key: "vendor", label: "Vendor", icon: BriefcaseIcon, hint: "Someone you're hiring" },
  { key: "payment", label: "Payment", icon: WalletIcon, hint: "Money out" },
];

export function QuickAdd({
  open,
  onOpenChange,
  options,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  options: QuickAddOptions;
}) {
  const available = KINDS.filter((kind) => {
    if (kind.key === "payment") return options.canEditBudget;
    if (kind.key === "guest") return options.canEditGuests;
    if (kind.key === "vendor") return options.canEditVendors;
    return true;
  });

  const [kind, setKind] = React.useState<Kind>(available[0]?.key ?? "task");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const value = (key: string) => (form.get(key) as string | null) ?? "";
    const checked = (key: string) => form.get(key) === "on";

    try {
      let result;
      switch (kind) {
        case "task":
          result = await createTask({
            title: value("title"),
            description: value("description"),
            priority: value("priority") || "MEDIUM",
            importance: Number(value("importance") || 3),
            dueDate: value("dueDate"),
            ownerId: value("ownerId"),
            eventId: value("eventId"),
          });
          break;
        case "guest":
          result = await createGuest({
            firstName: value("firstName"),
            lastName: value("lastName"),
            side: value("side") || "BOTH",
            householdId: value("householdId"),
            newHouseholdName: value("newHouseholdName"),
            phone: value("phone"),
            city: value("city"),
            needsAccommodation: checked("needsAccommodation"),
            needsTransport: checked("needsTransport"),
            inviteToEventIds: form.getAll("inviteToEventIds") as string[],
          });
          break;
        case "vendor":
          result = await createVendor({
            businessName: value("businessName"),
            category: value("category"),
            status: value("status") || "RESEARCHING",
            contactName: value("contactName"),
            phone: value("phone"),
            city: value("city"),
            quoteAmount: value("quoteAmount"),
            currency: options.baseCurrency,
          });
          break;
        case "payment":
          result = await createPayment({
            label: value("label"),
            amount: value("amount"),
            currency: options.baseCurrency,
            dueDate: value("dueDate"),
            status: value("status") || "UPCOMING",
            vendorId: value("vendorId"),
            payerId: value("payerId"),
          });
          break;
      }

      if (result && !result.ok) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  const todayIso = toISODate(today());

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Quick add"
      description="Capture it now — you can fill in the detail later."
      width="md"
    >
      <div className="mb-5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {available.map((option) => {
          const Icon = option.icon;
          const active = option.key === kind;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => { setKind(option.key); setError(null); }}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-150",
                active
                  ? "border-saffron/40 bg-saffron-soft"
                  : "border-line bg-surface hover:border-line-strong hover:bg-surface-sunken",
              )}
            >
              <Icon size={16} />
              <span className={cn("text-[13px] font-medium", active ? "text-saffron" : "text-ink")}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} className="space-y-4" key={kind}>
        {kind === "task" ? (
          <>
            <FormField label="What needs doing?" required htmlFor="qa-title">
              <Input id="qa-title" name="title" autoFocus placeholder="Confirm the mehendi artists" required />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Due" htmlFor="qa-due">
                <Input id="qa-due" name="dueDate" type="date" defaultValue="" />
              </FormField>
              <FormField label="Who's handling this?" htmlFor="qa-owner">
                <Select id="qa-owner" name="ownerId" defaultValue="">
                  <option value="">Nobody yet</option>
                  {options.members.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Which event?" htmlFor="qa-event">
                <Select id="qa-event" name="eventId" defaultValue="">
                  <option value="">The whole wedding</option>
                  {options.events.map((event) => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="How urgent?" htmlFor="qa-priority">
                <Select id="qa-priority" name="priority" defaultValue="MEDIUM">
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </Select>
              </FormField>
            </div>
            <FormField
              label="How much does it matter?"
              hint="Drives the readiness score. 5 means the wedding doesn't happen without it."
              htmlFor="qa-importance"
            >
              <Select id="qa-importance" name="importance" defaultValue="3">
                <option value="5">5 — Essential</option>
                <option value="4">4 — Very important</option>
                <option value="3">3 — Normal</option>
                <option value="2">2 — Nice to have</option>
                <option value="1">1 — Minor</option>
              </Select>
            </FormField>
            <FormField label="Notes" htmlFor="qa-desc">
              <Textarea id="qa-desc" name="description" placeholder="Anything worth remembering…" />
            </FormField>
          </>
        ) : null}

        {kind === "guest" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="First name" required htmlFor="qa-first">
                <Input id="qa-first" name="firstName" autoFocus required />
              </FormField>
              <FormField label="Last name" htmlFor="qa-last">
                <Input id="qa-last" name="lastName" />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Household" hint="Group families so they RSVP together." htmlFor="qa-household">
                <Select id="qa-household" name="householdId" defaultValue="">
                  <option value="">No household</option>
                  {options.households.map((household) => (
                    <option key={household.id} value={household.id}>{household.name}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Or start a new one" htmlFor="qa-newhousehold">
                <Input id="qa-newhousehold" name="newHouseholdName" placeholder="Sharma Family" />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Side" htmlFor="qa-side">
                <Select id="qa-side" name="side" defaultValue="BOTH">
                  <option value="BRIDE">Bride's</option>
                  <option value="GROOM">Groom's</option>
                  <option value="BOTH">Both</option>
                </Select>
              </FormField>
              <FormField label="Phone" htmlFor="qa-phone">
                <Input id="qa-phone" name="phone" type="tel" />
              </FormField>
              <FormField label="City" htmlFor="qa-city">
                <Input id="qa-city" name="city" />
              </FormField>
            </div>

            <fieldset>
              <legend className="mb-2 text-[12.5px] font-medium text-ink-soft">
                Invite to
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {options.events.map((event) => (
                  <label
                    key={event.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[13px] transition-colors hover:bg-surface-sunken"
                  >
                    <input
                      type="checkbox"
                      name="inviteToEventIds"
                      value={event.id}
                      className="h-3.5 w-3.5 accent-[var(--color-saffron)]"
                    />
                    {event.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2 rounded-lg border border-line bg-surface-soft px-3 py-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input type="checkbox" name="needsAccommodation" className="h-3.5 w-3.5 accent-[var(--color-saffron)]" />
                Needs a hotel room
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input type="checkbox" name="needsTransport" className="h-3.5 w-3.5 accent-[var(--color-saffron)]" />
                Needs transport
              </label>
            </div>
          </>
        ) : null}

        {kind === "vendor" ? (
          <>
            <FormField label="Business name" required htmlFor="qa-business">
              <Input id="qa-business" name="businessName" autoFocus required placeholder="Studio Kohl" />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Category" required htmlFor="qa-category">
                <Select id="qa-category" name="category" defaultValue="PHOTOGRAPHY" required>
                  {VENDOR_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Where are they up to?" htmlFor="qa-status">
                <Select id="qa-status" name="status" defaultValue="RESEARCHING">
                  <option value="RESEARCHING">Researching</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="QUOTE_RECEIVED">Quote received</option>
                  <option value="SHORTLISTED">Shortlisted</option>
                  <option value="NEGOTIATING">Negotiating</option>
                </Select>
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Contact" htmlFor="qa-contact">
                <Input id="qa-contact" name="contactName" />
              </FormField>
              <FormField label="Phone" htmlFor="qa-vphone">
                <Input id="qa-vphone" name="phone" type="tel" />
              </FormField>
              <FormField label="City" htmlFor="qa-vcity">
                <Input id="qa-vcity" name="city" />
              </FormField>
            </div>
            <FormField label={`Quote (${currencySymbol(options.baseCurrency)})`} htmlFor="qa-quote">
              <Input id="qa-quote" name="quoteAmount" type="number" min="0" step="1000" placeholder="Leave blank if you don't have one yet" />
            </FormField>
          </>
        ) : null}

        {kind === "payment" ? (
          <>
            <FormField label="What's it for?" required htmlFor="qa-label">
              <Input id="qa-label" name="label" autoFocus required placeholder="Photography deposit" />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={`Amount (${currencySymbol(options.baseCurrency)})`} required htmlFor="qa-amount">
                <Input id="qa-amount" name="amount" type="number" min="0" step="1000" required />
              </FormField>
              <FormField label="Due" required htmlFor="qa-pdue">
                <Input id="qa-pdue" name="dueDate" type="date" defaultValue={todayIso} required />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Vendor" htmlFor="qa-vendor">
                <Select id="qa-vendor" name="vendorId" defaultValue="">
                  <option value="">Not linked</option>
                  {options.vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>{vendor.businessName}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Who's paying?" htmlFor="qa-payer">
                <Select id="qa-payer" name="payerId" defaultValue="">
                  <option value="">Not decided</option>
                  {options.payers.map((payer) => (
                    <option key={payer.id} value={payer.id}>{payer.name}</option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField label="Status" htmlFor="qa-pstatus">
              <Select id="qa-pstatus" name="status" defaultValue="UPCOMING">
                <option value="UPCOMING">Upcoming</option>
                <option value="DUE">Due</option>
                <option value="PAID">Already paid</option>
              </Select>
            </FormField>
          </>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

const VENDOR_CATEGORY_OPTIONS = [
  { value: "VENUE", label: "Venue" },
  { value: "CATERING", label: "Catering" },
  { value: "DECOR", label: "Decor" },
  { value: "PHOTOGRAPHY", label: "Photography" },
  { value: "VIDEOGRAPHY", label: "Videography" },
  { value: "MAKEUP", label: "Hair & makeup" },
  { value: "MEHENDI", label: "Mehendi" },
  { value: "DJ", label: "DJ" },
  { value: "ENTERTAINMENT", label: "Entertainment" },
  { value: "CHOREOGRAPHY", label: "Choreography" },
  { value: "PLANNER", label: "Planner" },
  { value: "PRIEST", label: "Pandit" },
  { value: "INVITATIONS", label: "Invitations" },
  { value: "TRANSPORTATION", label: "Transport" },
  { value: "HOTELS", label: "Hotels" },
  { value: "JEWELLERY", label: "Jewellery" },
  { value: "OUTFITS", label: "Outfits" },
  { value: "GIFTS", label: "Gifts" },
  { value: "RENTALS", label: "Rentals" },
  { value: "SECURITY", label: "Security" },
  { value: "HOSPITALITY", label: "Hospitality" },
  { value: "AV", label: "AV" },
  { value: "LIGHTING", label: "Lighting" },
  { value: "OTHER", label: "Other" },
];
