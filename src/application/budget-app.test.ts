import { describe, expect, it } from "vitest";
import {
  AppError,
  createBudgetApp,
  persistedToBudgetInput,
  toMonthView,
  type Actor,
  type BudgetStore,
  type PersistedMonth,
} from "./budget-app.ts";
import { calculateBudget } from "../domain/budget.ts";
import { parseMajorToMinor } from "../domain/money.ts";

const eur = (major: string) => parseMajorToMinor(major);
const year = 2026;
const month = 8;

function memoryStore(): BudgetStore & {
  failNextUpdate: boolean;
  emails: Map<string, string>;
  months: Map<string, PersistedMonth>;
} {
  const members = new Map<string, Set<string>>();
  const months = new Map<string, PersistedMonth>();
  const emails = new Map<string, string>();
  const store: BudgetStore & {
    failNextUpdate: boolean;
    emails: Map<string, string>;
    months: Map<string, PersistedMonth>;
  } = {
    failNextUpdate: false,
    emails,
    months,
    async insertHousehold(row) {
      members.set(row.id, new Set());
    },
    async insertMember(householdId, userId) {
      members.get(householdId)?.add(userId);
    },
    async findUserIdByEmail(email) {
      return emails.get(email) ?? null;
    },
    async isMember(householdId, userId) {
      return members.get(householdId)?.has(userId) ?? false;
    },
    async householdIdForUser(userId) {
      for (const [householdId, set] of members) {
        if (set.has(userId)) {
          return householdId;
        }
      }
      return null;
    },
    async loadMonth(householdId, y, m) {
      for (const row of months.values()) {
        if (row.householdId === householdId && row.year === y && row.month === m) {
          return { ...row };
        }
      }
      return null;
    },
    async insertMonth(row) {
      months.set(row.monthId, { ...row });
    },
    async updateMonth(monthId, expectedRevision, patch) {
      if (store.failNextUpdate) {
        store.failNextUpdate = false;
        throw new Error("disk failed");
      }
      const current = months.get(monthId);
      if (!current || current.revision !== expectedRevision) {
        return null;
      }
      const next: PersistedMonth = {
        ...current,
        ...patch,
        revision: current.revision + 1,
      };
      months.set(monthId, next);
      return { ...next };
    },
  };
  return store;
}

