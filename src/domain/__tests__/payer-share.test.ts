/**
 * Who is paying for what.
 *
 * Two families are splitting this wedding, which makes these numbers the ones
 * people will actually argue about. The rules worth pinning down are the ones
 * where a plausible-looking shortcut gives the wrong answer: what "paid" means
 * when the line belongs to one parent and the card belonged to another, and
 * what happens to a cost nobody has claimed.
 */

import { describe, expect, it } from "vitest";

import { buildBudgetView, payerPickerOptions, spendByPayer } from "../budget";
import { makeBudgetItem, makeSnapshot } from "./fixtures";
import type { PaymentNode, WeddingSnapshot } from "../types";

const PARENTS = [
  { id: "payer-namrita", name: "Namrita Chowdhry", kind: "person" },
  { id: "payer-dheeraj", name: "Dheeraj Chowdhry", kind: "person" },
  { id: "payer-ajay", name: "Ajay Mehan", kind: "person" },
];

function makePayment(overrides: Partial<PaymentNode> = {}): PaymentNode {
  return {
    id: "pay-1",
    budgetItemId: null,
    vendorId: null,
    payerId: null,
    label: "Deposit",
    amount: 0,
    currency: "INR",
    conversionRate: 1,
    dueDate: new Date(Date.UTC(2027, 0, 1)),
    paidDate: null,
    status: "PAID",
    method: null,
    reference: null,
    notes: null,
    documentId: null,
    ...overrides,
  } as PaymentNode;
}

function shares(snapshot: WeddingSnapshot) {
  return spendByPayer(buildBudgetView(snapshot), snapshot);
}

const byName = (list: ReturnType<typeof shares>, name: string) =>
  list.find((share) => share.name === name);

describe("who is paying for what", () => {
  it("adds up each parent's lines and says what they are for", () => {
    const snapshot = makeSnapshot({
      payers: PARENTS,
      budgetItems: [
        makeBudgetItem({ id: "a", name: "Photographer", payerId: "payer-dheeraj", contractedAmount: 400_000 }),
        makeBudgetItem({ id: "b", name: "Band", payerId: "payer-dheeraj", contractedAmount: 250_000 }),
        makeBudgetItem({ id: "c", name: "Flowers", payerId: "payer-ajay", contractedAmount: 100_000 }),
      ],
    });

    const dheeraj = byName(shares(snapshot), "Dheeraj Chowdhry")!;
    expect(dheeraj.carrying).toBe(650_000);
    expect(dheeraj.lineCount).toBe(2);
    // Biggest first, because that is the one worth talking about.
    expect(dheeraj.lines.map((line) => line.name)).toEqual(["Photographer", "Band"]);
    expect(byName(shares(snapshot), "Ajay Mehan")!.carrying).toBe(100_000);
  });

  it("separates what somebody has taken on from what they have handed over", () => {
    const snapshot = makeSnapshot({
      payers: PARENTS,
      budgetItems: [
        makeBudgetItem({ id: "a", payerId: "payer-dheeraj", contractedAmount: 400_000 }),
      ],
      payments: [
        makePayment({ id: "p1", budgetItemId: "a", amount: 100_000, status: "PAID" }),
        makePayment({ id: "p2", budgetItemId: "a", amount: 50_000, status: "UPCOMING" }),
      ],
    });

    const dheeraj = byName(shares(snapshot), "Dheeraj Chowdhry")!;
    expect(dheeraj.carrying).toBe(400_000);
    expect(dheeraj.paid).toBe(100_000);
    expect(dheeraj.scheduled).toBe(50_000);
    expect(dheeraj.outstanding).toBe(300_000);
  });

  it("credits the payment's own payer over whoever carries the line", () => {
    // Dheeraj is covering the photographer; Namrita settled the deposit.
    const snapshot = makeSnapshot({
      payers: PARENTS,
      budgetItems: [
        makeBudgetItem({ id: "a", payerId: "payer-dheeraj", contractedAmount: 400_000 }),
      ],
      payments: [
        makePayment({
          id: "p1",
          budgetItemId: "a",
          payerId: "payer-namrita",
          amount: 100_000,
          status: "PAID",
        }),
      ],
    });

    const list = shares(snapshot);
    // The obligation stays with Dheeraj...
    expect(byName(list, "Dheeraj Chowdhry")!.carrying).toBe(400_000);
    expect(byName(list, "Dheeraj Chowdhry")!.paid).toBe(0);
    // ...and the money is credited to the person who actually paid it.
    expect(byName(list, "Namrita Chowdhry")!.paid).toBe(100_000);
    expect(byName(list, "Namrita Chowdhry")!.carrying).toBe(0);
  });

  it("never lets paying early show as a surplus", () => {
    const snapshot = makeSnapshot({
      payers: PARENTS,
      budgetItems: [
        makeBudgetItem({ id: "a", payerId: "payer-ajay", contractedAmount: 100_000 }),
      ],
      payments: [
        makePayment({ id: "p1", budgetItemId: "a", amount: 150_000, status: "PAID" }),
      ],
    });

    expect(byName(shares(snapshot), "Ajay Mehan")!.outstanding).toBe(0);
  });

  it("gathers unclaimed costs under nobody, and sorts them last", () => {
    const snapshot = makeSnapshot({
      payers: PARENTS,
      budgetItems: [
        makeBudgetItem({ id: "a", name: "Venue", payerId: null, contractedAmount: 900_000 }),
        makeBudgetItem({ id: "b", name: "Band", payerId: "payer-ajay", contractedAmount: 100_000 }),
      ],
    });

    const list = shares(snapshot);
    const unclaimed = list.at(-1)!;
    expect(unclaimed.payerId).toBeNull();
    expect(unclaimed.name).toBe("Not yet decided");
    expect(unclaimed.carrying).toBe(900_000);
    // Last despite being much the largest — it is a prompt, not a person.
    expect(list[0].name).toBe("Ajay Mehan");
  });

  it("ignores a cancelled payment entirely", () => {
    const snapshot = makeSnapshot({
      payers: PARENTS,
      budgetItems: [
        makeBudgetItem({ id: "a", payerId: "payer-ajay", contractedAmount: 100_000 }),
      ],
      payments: [
        makePayment({ id: "p1", budgetItemId: "a", amount: 40_000, status: "CANCELLED" }),
      ],
    });

    const ajay = byName(shares(snapshot), "Ajay Mehan")!;
    expect(ajay.paid).toBe(0);
    expect(ajay.scheduled).toBe(0);
  });

  it("still names a line whose payer has since been deleted", () => {
    const snapshot = makeSnapshot({
      payers: [],
      budgetItems: [
        makeBudgetItem({ id: "a", payerId: "payer-gone", contractedAmount: 100_000 }),
      ],
    });

    const share = shares(snapshot)[0];
    // Not "Not yet decided" — somebody did decide, and the record is broken.
    expect(share.name).toBe("Someone since removed");
    expect(share.carrying).toBe(100_000);
  });

  it("gives each person their share of the whole", () => {
    const snapshot = makeSnapshot({
      payers: PARENTS,
      budgetItems: [
        makeBudgetItem({ id: "a", payerId: "payer-dheeraj", contractedAmount: 750_000 }),
        makeBudgetItem({ id: "b", payerId: "payer-ajay", contractedAmount: 250_000 }),
      ],
    });

    const list = shares(snapshot);
    expect(byName(list, "Dheeraj Chowdhry")!.sharePercent).toBe(75);
    expect(byName(list, "Ajay Mehan")!.sharePercent).toBe(25);
  });

  it("leaves out a parent who is carrying nothing", () => {
    const snapshot = makeSnapshot({
      payers: PARENTS,
      budgetItems: [
        makeBudgetItem({ id: "a", payerId: "payer-ajay", contractedAmount: 100_000 }),
      ],
    });

    expect(byName(shares(snapshot), "Namrita Chowdhry")).toBeUndefined();
  });
});

