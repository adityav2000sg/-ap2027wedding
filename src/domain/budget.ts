/**
 * Forecast engine.
 *
 * One rule governs every rupee on every screen:
 *
 *   contracted → negotiated → quoted → modelled → estimated → allocated
 *
 * The first stage that has a number wins, because that is the most committed
 * figure we know. When nothing is committed yet, the *model* takes over — and
 * that is what makes the wedding react: a PER_GUEST line multiplies live
 * headcount by the rate, so moving 300 → 340 guests moves the forecast without
 * anyone editing a budget.
 *
 * Every result carries `source` and `explanation` so the UI can always answer
 * "where did this number come from?" instead of asking users to trust it.
 */

import { formatMoney, round2, safeRatio } from "@/lib/money";
import type { Converter } from "./currency";
import { buildConverter } from "./currency";
import {
  computeAllEventGuestCounts,
  computeGuestCounts,
  headcountFor,
  householdCountFor,
  roomsRequired,
  type EventGuestCounts,
  type GuestCounts,
} from "./guests";
import type {
  BudgetItemNode,
  ForecastSource,
  PaymentNode,
  WeddingSnapshot,
} from "./types";

export interface ItemForecast {
  itemId: string;
  name: string;
  categoryId: string;
  eventId: string | null;
  vendorId: string | null;
  /// Who is bearing this line, if anyone has said.
  payerId: string | null;
  currency: string;
  /** In the item's own currency, before conversion. */
  nativeForecast: number;
  /** All figures below are in the wedding's base currency. */
  allocated: number;
  forecast: number;
  variance: number;
  variancePercent: number;
  source: ForecastSource;
  /** Driver quantity for PER_* models: 340 guests, 62 rooms, 8 buses. */
  quantity: number | null;
  unitRate: number | null;
  /** Plain-language derivation shown on hover. */
  explanation: string;
  paid: number;
  scheduled: number;
  remainingPayable: number;
  committed: number;
  /** True when the forecast will move if guests/rooms/households change. */
  isVariable: boolean;
}

export interface CategoryForecast {
  categoryId: string;
  name: string;
  parentId: string | null;
  accentTone: string;
  allocated: number;
  forecast: number;
  variance: number;
  variancePercent: number;
  paid: number;
  committed: number;
  remainingPayable: number;
  itemCount: number;
  items: ItemForecast[];
}

export interface WeddingFinance {
  baseCurrency: string;
  totalBudget: number;
  /** Sum of every line's allocation — may differ from totalBudget. */
  allocated: number;
  unallocated: number;
  forecast: number;
  committed: number;
  paid: number;
  /** Forecast we still have to hand over. */
  remainingPayable: number;
  /** Budget left before we exceed the ceiling. Negative = over. */
  availableBudget: number;
  variance: number;
  variancePercent: number;
  contingencyTotal: number;
  contingencyRemaining: number;
  isOverBudget: boolean;
  scheduledUnpaid: number;
  overdueAmount: number;
  missingRates: string[];
}

export interface BudgetView {
  finance: WeddingFinance;
  categories: CategoryForecast[];
  items: ItemForecast[];
  itemsById: Map<string, ItemForecast>;
  byEvent: Map<string, { forecast: number; allocated: number; paid: number; committed: number }>;
  byVendor: Map<string, { forecast: number; paid: number; committed: number }>;
  converter: Converter;
  drivers: ForecastDrivers;
}

/** The live inputs every variable line reads from. */
export interface ForecastDrivers {
  guestCounts: GuestCounts;
  eventCounts: Map<string, EventGuestCounts>;
  rooms: number;
  households: number;
}

export function buildDrivers(snapshot: WeddingSnapshot): ForecastDrivers {
  return {
    guestCounts: computeGuestCounts(snapshot),
    eventCounts: computeAllEventGuestCounts(snapshot),
    rooms: roomsRequired(snapshot),
    households: snapshot.households.length,
  };
}

const BASIS_LABEL: Record<string, string> = {
  ESTIMATED: "estimated guests",
  INVITED: "invited guests",
  CONFIRMED: "confirmed guests",
  CONFIRMED_PLUS_PENDING: "confirmed & awaiting guests",
};

/**
 * Resolve a single budget line. Pure: given the same item and drivers it always
 * returns the same answer, which is what makes the impact engine trustworthy.
 */
