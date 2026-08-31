/**
 * Pure, deterministic budget engine.
 *
 * The engine has no I/O, no dates-as-clocks, and no React/DB imports.
 * Same inputs always produce the same outputs.
 *
 * Authoritative values are the inputs. Everything in BudgetResult is derived.
 * Persistence stores inputs; derived values may be cached but must be
 * recomputable. Historical months keep their own input records — editing
 * a later month's defaults cannot change a previous month's inputs.
 */

import {
  assertCurrencyCode,
  assertMinorUnits,
  type CurrencyCode,
  type MinorUnits,
} from "./money.ts";

export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetError";
  }
}

export type Account = {
  id: string;
  name: string;
  isPaydayAccount: boolean;
};

export type Bill = {
  id: string;
  name: string;
  amountMinor: MinorUnits;
  accountId: string;
};

export type Category = {
  id: string;
  name: string;
  /** Protected envelopes (e.g. savings) are not treated as safely spendable. */
  protect: boolean;
};

export type Allocation = {
  categoryId: string;
  amountMinor: MinorUnits;
};

export type Spend = {
  id: string;
  amountMinor: MinorUnits;
  /** Null means the spend is not in an envelope (typically unexpected). */
  categoryId: string | null;
  unexpected: boolean;
};

export type BudgetInput = {
  currency: CurrencyCode;
  incomeMinor: MinorUnits;
  accounts: readonly Account[];
  bills: readonly Bill[];
  categories: readonly Category[];
  allocations: readonly Allocation[];
  spend: readonly Spend[];
};

export type RecommendedTransfer = {
  fromAccountId: string;
  toAccountId: string;
  amountMinor: MinorUnits;
};

export type CategoryRemaining = {
  categoryId: string;
  plannedMinor: MinorUnits;
  spentMinor: MinorUnits;
  remainingMinor: MinorUnits;
  protect: boolean;
};

export type BudgetResult = {
  currency: CurrencyCode;
  incomeMinor: MinorUnits;
  totalBillsMinor: MinorUnits;
  totalAllocationsMinor: MinorUnits;
  /** income - bills - allocations. Negative means the plan does not cover itself. */
  unallocatedMinor: MinorUnits;
  recommendedTransfers: readonly RecommendedTransfer[];
  remainInPaydayAccountMinor: MinorUnits;
  paydayAccountId: string;
  categories: readonly CategoryRemaining[];
  uncategorizedSpendMinor: MinorUnits;
  totalSpendMinor: MinorUnits;
  /**
   * Headline "how much can we safely spend":
   * unallocated + remaining non-protected envelopes
   * + negative protected remainder (overspend of savings still hurts)
   * − uncategorized spend.
   */
  headlineSafeToSpendMinor: MinorUnits;
  planDoesNotCoverIncome: boolean;
};

export function calculateBudget(input: BudgetInput): BudgetResult {
  const currency = assertCurrencyCode(input.currency);
  const incomeMinor = assertMinorUnits(input.incomeMinor);

  const payday = findPaydayAccount(input.accounts);
  const accountIds = new Set(input.accounts.map((account) => account.id));
  const categoryById = indexCategories(input.categories);

  const totalBillsMinor = sumBills(input.bills, accountIds);
  const totalAllocationsMinor = sumAllocations(input.allocations, categoryById);
  const unallocatedMinor = incomeMinor - totalBillsMinor - totalAllocationsMinor;

  const recommendedTransfers = recommendTransfers(payday.id, input.accounts, input.bills);
  const remainInPaydayAccountMinor = sumBillsForAccount(input.bills, payday.id);

  const spendByCategory = new Map<string, MinorUnits>();
  let uncategorizedSpendMinor = 0;
  let totalSpendMinor = 0;
  for (const item of input.spend) {
    const amount = assertMinorUnits(item.amountMinor);
    if (amount < 0) {
      throw new BudgetError("Spend amounts cannot be negative");
    }
    totalSpendMinor += amount;
    if (item.categoryId === null) {
      uncategorizedSpendMinor += amount;
      continue;
    }
    if (!categoryById.has(item.categoryId)) {
      throw new BudgetError(`Spend references unknown category ${item.categoryId}`);
    }
    spendByCategory.set(item.categoryId, (spendByCategory.get(item.categoryId) ?? 0) + amount);
  }

  const allocationByCategory = new Map<string, MinorUnits>();
  for (const allocation of input.allocations) {
    allocationByCategory.set(
      allocation.categoryId,
      (allocationByCategory.get(allocation.categoryId) ?? 0) + allocation.amountMinor,
    );
  }

  const categories: CategoryRemaining[] = input.categories.map((category) => {
    const plannedMinor = allocationByCategory.get(category.id) ?? 0;
    const spentMinor = spendByCategory.get(category.id) ?? 0;
    return {
      categoryId: category.id,
      plannedMinor,
      spentMinor,
      remainingMinor: plannedMinor - spentMinor,
      protect: category.protect,
    };
  });

  let headlineSafeToSpendMinor = unallocatedMinor - uncategorizedSpendMinor;
  for (const category of categories) {
    if (!category.protect) {
      headlineSafeToSpendMinor += category.remainingMinor;
    } else if (category.remainingMinor < 0) {
      headlineSafeToSpendMinor += category.remainingMinor;
    }
  }

  return {
    currency,
    incomeMinor,
    totalBillsMinor,
    totalAllocationsMinor,
    unallocatedMinor,
    recommendedTransfers,
    remainInPaydayAccountMinor,
    paydayAccountId: payday.id,
    categories,
    uncategorizedSpendMinor,
    totalSpendMinor,
    headlineSafeToSpendMinor,
    planDoesNotCoverIncome: unallocatedMinor < 0,
  };
}