function sequentialIds(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

describe("budget application", () => {
  it("persists income and allocation and reloads identical authoritative inputs", async () => {
    const store = memoryStore();
    const app = createBudgetApp(store, sequentialIds());
    const alice: Actor = { userId: "alice" };

    const created = await app.createHousehold(alice, { currency: "EUR", year, month });
    expect(created.incomeMinor).toBe(0);
    expect(created.allocationMinor).toBe(0);
    expect(created.revision).toBe(1);

    const saved = await app.saveMonth(alice, {
      year,
      month,
      expectedRevision: 1,
      incomeMinor: eur("3000"),
      allocationMinor: eur("500"),
      categoryName: "Food Shop",
    });

    const reloaded = await app.getMonth(alice, year, month);
    expect(reloaded.incomeMinor).toBe(saved.incomeMinor);
    expect(reloaded.allocationMinor).toBe(saved.allocationMinor);
    expect(reloaded.categoryName).toBe("Food Shop");
    expect(reloaded.revision).toBe(saved.revision);
    expect(reloaded.unallocatedMinor).toBe(eur("2500"));
    expect(reloaded.remainingMinor).toBe(eur("500"));
  });

  it("derives remaining only from calculateBudget, not a second formula", async () => {
    const store = memoryStore();
    const app = createBudgetApp(store, sequentialIds());
    const alice: Actor = { userId: "alice" };
    await app.createHousehold(alice, { currency: "EUR", year, month });
    await app.setIncome(alice, { year, month, expectedRevision: 1, amountMinor: eur("3000") });
    const view = await app.setAllocation(alice, {
      year,
      month,
      expectedRevision: 2,
      amountMinor: eur("500"),
    });
    const row = [...store.months.values()][0];
    if (!row) {
      throw new Error("expected month");
    }
    const engine = calculateBudget(persistedToBudgetInput(row));
    expect(view.unallocatedMinor).toBe(engine.unallocatedMinor);
    expect(view.headlineSafeToSpendMinor).toBe(engine.headlineSafeToSpendMinor);
    expect(toMonthView(row).unallocatedMinor).toBe(engine.unallocatedMinor);
  });

  it("lets a second member refresh the same figures", async () => {
    const store = memoryStore();
    store.emails.set("bob@example.com", "bob");
    const app = createBudgetApp(store, sequentialIds());
    const alice: Actor = { userId: "alice" };
    const bob: Actor = { userId: "bob" };
    const created = await app.createHousehold(alice, { currency: "EUR", year, month });
    await app.addMember(alice, created.householdId, "bob@example.com");
    await app.setIncome(alice, { year, month, expectedRevision: 1, amountMinor: eur("3000") });
    await app.setAllocation(alice, { year, month, expectedRevision: 2, amountMinor: eur("650") });

    const fromBob = await app.getMonth(bob, year, month);
    const fromAlice = await app.getMonth(alice, year, month);
    expect(fromBob).toEqual(fromAlice);
    expect(fromBob.allocationMinor).toBe(eur("650"));
  });

  it("does not let another household see or change this budget", async () => {
    const store = memoryStore();
    const app = createBudgetApp(store, sequentialIds());
    await app.createHousehold({ userId: "alice" }, { currency: "EUR", year, month });
    await app.createHousehold({ userId: "carol" }, { currency: "GBP", year, month });
    const aliceView = await app.getMonth({ userId: "alice" }, year, month);
    const carolView = await app.getMonth({ userId: "carol" }, year, month);
    expect(carolView.householdId).not.toBe(aliceView.householdId);
    expect(carolView.currency).toBe("GBP");
    await app.setIncome({ userId: "alice" }, {
      year,
      month,
      expectedRevision: 1,
      amountMinor: eur("3000"),
    });
    const carolAfter = await app.getMonth({ userId: "carol" }, year, month);
    expect(carolAfter.incomeMinor).toBe(0);
  });

  it("rejects a stale save and preserves the newer state", async () => {
    const store = memoryStore();
    const app = createBudgetApp(store, sequentialIds());
    const alice: Actor = { userId: "alice" };
    const bob: Actor = { userId: "bob" };
    store.emails.set("bob@example.com", "bob");
    const created = await app.createHousehold(alice, { currency: "EUR", year, month });
    await app.addMember(alice, created.householdId, "bob@example.com");

    const fromAlice = await app.getMonth(alice, year, month);
    await app.setIncome(bob, {
      year,
      month,
      expectedRevision: fromAlice.revision,
      amountMinor: eur("2000"),
    });

    const stale = await app.setIncome(alice, {
      year,
      month,
      expectedRevision: fromAlice.revision,
      amountMinor: eur("9999"),
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(stale).toBeInstanceOf(AppError);
    expect((stale as AppError).code).toBe("CONFLICT");

    const latest = await app.getMonth(alice, year, month);
    expect(latest.incomeMinor).toBe(eur("2000"));
    expect(latest.incomeMinor).not.toBe(eur("9999"));
  });

  it("does not treat a failed save as success; retry is possible", async () => {
    const store = memoryStore();
    const app = createBudgetApp(store, sequentialIds());
    const alice: Actor = { userId: "alice" };
    await app.createHousehold(alice, { currency: "EUR", year, month });
    store.failNextUpdate = true;
    const failed = await app
      .setIncome(alice, { year, month, expectedRevision: 1, amountMinor: eur("100") })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failed).toBeInstanceOf(AppError);
    expect((failed as AppError).code).toBe("UNAVAILABLE");

    const stillZero = await app.getMonth(alice, year, month);
    expect(stillZero.incomeMinor).toBe(0);
    expect(stillZero.revision).toBe(1);

    const saved = await app.setIncome(alice, {
      year,
      month,
      expectedRevision: 1,
      amountMinor: eur("100"),
    });
    expect(saved.incomeMinor).toBe(eur("100"));
  });

  it("canonical journey: Food €500 → €650 earmarks leftover; both members match", async () => {
    const store = memoryStore();
    store.emails.set("bob@example.com", "bob");
    const app = createBudgetApp(store, sequentialIds());
    const alice: Actor = { userId: "alice" };
    const bob: Actor = { userId: "bob" };
    const household = await app.createHousehold(alice, { currency: "EUR", year, month });
    await app.addMember(alice, household.householdId, "bob@example.com");
    await app.setIncome(alice, { year, month, expectedRevision: 1, amountMinor: eur("3000") });
    const at500 = await app.setAllocation(alice, {
      year,
      month,
      expectedRevision: 2,
      amountMinor: eur("500"),
      categoryName: "Food Shop",
    });
    const at650 = await app.setAllocation(alice, {
      year,
      month,
      expectedRevision: at500.revision,
      amountMinor: eur("650"),
    });
    expect(at650.allocationMinor).toBe(eur("650"));
    expect(at650.unallocatedMinor).toBe(eur("2350"));
    expect(at650.remainingMinor).toBe(eur("650"));
    expect(at650.headlineSafeToSpendMinor).toBe(at500.headlineSafeToSpendMinor);
    expect(await app.getMonth(bob, year, month)).toEqual(at650);
    expect(await app.getMonth(alice, year, month)).toEqual(at650);
  });

  it("does not confirm whether an email already has an account", async () => {
    const store = memoryStore();
    const app = createBudgetApp(store, sequentialIds());
    const created = await app.createHousehold({ userId: "alice" }, { currency: "EUR", year, month });
    await expect(app.addMember({ userId: "alice" }, created.householdId, "nobody@example.com")).resolves.toBeUndefined();
    expect(await app.getMonth({ userId: "nobody" }, year, month).then(
      () => "ok",
      (error: unknown) => (error as AppError).code,
    )).toBe("NOT_FOUND");
  });

  it("saveMonth writes income and allocation in one revision", async () => {
    const store = memoryStore();
    const app = createBudgetApp(store, sequentialIds());
    await app.createHousehold({ userId: "alice" }, { currency: "EUR", year, month });
    const saved = await app.saveMonth(
      { userId: "alice" },
      {
        year,
        month,
        expectedRevision: 1,
        incomeMinor: eur("3000"),
        allocationMinor: eur("500"),
        categoryName: "Food Shop",
      },
    );
    expect(saved.revision).toBe(2);
    expect(saved.incomeMinor).toBe(eur("3000"));
    expect(saved.allocationMinor).toBe(eur("500"));
  });
});