export function computeItemForecast(
  item: BudgetItemNode,
  snapshot: WeddingSnapshot,
  drivers: ForecastDrivers,
  converter: Converter,
  payments: PaymentNode[],
): ItemForecast {
  const modelled = computeModelledAmount(item, snapshot, drivers);

  let nativeForecast: number;
  let source: ForecastSource;

  if (item.contractedAmount !== null) {
    nativeForecast = item.contractedAmount;
    source = "contracted";
  } else if (item.negotiatedAmount !== null) {
    nativeForecast = item.negotiatedAmount;
    source = "negotiated";
  } else if (item.quoteAmount !== null) {
    nativeForecast = item.quoteAmount;
    source = "quoted";
  } else if (modelled.amount !== null) {
    nativeForecast = modelled.amount;
    source = "modelled";
  } else if (item.estimateAmount !== null) {
    nativeForecast = item.estimateAmount;
    source = "estimated";
  } else {
    nativeForecast = item.allocatedAmount;
    source = "allocated";
  }

  const forecast = converter.toBase(nativeForecast, item.currency);
  const allocated = converter.toBase(item.allocatedAmount, item.currency);

  const itemPayments = payments.filter((p) => p.budgetItemId === item.id);
  const paid = sumPayments(itemPayments.filter((p) => p.status === "PAID"), converter);
  const scheduled = sumPayments(
    itemPayments.filter((p) => p.status !== "CANCELLED"),
    converter,
  );

  const committed =
    item.contractedAmount !== null
      ? converter.toBase(item.contractedAmount, item.currency)
      : 0;

  const variance = round2(forecast - allocated);

  return {
    itemId: item.id,
    name: item.name,
    categoryId: item.categoryId,
    eventId: item.eventId,
    vendorId: item.vendorId,
    payerId: item.payerId,
    currency: item.currency,
    nativeForecast: round2(nativeForecast),
    allocated,
    forecast,
    variance,
    variancePercent: round2(safeRatio(variance, allocated) * 100),
    source,
    quantity: modelled.quantity,
    unitRate: item.unitRate,
    explanation: buildExplanation(item, source, modelled, nativeForecast, converter),
    paid,
    scheduled,
    remainingPayable: round2(Math.max(0, forecast - paid)),
    committed,
    isVariable: source === "modelled" && item.costModel !== "FIXED",
  };
}

interface ModelledAmount {
  amount: number | null;
  quantity: number | null;
  label: string | null;
}

function computeModelledAmount(
  item: BudgetItemNode,
  snapshot: WeddingSnapshot,
  drivers: ForecastDrivers,
): ModelledAmount {
  switch (item.costModel) {
    case "PER_GUEST": {
      if (item.unitRate === null) return { amount: null, quantity: null, label: null };
      const quantity = headcountFor(
        snapshot,
        item.guestBasis,
        item.eventId,
        drivers.eventCounts,
        drivers.guestCounts,
      );
      return {
        amount: round2(item.unitRate * quantity),
        quantity,
        label: BASIS_LABEL[item.guestBasis] ?? "guests",
      };
    }
    case "PER_HOUSEHOLD": {
      if (item.unitRate === null) return { amount: null, quantity: null, label: null };
      const quantity = householdCountFor(snapshot, item.eventId, drivers.eventCounts);
      return { amount: round2(item.unitRate * quantity), quantity, label: "households" };
    }
    case "PER_ROOM": {
      if (item.unitRate === null) return { amount: null, quantity: null, label: null };
      const quantity = drivers.rooms;
      return { amount: round2(item.unitRate * quantity), quantity, label: "rooms" };
    }
    case "PER_UNIT": {
      if (item.unitRate === null || item.unitQuantity === null) {
        return { amount: null, quantity: null, label: null };
      }
      return {
        amount: round2(item.unitRate * item.unitQuantity),
        quantity: item.unitQuantity,
        label: "units",
      };
    }
    case "FIXED":
    default:
      return item.fixedAmount !== null
        ? { amount: item.fixedAmount, quantity: null, label: null }
        : { amount: null, quantity: null, label: null };
  }
}

/**
 * The derivation, written in the currency the reader has chosen.
 *
 * The native figure is never lost — the UI prints it underneath whenever it
 * differs — but the *explanation* has to agree with the total it explains, or a
 * £173,704 line ends up justified by a $1,750 rate.
 */
function buildExplanation(
  item: BudgetItemNode,
  source: ForecastSource,
  modelled: ModelledAmount,
  amount: number,
  converter: Converter,
): string {
  const money = (n: number) =>
    formatMoney(converter.toBase(n, item.currency), converter.base);
  switch (source) {
    case "contracted":
      return `Contracted at ${money(amount)}`;
    case "negotiated":
      return `Negotiated down to ${money(amount)}`;
    case "quoted":
      return `Latest quote of ${money(amount)}`;
    case "modelled":
      if (modelled.quantity !== null && item.unitRate !== null) {
        return `${modelled.quantity.toLocaleString("en-IN")} ${modelled.label} × ${money(item.unitRate)}`;
      }
      return `Fixed cost of ${money(amount)}`;
    case "estimated":
      return `Early estimate of ${money(amount)}`;
    default:
      return `No estimate yet — showing the ${money(amount)} allocation`;
  }
}

