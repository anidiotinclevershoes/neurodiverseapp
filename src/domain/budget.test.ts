import { describe, expect, it } from "vitest";
import {
  calculateBudget,
  removeCategory,
  type BudgetInput,
} from "./budget.ts";
import { parseMajorToMinor } from "./money.ts";

const eur = (major: string) => parseMajorToMinor(major);

function sample(overrides: Partial<BudgetInput> = {}): BudgetInput {
  return {
    currency: "EUR",
    incomeMinor: eur("3000"),
    accounts: [
      { id: "payday", name: "Payday", isPaydayAccount: true },
      { id: "bills-a", name: "Bills A", isPaydayAccount: false },
      { id: "bills-b", name: "Bills B", isPaydayAccount: false },
    ],
    bills: [
      { id: "rent", name: "Rent", amountMinor: eur("900"), accountId: "bills-a" },
      { id: "phone", name: "Phone", amountMinor: eur("40"), accountId: "bills-b" },
      { id: "card", name: "Card repayment", amountMinor: eur("200"), accountId: "payday" },
    ],
    categories: [
      { id: "food", name: "Food Shop", protect: false },
      { id: "savings", name: "Savings", protect: true },
    ],
    allocations: [
      { categoryId: "food", amountMinor: eur("500") },
      { categoryId: "savings", amountMinor: eur("300") },
    ],
    spend: [],
    ...overrides,
  };
}

describe("calculateBudget", () => {
  it("INV-01: plan identity holds (income = bills + allocations + unallocated)", () => {
    const result = calculateBudget(sample());
    expect(
      result.incomeMinor,
    ).toBe(result.totalBillsMinor + result.totalAllocationsMinor + result.unallocatedMinor);
    expect(result.unallocatedMinor).toBe(eur("1060"));
  });

  it("INV-02: same inputs always produce the same result", () => {
    const input = sample();
    expect(calculateBudget(input)).toEqual(calculateBudget(input));
    expect(calculateBudget(input)).toEqual(
      calculateBudget(JSON.parse(JSON.stringify(input)) as BudgetInput),
    );
  });

  it("does not double-count bills when recommending payday transfers", () => {
    const result = calculateBudget(sample());
    expect(result.paydayAccountId).toBe("payday");
    expect(result.remainInPaydayAccountMinor).toBe(eur("200"));
    expect(result.recommendedTransfers).toEqual([
      { fromAccountId: "payday", toAccountId: "bills-a", amountMinor: eur("900") },
      { fromAccountId: "payday", toAccountId: "bills-b", amountMinor: eur("40") },
    ]);
    const moved = result.recommendedTransfers.reduce((sum, t) => sum + t.amountMinor, 0);
    expect(moved + result.remainInPaydayAccountMinor).toBe(result.totalBillsMinor);
  });

  it("headline safe-to-spend excludes protected remaining but includes spend envelopes and buffer", () => {
    const result = calculateBudget(sample());
    // unallocated 1060 + food remaining 500 (savings 300 is protected leftover)
    expect(result.headlineSafeToSpendMinor).toBe(eur("1560"));
  });

  it("reduces the food envelope and headline when Food spend is recorded", () => {
    const result = calculateBudget(
      sample({
        spend: [{ id: "s1", amountMinor: eur("80"), categoryId: "food", unexpected: false }],
      }),
    );
    const food = result.categories.find((c) => c.categoryId === "food");
    expect(food?.remainingMinor).toBe(eur("420"));
    expect(result.headlineSafeToSpendMinor).toBe(eur("1480"));
  });

  it("does not silently clamp overspend; negative remaining is visible", () => {
    const result = calculateBudget(
      sample({
        spend: [{ id: "s1", amountMinor: eur("650"), categoryId: "food", unexpected: false }],
      }),
    );
    const food = result.categories.find((c) => c.categoryId === "food");
    expect(food?.remainingMinor).toBe(eur("-150"));
    expect(result.headlineSafeToSpendMinor).toBe(eur("910"));
  });

  it("treats uncategorized unexpected spend as a hit to the headline, not the plan identity", () => {
    const result = calculateBudget(
      sample({
        spend: [{ id: "s1", amountMinor: eur("100"), categoryId: null, unexpected: true }],
      }),
    );
    expect(result.incomeMinor).toBe(
      result.totalBillsMinor + result.totalAllocationsMinor + result.unallocatedMinor,
    );
    expect(result.uncategorizedSpendMinor).toBe(eur("100"));
    expect(result.headlineSafeToSpendMinor).toBe(eur("1460"));
  });

  it("protected overspend still reduces headline (savings are not a free overspend buffer)", () => {
    const result = calculateBudget(
      sample({
        spend: [{ id: "s1", amountMinor: eur("350"), categoryId: "savings", unexpected: false }],
      }),
    );
    const savings = result.categories.find((c) => c.categoryId === "savings");
    expect(savings?.remainingMinor).toBe(eur("-50"));
    expect(result.headlineSafeToSpendMinor).toBe(eur("1510"));
  });

  it("flags a plan that does not cover income without inventing money", () => {
    const result = calculateBudget(sample({ incomeMinor: eur("1000") }));
    expect(result.planDoesNotCoverIncome).toBe(true);
    expect(result.unallocatedMinor).toBe(eur("-940"));
    expect(
      result.incomeMinor,
    ).toBe(result.totalBillsMinor + result.totalAllocationsMinor + result.unallocatedMinor);
  });

  it("requires exactly one payday account and known bill/category references", () => {
    expect(() => calculateBudget(sample({ accounts: [] }))).toThrow(/Exactly one payday account/);
    expect(() =>
      calculateBudget(
        sample({
          bills: [{ id: "x", name: "X", amountMinor: 1, accountId: "missing" }],
        }),
      ),
    ).toThrow(/unknown account/);
    expect(() =>
      calculateBudget(
        sample({
          allocations: [{ categoryId: "nope", amountMinor: 1 }],
        }),
      ),
    ).toThrow(/unknown category/);
  });

  it("rejects negative bills, allocations, and spend rather than hiding them", () => {
    expect(() =>
      calculateBudget(
        sample({
          bills: [{ id: "x", name: "X", amountMinor: -1, accountId: "payday" }],
        }),
      ),
    ).toThrow(/cannot be negative/);
  });
});