export type RemoveCategoryMode = "reject-if-spent" | "reclassify-spend-as-unexpected";

/**
 * Category deletion is an explicit input transformation, not a silent drop.
 * Historical months are out of scope here: callers must pass only the target
 * month's inputs. Closed months should not be mutated.
 */
export function removeCategory(
  input: BudgetInput,
  categoryId: string,
  mode: RemoveCategoryMode = "reject-if-spent",
): BudgetInput {
  if (!input.categories.some((category) => category.id === categoryId)) {
    throw new BudgetError(`Cannot remove unknown category ${categoryId}`);
  }
  const spentInCategory = input.spend.filter((item) => item.categoryId === categoryId);
  if (spentInCategory.length > 0 && mode === "reject-if-spent") {
    throw new BudgetError(
      "Cannot delete a category that has spend in this month; reassign the spend first",
    );
  }

  const spend =
    mode === "reclassify-spend-as-unexpected"
      ? input.spend.map((item) =>
          item.categoryId === categoryId ? { ...item, categoryId: null, unexpected: true } : item,
        )
      : input.spend;

  return {
    ...input,
    categories: input.categories.filter((category) => category.id !== categoryId),
    allocations: input.allocations.filter((allocation) => allocation.categoryId !== categoryId),
    spend,
  };
}

function findPaydayAccount(accounts: readonly Account[]): Account {
  const paydayAccounts = accounts.filter((account) => account.isPaydayAccount);
  if (paydayAccounts.length !== 1) {
    throw new BudgetError("Exactly one payday account is required");
  }
  const payday = paydayAccounts[0];
  if (!payday) {
    throw new BudgetError("Exactly one payday account is required");
  }
  return payday;
}

function indexCategories(categories: readonly Category[]): Map<string, Category> {
  const map = new Map<string, Category>();
  const seenNames = new Set<string>();
  for (const category of categories) {
    if (map.has(category.id)) {
      throw new BudgetError(`Duplicate category id ${category.id}`);
    }
    if (seenNames.has(category.name)) {
      throw new BudgetError(`Duplicate category name ${category.name}`);
    }
    seenNames.add(category.name);
    map.set(category.id, category);
  }
  return map;
}

function sumBills(bills: readonly Bill[], accountIds: Set<string>): MinorUnits {
  let total = 0;
  const seen = new Set<string>();
  for (const bill of bills) {
    if (seen.has(bill.id)) {
      throw new BudgetError(`Duplicate bill id ${bill.id}`);
    }
    seen.add(bill.id);
    if (!accountIds.has(bill.accountId)) {
      throw new BudgetError(`Bill ${bill.id} references unknown account ${bill.accountId}`);
    }
    const amount = assertMinorUnits(bill.amountMinor);
    if (amount < 0) {
      throw new BudgetError("Bill amounts cannot be negative");
    }
    total += amount;
  }
  return total;
}

function sumAllocations(
  allocations: readonly Allocation[],
  categories: Map<string, Category>,
): MinorUnits {
  let total = 0;
  const seen = new Set<string>();
  for (const allocation of allocations) {
    if (seen.has(allocation.categoryId)) {
      throw new BudgetError(`Duplicate allocation for category ${allocation.categoryId}`);
    }
    seen.add(allocation.categoryId);
    if (!categories.has(allocation.categoryId)) {
      throw new BudgetError(`Allocation references unknown category ${allocation.categoryId}`);
    }
    const amount = assertMinorUnits(allocation.amountMinor);
    if (amount < 0) {
      throw new BudgetError("Allocation amounts cannot be negative");
    }
    total += amount;
  }
  return total;
}

function sumBillsForAccount(bills: readonly Bill[], accountId: string): MinorUnits {
  let total = 0;
  for (const bill of bills) {
    if (bill.accountId === accountId) {
      total += bill.amountMinor;
    }
  }
  return total;
}

function recommendTransfers(
  paydayAccountId: string,
  accounts: readonly Account[],
  bills: readonly Bill[],
): RecommendedTransfer[] {
  const transfers: RecommendedTransfer[] = [];
  for (const account of accounts) {
    if (account.id === paydayAccountId) {
      continue;
    }
    const amountMinor = sumBillsForAccount(bills, account.id);
    if (amountMinor === 0) {
      continue;
    }
    transfers.push({
      fromAccountId: paydayAccountId,
      toAccountId: account.id,
      amountMinor,
    });
  }
  return transfers;
}