function sumPayments(payments: PaymentNode[], converter: Converter): number {
  return round2(
    payments.reduce((sum, p) => sum + converter.toBase(p.amount, p.currency), 0),
  );
}

/**
 * The whole financial picture, computed in one pass.
 *
 * `displayCurrency` lets each person read the wedding in their own currency —
 * the Mehans in SGD, the Chowdhrys in GBP — without changing a single stored
 * amount. Every figure below is converted into it; originals are untouched.
 */
export function buildBudgetView(
  snapshot: WeddingSnapshot,
  displayCurrency?: string,
): BudgetView {
  const target = displayCurrency || snapshot.wedding.baseCurrency;
  const converter = buildConverter(snapshot.rates, target, snapshot.today);
  const drivers = buildDrivers(snapshot);

  const items = snapshot.budgetItems.map((item) =>
    computeItemForecast(item, snapshot, drivers, converter, snapshot.payments),
  );
  const itemsById = new Map(items.map((i) => [i.itemId, i]));

  const categories: CategoryForecast[] = snapshot.categories.map((category) => {
    const categoryItems = items.filter((i) => i.categoryId === category.id);
    const allocatedFromItems = sum(categoryItems.map((i) => i.allocated));
    // A category can carry its own allocation for lines nobody has itemised yet.
    const allocated = round2(Math.max(category.allocatedAmount, allocatedFromItems));
    const forecast = sum(categoryItems.map((i) => i.forecast));
    const variance = round2(forecast - allocated);

    return {
      categoryId: category.id,
      name: category.name,
      parentId: category.parentId,
      accentTone: category.accentTone,
      allocated,
      forecast,
      variance,
      variancePercent: round2(safeRatio(variance, allocated) * 100),
      paid: sum(categoryItems.map((i) => i.paid)),
      committed: sum(categoryItems.map((i) => i.committed)),
      remainingPayable: sum(categoryItems.map((i) => i.remainingPayable)),
      itemCount: categoryItems.length,
      items: categoryItems,
    };
  });

  const allocated = sum(categories.map((c) => c.allocated));
  const forecast = sum(categories.map((c) => c.forecast));
  const paid = sum(
    snapshot.payments
      .filter((p) => p.status === "PAID")
      .map((p) => converter.toBase(p.amount, p.currency)),
  );
  const committed = sum(categories.map((c) => c.committed));
  const scheduledUnpaid = sum(
    snapshot.payments
      .filter((p) => p.status !== "PAID" && p.status !== "CANCELLED")
      .map((p) => converter.toBase(p.amount, p.currency)),
  );
  const overdueAmount = sum(
    snapshot.payments
      .filter((p) => p.status !== "PAID" && p.status !== "CANCELLED")
      .filter((p) => new Date(p.dueDate) < snapshot.today)
      .map((p) => converter.toBase(p.amount, p.currency)),
  );

  const totalBudget = converter.toBase(
    snapshot.wedding.totalBudget,
    snapshot.wedding.baseCurrency,
  );
  const variance = round2(forecast - totalBudget);
  const contingencyTotal = round2((totalBudget * snapshot.wedding.contingencyPct) / 100);

  const finance: WeddingFinance = {
    baseCurrency: target,
    totalBudget,
    allocated,
    unallocated: round2(totalBudget - allocated),
    forecast,
    committed,
    paid,
    remainingPayable: round2(Math.max(0, forecast - paid)),
    availableBudget: round2(totalBudget - forecast),
    variance,
    variancePercent: round2(safeRatio(variance, totalBudget) * 100),
    contingencyTotal,
    // Overspend eats the contingency first — that's what it's for.
    contingencyRemaining: round2(Math.max(0, contingencyTotal - Math.max(0, variance))),
    isOverBudget: variance > 0,
    scheduledUnpaid,
    overdueAmount,
    missingRates: converter.missing,
  };

  const byEvent = new Map<
    string,
    { forecast: number; allocated: number; paid: number; committed: number }
  >();
  for (const item of items) {
    if (!item.eventId) continue;
    const existing = byEvent.get(item.eventId) ?? {
      forecast: 0, allocated: 0, paid: 0, committed: 0,
    };
    byEvent.set(item.eventId, {
      forecast: round2(existing.forecast + item.forecast),
      allocated: round2(existing.allocated + item.allocated),
      paid: round2(existing.paid + item.paid),
      committed: round2(existing.committed + item.committed),
    });
  }

  const byVendor = new Map<string, { forecast: number; paid: number; committed: number }>();
  for (const item of items) {
    if (!item.vendorId) continue;
    const existing = byVendor.get(item.vendorId) ?? { forecast: 0, paid: 0, committed: 0 };
    byVendor.set(item.vendorId, {
      forecast: round2(existing.forecast + item.forecast),
      paid: round2(existing.paid + item.paid),
      committed: round2(existing.committed + item.committed),
    });
  }
  // Payments booked straight against a vendor still count towards what they've been paid.
  for (const payment of snapshot.payments) {
    if (!payment.vendorId || payment.budgetItemId) continue;
    if (payment.status !== "PAID") continue;
    const existing = byVendor.get(payment.vendorId) ?? { forecast: 0, paid: 0, committed: 0 };
    byVendor.set(payment.vendorId, {
      ...existing,
      paid: round2(existing.paid + converter.toBase(payment.amount, payment.currency)),
    });
  }

  return { finance, categories, items, itemsById, byEvent, byVendor, converter, drivers };
}