describe("removeCategory", () => {
  it("returns allocation money to unallocated when the category has no spend", () => {
    const next = removeCategory(sample(), "food");
    const result = calculateBudget(next);
    expect(next.categories.map((c) => c.id)).toEqual(["savings"]);
    expect(result.totalAllocationsMinor).toBe(eur("300"));
    expect(result.unallocatedMinor).toBe(eur("1560"));
  });

  it("rejects deletion when the category has spend, unless reclassify is chosen", () => {
    const withSpend = sample({
      spend: [{ id: "s1", amountMinor: eur("10"), categoryId: "food", unexpected: false }],
    });
    expect(() => removeCategory(withSpend, "food")).toThrow(/Cannot delete a category/);
    const reclassified = removeCategory(withSpend, "food", "reclassify-spend-as-unexpected");
    expect(reclassified.spend[0]).toMatchObject({ categoryId: null, unexpected: true });
    const result = calculateBudget(reclassified);
    expect(result.uncategorizedSpendMinor).toBe(eur("10"));
  });

  it("does not invent a second month — callers pass only the month being edited", () => {
    const january = sample({ incomeMinor: eur("3000") });
    const february = sample({ incomeMinor: eur("3100") });
    const februaryWithoutFood = removeCategory(february, "food");
    expect(calculateBudget(january).incomeMinor).toBe(eur("3000"));
    expect(februaryWithoutFood.incomeMinor).toBe(eur("3100"));
    expect(january.categories).toHaveLength(2);
  });
});
