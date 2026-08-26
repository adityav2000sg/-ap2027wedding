import { describe, expect, it } from "vitest";

import { buildBudgetView, buildDrivers, computeItemForecast } from "../budget";
import { buildConverter } from "../currency";
import {
  makeBudgetItem,
  makeSnapshot,
  snapshotWithGuests,
} from "./fixtures";

const converter = (rates = [], base = "INR") => buildConverter(rates, base, new Date());

describe("forecast lifecycle precedence", () => {
  const cases = [
    { name: "contract wins over everything", patch: { contractedAmount: 500, negotiatedAmount: 400, quoteAmount: 300, estimateAmount: 200 }, expected: 500, source: "contracted" },
    { name: "negotiated wins when uncontracted", patch: { negotiatedAmount: 400, quoteAmount: 300, estimateAmount: 200 }, expected: 400, source: "negotiated" },
    { name: "quote wins over estimate", patch: { quoteAmount: 300, estimateAmount: 200 }, expected: 300, source: "quoted" },
    { name: "estimate is used when nothing is quoted", patch: { estimateAmount: 200 }, expected: 200, source: "estimated" },
    { name: "falls back to the allocation", patch: {}, expected: 100_000, source: "allocated" },
  ] as const;

  for (const testCase of cases) {
    it(testCase.name, () => {
      const snapshot = makeSnapshot();
      const item = makeBudgetItem(testCase.patch);
      const result = computeItemForecast(
        item, snapshot, buildDrivers(snapshot), converter(), [],
      );
      expect(result.forecast).toBe(testCase.expected);
      expect(result.source).toBe(testCase.source);
    });
  }

  it("a contract overrides the per-guest model", () => {
    const snapshot = snapshotWithGuests(100);
    const item = makeBudgetItem({
      costModel: "PER_GUEST",
      unitRate: 3_000,
      contractedAmount: 250_000,
    });
    const result = computeItemForecast(
      item, snapshot, buildDrivers(snapshot), converter(), [],
    );
    expect(result.forecast).toBe(250_000);
    expect(result.isVariable).toBe(false);
  });
});

describe("guest-driven forecasting", () => {
  it("scales a per-guest line with the confirmed headcount", () => {
    const snapshot = snapshotWithGuests(100);
    const item = makeBudgetItem({
      costModel: "PER_GUEST",
      guestBasis: "CONFIRMED",
      unitRate: 3_500,
    });
    const result = computeItemForecast(
      item, snapshot, buildDrivers(snapshot), converter(), [],
    );
    expect(result.forecast).toBe(350_000);
    expect(result.quantity).toBe(100);
    expect(result.isVariable).toBe(true);
  });

  it("moves the forecast when the guest count changes 300 -> 340", () => {
    const before = snapshotWithGuests(300, "CONFIRMED", {
      budgetItems: [makeBudgetItem({ costModel: "PER_GUEST", guestBasis: "CONFIRMED", unitRate: 3_500 })],
    });
    const after = snapshotWithGuests(340, "CONFIRMED", {
      budgetItems: [makeBudgetItem({ costModel: "PER_GUEST", guestBasis: "CONFIRMED", unitRate: 3_500 })],
    });

    const deltaBefore = buildBudgetView(before).finance.forecast;
    const deltaAfter = buildBudgetView(after).finance.forecast;
    expect(deltaAfter - deltaBefore).toBe(40 * 3_500);
  });

  it("counts households, not people, for a per-household line", () => {
    const snapshot = snapshotWithGuests(12);
    const item = makeBudgetItem({ costModel: "PER_HOUSEHOLD", unitRate: 750 });
    const result = computeItemForecast(
      item, snapshot, buildDrivers(snapshot), converter(), [],
    );
    expect(result.quantity).toBe(12);
    expect(result.forecast).toBe(9_000);
  });

  it("derives rooms from guests who need accommodation", () => {
    const snapshot = snapshotWithGuests(10);
    // 7 of the 10 need a bed, 2 per room -> 4 rooms.
    snapshot.guests.slice(0, 7).forEach((g) => { g.needsAccommodation = true; });

    const item = makeBudgetItem({ costModel: "PER_ROOM", unitRate: 10_000 });
    const result = computeItemForecast(
      item, snapshot, buildDrivers(snapshot), converter(), [],
    );
    expect(result.quantity).toBe(4);
    expect(result.forecast).toBe(40_000);
  });

  it("falls back to the planning estimate before any RSVPs land", () => {
    const snapshot = makeSnapshot();
    const item = makeBudgetItem({
      costModel: "PER_GUEST",
      guestBasis: "CONFIRMED_PLUS_PENDING",
      unitRate: 1_000,
      eventId: "event-shaadi",
    });
    const result = computeItemForecast(
      item, snapshot, buildDrivers(snapshot), converter(), [],
    );
    // No guests exist yet, so it uses the event's 300-guest estimate rather
    // than reporting the wedding as free.
    expect(result.quantity).toBe(300);
    expect(result.forecast).toBe(300_000);
  });
});