/** Who has actually paid for this wedding, and how much. */
export function paymentsByPayer(
  snapshot: WeddingSnapshot,
  converter: Converter,
): { payerId: string | null; name: string; paid: number; upcoming: number }[] {
  const payerById = new Map(snapshot.payers.map((p) => [p.id, p]));
  const totals = new Map<string, { name: string; paid: number; upcoming: number }>();

  for (const payment of snapshot.payments) {
    if (payment.status === "CANCELLED") continue;
    const key = payment.payerId ?? "unassigned";
    const name = payment.payerId
      ? payerById.get(payment.payerId)?.name ?? "Unknown"
      : "Not yet assigned";
    const entry = totals.get(key) ?? { name, paid: 0, upcoming: 0 };
    const amount = converter.toBase(payment.amount, payment.currency);
    if (payment.status === "PAID") entry.paid = round2(entry.paid + amount);
    else entry.upcoming = round2(entry.upcoming + amount);
    totals.set(key, entry);
  }

  return [...totals.entries()]
    .map(([payerId, value]) => ({
      payerId: payerId === "unassigned" ? null : payerId,
      ...value,
    }))
    .sort((a, b) => b.paid - a.paid);
}

/** Categories most over allocation — the "where do we cut?" list. */
export function worstVariances(view: BudgetView, limit = 5): CategoryForecast[] {
  return [...view.categories]
    .filter((c) => c.variance > 0)
    .sort((a, b) => b.variance - a.variance)
    .slice(0, limit);
}

function sum(values: number[]): number {
  return round2(values.reduce((total, value) => total + value, 0));
}

// ──────────────────────────────────────────────────────── Who is paying what

/**
 * Who can be picked as a payer.
 *
 * Read from the payers table, which sounds too obvious to need saying — but
 * this was previously derived from the payers who already *had* payments, and
 * that cannot work. With nothing yet assigned the list came back empty, so the
 * dropdown offered nobody, so nothing could ever be assigned. The first tag was
 * unreachable, on the payment row and on the new-payment form alike.
 *
 * The people are the answer to "who's paying" — the parents footing the bills.
 * A group payer is offered only when something already points at it, so an
 * existing assignment keeps its label instead of rendering as a blank option.
 */
export function payerPickerOptions(
  snapshot: WeddingSnapshot,
): { id: string; name: string }[] {
  const inUse = new Set(
    [
      ...snapshot.payments.map((payment) => payment.payerId),
      ...snapshot.budgetItems.map((item) => item.payerId),
    ].filter((id): id is string => Boolean(id)),
  );

  return snapshot.payers
    .filter((payer) => payer.kind === "person" || inUse.has(payer.id))
    .map((payer) => ({ id: payer.id, name: payer.name }));
}

/** One person's share of the wedding, and what it is made of. */
export interface PayerShare {
  payerId: string | null;
  name: string;
  /** "person" | "family" | "other" — null when nobody has been named. */
  kind: string | null;
  /**
   * What they have taken on: every budget line tagged to them, at its current
   * forecast. This is the number somebody means when they ask what they are in
   * for, and it exists long before any money moves.
   */
  carrying: number;
  /** Of that, actually handed over. */
  paid: number;
  /** Scheduled, but not yet paid. */
  scheduled: number;
  /** Still to find. Never negative: paying early doesn't create a surplus. */
  outstanding: number;
  /** How many lines they are carrying. */
  lineCount: number;
  /** What it goes on, biggest first — the "and for what" of the question. */
  lines: {
    itemId: string;
    name: string;
    categoryName: string;
    forecast: number;
    paid: number;
  }[];
  /** Their share of everything anybody is carrying, as a percentage. */
  sharePercent: number;
}