/**
 * The dropdown that lets anybody be tagged in the first place.
 *
 * This shipped broken: the list of people you could pick was built from the
 * people who already had payments against them, so with nothing assigned it was
 * empty, and nothing could ever be assigned. The screenshot that found it was a
 * dropdown whose only option was "Nobody tagged".
 */
describe("who can be picked as a payer", () => {
  const FAMILIES = [
    { id: "payer-chowdhrys", name: "Chowdhry Family", kind: "family" },
    { id: "payer-mehans", name: "Mehan Family", kind: "family" },
  ];

  it("offers the parents before anybody has been tagged at all", () => {
    const snapshot = makeSnapshot({
      payers: PARENTS,
      budgetItems: [makeBudgetItem({ id: "a", payerId: null })],
      payments: [],
    });

    expect(payerPickerOptions(snapshot).map((option) => option.name)).toEqual([
      "Namrita Chowdhry",
      "Dheeraj Chowdhry",
      "Ajay Mehan",
    ]);
  });

  it("offers them even when payments exist with nobody assigned", () => {
    // Exactly the state that produced the empty dropdown.
    const snapshot = makeSnapshot({
      payers: PARENTS,
      payments: [makePayment({ id: "p1", amount: 15_400, payerId: null, status: "PAID" })],
    });

    expect(payerPickerOptions(snapshot)).toHaveLength(3);
  });

  it("leaves out the family groups nobody is using", () => {
    const snapshot = makeSnapshot({ payers: [...PARENTS, ...FAMILIES] });

    expect(payerPickerOptions(snapshot).map((option) => option.name)).not.toContain(
      "Chowdhry Family",
    );
  });

  it("keeps a family group that something still points at", () => {
    // Otherwise the select would hold a value with no matching option and show
    // blank, which reads as "nobody" — a different fact from what was recorded.
    const snapshot = makeSnapshot({
      payers: [...PARENTS, ...FAMILIES],
      payments: [makePayment({ id: "p1", payerId: "payer-mehans", amount: 1000 })],
    });

    expect(payerPickerOptions(snapshot).map((option) => option.name)).toContain(
      "Mehan Family",
    );
  });

  it("keeps a group a budget line still points at", () => {
    const snapshot = makeSnapshot({
      payers: [...PARENTS, ...FAMILIES],
      budgetItems: [makeBudgetItem({ id: "a", payerId: "payer-chowdhrys" })],
    });

    expect(payerPickerOptions(snapshot).map((option) => option.name)).toContain(
      "Chowdhry Family",
    );
  });
});
