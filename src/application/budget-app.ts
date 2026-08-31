/**
 * Application errors. HTTP mapping lives in the server, not here.
 */
export type AppErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly current?: MonthView;

  constructor(code: AppErrorCode, message: string, current?: MonthView) {
    super(message);
    this.name = "AppError";
    this.code = code;
    if (current !== undefined) {
      this.current = current;
    }
  }
}

export type Actor = {
  userId: string;
};

export type MonthView = {
  householdId: string;
  monthId: string;
  year: number;
  month: number;
  revision: number;
  currency: string;
  incomeMinor: number;
  categoryId: string;
  categoryName: string;
  allocationMinor: number;
  unallocatedMinor: number;
  remainingMinor: number;
  headlineSafeToSpendMinor: number;
};

export type PersistedMonth = {
  householdId: string;
  monthId: string;
  year: number;
  month: number;
  revision: number;
  currency: string;
  incomeMinor: number;
  categoryId: string;
  categoryName: string;
  categoryProtect: boolean;
  allocationMinor: number;
};

export type BudgetStore = {
  insertHousehold(row: { id: string; currency: string }): Promise<void>;
  insertMember(householdId: string, userId: string): Promise<void>;
  findUserIdByEmail(email: string): Promise<string | null>;
  isMember(householdId: string, userId: string): Promise<boolean>;
  householdIdForUser(userId: string): Promise<string | null>;
  loadMonth(householdId: string, year: number, month: number): Promise<PersistedMonth | null>;
  insertMonth(row: PersistedMonth): Promise<void>;
  updateMonth(
    monthId: string,
    expectedRevision: number,
    patch: { incomeMinor: number; allocationMinor: number; categoryName: string },
  ): Promise<PersistedMonth | null>;
};

const SLICE_PAYDAY_ACCOUNT_ID = "slice-payday";

import { calculateBudget, type BudgetInput } from "../domain/budget.ts";
import { assertCurrencyCode, assertMinorUnits } from "../domain/money.ts";

export function persistedToBudgetInput(row: PersistedMonth): BudgetInput {
  return {
    currency: row.currency,
    incomeMinor: row.incomeMinor,
    accounts: [{ id: SLICE_PAYDAY_ACCOUNT_ID, name: "Payday", isPaydayAccount: true }],
    bills: [],
    categories: [{ id: row.categoryId, name: row.categoryName, protect: row.categoryProtect }],
    allocations: [{ categoryId: row.categoryId, amountMinor: row.allocationMinor }],
    spend: [],
  };
}

export function toMonthView(row: PersistedMonth): MonthView {
  const result = calculateBudget(persistedToBudgetInput(row));
  const category = result.categories[0];
  if (!category) {
    throw new AppError("UNAVAILABLE", "Budget result missing category");
  }
  return {
    householdId: row.householdId,
    monthId: row.monthId,
    year: row.year,
    month: row.month,
    revision: row.revision,
    currency: row.currency,
    incomeMinor: row.incomeMinor,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    allocationMinor: row.allocationMinor,
    unallocatedMinor: result.unallocatedMinor,
    remainingMinor: category.remainingMinor,
    headlineSafeToSpendMinor: result.headlineSafeToSpendMinor,
  };
}