/**
 * Who is paying how much, and for what.
 *
 * Two numbers, because two different questions get asked and running them
 * together starts arguments. *Carrying* comes from the budget line: what
 * somebody has agreed to cover, knowable a year out. *Paid* comes from the
 * payments, which is money that has actually left an account.
 *
 * Paid is attributed to the payment's own payer where one is set, and falls
 * back to whoever is carrying the line. That distinction is not pedantry: when
 * a cost Dheeraj is covering is settled on Namrita's card because she was the
 * one standing at the counter, both things are true, and the screen should say
 * so rather than quietly picking one of them.
 *
 * Unclaimed lines come back too, under a null payer and sorted last. An
 * unclaimed cost is a conversation nobody has had yet, which makes it the most
 * useful row on the screen — but it is a prompt, not a person.
 */
export function spendByPayer(view: BudgetView, snapshot: WeddingSnapshot): PayerShare[] {
  const { converter } = view;
  const payerById = new Map(snapshot.payers.map((payer) => [payer.id, payer]));
  const categoryName = new Map(
    snapshot.categories.map((category) => [category.id, category.name]),
  );

  const UNCLAIMED = " unclaimed";
  const shares = new Map<string, PayerShare>();

  const shareFor = (payerId: string | null): PayerShare => {
    const key = payerId ?? UNCLAIMED;
    const existing = shares.get(key);
    if (existing) return existing;
    const payer = payerId ? payerById.get(payerId) : undefined;
    const fresh: PayerShare = {
      payerId,
      // A payer can be deleted while lines still point at them. Saying so is
      // better than a blank, which reads as "nobody" and is a different fact.
      name: payerId ? (payer?.name ?? "Someone since removed") : "Not yet decided",
      kind: payer?.kind ?? null,
      carrying: 0,
      paid: 0,
      scheduled: 0,
      outstanding: 0,
      lineCount: 0,
      lines: [],
      sharePercent: 0,
    };
    shares.set(key, fresh);
    return fresh;
  };

  // What each person has taken on, from the budget lines.
  for (const item of view.items) {
    const share = shareFor(item.payerId);
    share.carrying = round2(share.carrying + item.forecast);
    share.lineCount += 1;
    share.lines.push({
      itemId: item.itemId,
      name: item.name,
      categoryName: categoryName.get(item.categoryId) ?? "Uncategorised",
      forecast: item.forecast,
      paid: item.paid,
    });
  }

  // What each person has actually paid, from the payments themselves.
  const lineOwner = new Map(view.items.map((item) => [item.itemId, item.payerId]));
  for (const payment of snapshot.payments) {
    if (payment.status === "CANCELLED") continue;
    const attributed =
      payment.payerId ??
      (payment.budgetItemId ? (lineOwner.get(payment.budgetItemId) ?? null) : null);
    const share = shareFor(attributed);
    const amount = converter.toBase(payment.amount, payment.currency);
    if (payment.status === "PAID") share.paid = round2(share.paid + amount);
    else share.scheduled = round2(share.scheduled + amount);
  }

  const everything = round2(
    [...shares.values()].reduce((total, share) => total + share.carrying, 0),
  );

  return [...shares.values()]
    .map((share) => ({
      ...share,
      outstanding: round2(Math.max(0, share.carrying - share.paid)),
      sharePercent: round2(safeRatio(share.carrying, everything) * 100),
      lines: [...share.lines].sort((a, b) => b.forecast - a.forecast),
    }))
    .filter((share) => share.lineCount > 0 || share.paid > 0 || share.scheduled > 0)
    .sort((a, b) => {
      if (a.payerId === null) return 1;
      if (b.payerId === null) return -1;
      // Whichever of the two numbers is bigger for that person, because both
      // eras of this wedding need to sort sensibly: today almost nothing is
      // assigned and real payments are the only fact, and later the assignments
      // will dwarf what has actually been handed over. Sorting on `carrying`
      // alone put the one person who had actually paid for something at the
      // bottom of the list, under a heading that said "who's paying".
      return Math.max(b.carrying, b.paid) - Math.max(a.carrying, a.paid);
    });
}