describe("payments and totals", () => {
  it("payments do not change the contracted total", () => {
    const snapshot = makeSnapshot({
      budgetItems: [makeBudgetItem({ contractedAmount: 500_000 })],
      payments: [
        {
          id: "p1", budgetItemId: "item-1", vendorId: null, payerId: null,
          label: "Deposit", amount: 200_000, currency: "INR", conversionRate: 1,
          dueDate: new Date(Date.UTC(2027, 0, 1)), paidDate: new Date(Date.UTC(2027, 0, 1)),
          status: "PAID", method: null, reference: null, documentId: null, notes: null,
        },
      ],
    });

    const view = buildBudgetView(snapshot);
    expect(view.finance.forecast).toBe(500_000);
    expect(view.finance.paid).toBe(200_000);
    expect(view.finance.remainingPayable).toBe(300_000);
  });

  it("reports variance against the total budget", () => {
    const snapshot = makeSnapshot({
      wedding: { ...makeSnapshot().wedding, totalBudget: 400_000 },
      budgetItems: [makeBudgetItem({ contractedAmount: 500_000, allocatedAmount: 400_000 })],
    });
    const view = buildBudgetView(snapshot);
    expect(view.finance.variance).toBe(100_000);
    expect(view.finance.isOverBudget).toBe(true);
    // Overspend eats the contingency first.
    expect(view.finance.contingencyRemaining).toBe(0);
  });
});

describe("multi-currency", () => {
  const rates = [
    { fromCurrency: "GBP", toCurrency: "INR", rate: 110, effectiveDate: new Date(Date.UTC(2026, 0, 1)) },
  ];

  it("converts a foreign line into the base currency", () => {
    const snapshot = makeSnapshot({
      rates,
      budgetItems: [makeBudgetItem({ currency: "GBP", contractedAmount: 1_000, allocatedAmount: 1_000 })],
    });
    const view = buildBudgetView(snapshot);
    expect(view.finance.forecast).toBe(110_000);
    expect(view.items[0].nativeForecast).toBe(1_000);
  });

  it("uses the most recent rate on or before the reference date", () => {
    const converter = buildConverter(
      [
        { fromCurrency: "GBP", toCurrency: "INR", rate: 100, effectiveDate: new Date(Date.UTC(2026, 0, 1)) },
        { fromCurrency: "GBP", toCurrency: "INR", rate: 120, effectiveDate: new Date(Date.UTC(2026, 6, 1)) },
        { fromCurrency: "GBP", toCurrency: "INR", rate: 999, effectiveDate: new Date(Date.UTC(2028, 0, 1)) },
      ],
      "INR",
      new Date(Date.UTC(2027, 0, 1)),
    );
    expect(converter.toBase(10, "GBP")).toBe(1_200);
  });

  it("inverts a rate when only the reverse direction is configured", () => {
    const converter = buildConverter(
      [{ fromCurrency: "INR", toCurrency: "GBP", rate: 0.01, effectiveDate: new Date(Date.UTC(2026, 0, 1)) }],
      "INR",
      new Date(Date.UTC(2027, 0, 1)),
    );
    expect(converter.toBase(1, "GBP")).toBe(100);
  });

  it("flags a currency it has no rate for instead of silently zeroing it", () => {
    const snapshot = makeSnapshot({
      budgetItems: [makeBudgetItem({ currency: "SGD", contractedAmount: 500 })],
    });
    const view = buildBudgetView(snapshot);
    expect(view.finance.missingRates).toContain("SGD");
  });
});