export function createBudgetApp(store: BudgetStore, ids: () => string = () => crypto.randomUUID()) {
  async function requireMember(actor: Actor, householdId: string): Promise<void> {
    const member = await store.isMember(householdId, actor.userId);
    if (!member) {
      throw new AppError("NOT_FOUND", "Household not found");
    }
  }

  async function loadView(householdId: string, year: number, month: number): Promise<MonthView> {
    const row = await store.loadMonth(householdId, year, month);
    if (!row) {
      throw new AppError("NOT_FOUND", "Month not found");
    }
    return toMonthView(row);
  }

  return {
    async createHousehold(
      actor: Actor,
      input: { currency: string; year: number; month: number },
    ): Promise<MonthView> {
      const currency = assertCurrencyCode(input.currency);
      const existing = await store.householdIdForUser(actor.userId);
      if (existing) {
        throw new AppError("VALIDATION", "You already belong to a household");
      }
      const householdId = ids();
      const monthId = ids();
      const categoryId = ids();
      await store.insertHousehold({ id: householdId, currency });
      await store.insertMember(householdId, actor.userId);
      const row: PersistedMonth = {
        householdId,
        monthId,
        year: input.year,
        month: input.month,
        revision: 1,
        currency,
        incomeMinor: 0,
        categoryId,
        categoryName: "Envelope",
        categoryProtect: false,
        allocationMinor: 0,
      };
      await store.insertMonth(row);
      return toMonthView(row);
    },

    async addMember(actor: Actor, householdId: string, email: string): Promise<void> {
      await requireMember(actor, householdId);
      const normalised = email.trim().toLowerCase();
      if (!normalised.includes("@")) {
        throw new AppError("VALIDATION", "Enter a valid email");
      }
      const otherId = await store.findUserIdByEmail(normalised);
      if (!otherId) {
        // Same outcome as a successful add of an unknown person: do not confirm
        // whether that mailbox already has an account.
        return;
      }
      if (otherId === actor.userId) {
        throw new AppError("VALIDATION", "You are already a member");
      }
      const already = await store.isMember(householdId, otherId);
      if (already) {
        return;
      }
      await store.insertMember(householdId, otherId);
    },

    async getMonth(actor: Actor, year: number, month: number): Promise<MonthView> {
      const householdId = await store.householdIdForUser(actor.userId);
      if (!householdId) {
        throw new AppError("NOT_FOUND", "Household not found");
      }
      await requireMember(actor, householdId);
      return loadView(householdId, year, month);
    },

    async setIncome(
      actor: Actor,
      input: { year: number; month: number; expectedRevision: number; amountMinor: number },
    ): Promise<MonthView> {
      const amountMinor = assertMinorUnits(input.amountMinor);
      if (amountMinor < 0) {
        throw new AppError("VALIDATION", "Income cannot be negative");
      }
      return patchMoney(actor, input.year, input.month, input.expectedRevision, (row) => ({
        incomeMinor: amountMinor,
        allocationMinor: row.allocationMinor,
        categoryName: row.categoryName,
      }));
    },

    async setAllocation(
      actor: Actor,
      input: {
        year: number;
        month: number;
        expectedRevision: number;
        amountMinor: number;
        categoryName?: string;
      },
    ): Promise<MonthView> {
      const amountMinor = assertMinorUnits(input.amountMinor);
      if (amountMinor < 0) {
        throw new AppError("VALIDATION", "Allocation cannot be negative");
      }
      return patchMoney(actor, input.year, input.month, input.expectedRevision, (row) => ({
        incomeMinor: row.incomeMinor,
        allocationMinor: amountMinor,
        categoryName: input.categoryName?.trim() || row.categoryName,
      }));
    },

    async saveMonth(
      actor: Actor,
      input: {
        year: number;
        month: number;
        expectedRevision: number;
        incomeMinor: number;
        allocationMinor: number;
        categoryName?: string;
      },
    ): Promise<MonthView> {
      const incomeMinor = assertMinorUnits(input.incomeMinor);
      const allocationMinor = assertMinorUnits(input.allocationMinor);
      if (incomeMinor < 0) {
        throw new AppError("VALIDATION", "Income cannot be negative");
      }
      if (allocationMinor < 0) {
        throw new AppError("VALIDATION", "Allocation cannot be negative");
      }
      return patchMoney(actor, input.year, input.month, input.expectedRevision, (row) => ({
        incomeMinor,
        allocationMinor,
        categoryName: input.categoryName?.trim() || row.categoryName,
      }));
    },
  };

  async function patchMoney(
    actor: Actor,
    year: number,
    month: number,
    expectedRevision: number,
    patchOf: (row: PersistedMonth) => {
      incomeMinor: number;
      allocationMinor: number;
      categoryName: string;
    },
  ): Promise<MonthView> {
    const householdId = await store.householdIdForUser(actor.userId);
    if (!householdId) {
      throw new AppError("NOT_FOUND", "Household not found");
    }
    await requireMember(actor, householdId);
    const current = await store.loadMonth(householdId, year, month);
    if (!current) {
      throw new AppError("NOT_FOUND", "Month not found");
    }
    if (current.revision !== expectedRevision) {
      throw new AppError(
        "CONFLICT",
        "This budget changed on another device. Refresh to get the latest version.",
        toMonthView(current),
      );
    }
    let updated: PersistedMonth | null;
    try {
      updated = await store.updateMonth(current.monthId, expectedRevision, patchOf(current));
    } catch {
      throw new AppError("UNAVAILABLE", "Could not save. Try again.");
    }
    if (!updated) {
      const latest = await store.loadMonth(householdId, year, month);
      if (latest && latest.revision !== expectedRevision) {
        throw new AppError(
          "CONFLICT",
          "This budget changed on another device. Refresh to get the latest version.",
          toMonthView(latest),
        );
      }
      throw new AppError("UNAVAILABLE", "Could not save. Try again.");
    }
    return toMonthView(updated);
  }
}

export type BudgetApp = ReturnType<typeof createBudgetApp>;
