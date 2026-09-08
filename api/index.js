// src/server/vercel-entry.ts
import { handle } from "hono/vercel";
import pg from "pg";

// src/server/http.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";

// src/domain/money.ts
var MINOR_EXPONENT = 2;
var MINOR_FACTOR = 10 ** MINOR_EXPONENT;
var MoneyError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "MoneyError";
  }
};
function assertMinorUnits(value) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new MoneyError("Money amount must be a finite number");
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError("Money amount must be a safe integer in minor units");
  }
  return value;
}
function assertCurrencyCode(code) {
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new MoneyError("Currency must be a 3-letter ISO 4217 code (e.g. EUR)");
  }
  return code;
}
function parseMajorToMinor(input) {
  const trimmed = input.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "+" || trimmed === ".") {
    throw new MoneyError("Money string is empty or incomplete");
  }
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    throw new MoneyError("Money string must be a plain decimal (e.g. 500.50)");
  }
  const negative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^[+-]/, "");
  const [wholeRaw, fractionRaw] = unsigned.split(".");
  const whole = wholeRaw ?? "0";
  const fraction = fractionRaw ?? "";
  if (fraction.length > MINOR_EXPONENT) {
    throw new MoneyError(`Money string cannot have more than ${MINOR_EXPONENT} decimal places`);
  }
  const paddedFraction = fraction.padEnd(MINOR_EXPONENT, "0");
  const minor = Number.parseInt(whole, 10) * MINOR_FACTOR + Number.parseInt(paddedFraction || "0", 10);
  const signed = negative ? -minor : minor;
  return assertMinorUnits(signed);
}

// src/domain/budget.ts
var BudgetError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "BudgetError";
  }
};
function calculateBudget(input) {
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
  const spendByCategory = /* @__PURE__ */ new Map();
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
  const allocationByCategory = /* @__PURE__ */ new Map();
  for (const allocation of input.allocations) {
    allocationByCategory.set(
      allocation.categoryId,
      (allocationByCategory.get(allocation.categoryId) ?? 0) + allocation.amountMinor
    );
  }
  const categories = input.categories.map((category) => {
    const plannedMinor = allocationByCategory.get(category.id) ?? 0;
    const spentMinor = spendByCategory.get(category.id) ?? 0;
    return {
      categoryId: category.id,
      plannedMinor,
      spentMinor,
      remainingMinor: plannedMinor - spentMinor,
      protect: category.protect
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
    planDoesNotCoverIncome: unallocatedMinor < 0
  };
}
function findPaydayAccount(accounts) {
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
function indexCategories(categories) {
  const map = /* @__PURE__ */ new Map();
  const seenNames = /* @__PURE__ */ new Set();
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
function sumBills(bills, accountIds) {
  let total = 0;
  const seen = /* @__PURE__ */ new Set();
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
function sumAllocations(allocations, categories) {
  let total = 0;
  const seen = /* @__PURE__ */ new Set();
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
function sumBillsForAccount(bills, accountId) {
  let total = 0;
  for (const bill of bills) {
    if (bill.accountId === accountId) {
      total += bill.amountMinor;
    }
  }
  return total;
}
function recommendTransfers(paydayAccountId, accounts, bills) {
  const transfers = [];
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
      amountMinor
    });
  }
  return transfers;
}

// src/application/budget-app.ts
var AppError = class extends Error {
  code;
  current;
  constructor(code, message, current) {
    super(message);
    this.name = "AppError";
    this.code = code;
    if (current !== void 0) {
      this.current = current;
    }
  }
};
var SLICE_PAYDAY_ACCOUNT_ID = "slice-payday";
function persistedToBudgetInput(row) {
  return {
    currency: row.currency,
    incomeMinor: row.incomeMinor,
    accounts: [{ id: SLICE_PAYDAY_ACCOUNT_ID, name: "Payday", isPaydayAccount: true }],
    bills: [],
    categories: [{ id: row.categoryId, name: row.categoryName, protect: row.categoryProtect }],
    allocations: [{ categoryId: row.categoryId, amountMinor: row.allocationMinor }],
    spend: []
  };
}
function toMonthView(row) {
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
    headlineSafeToSpendMinor: result.headlineSafeToSpendMinor
  };
}
function createBudgetApp(store, ids = () => crypto.randomUUID()) {
  async function requireMember(actor, householdId) {
    const member = await store.isMember(householdId, actor.userId);
    if (!member) {
      throw new AppError("NOT_FOUND", "Household not found");
    }
  }
  async function loadView(householdId, year, month) {
    const row = await store.loadMonth(householdId, year, month);
    if (!row) {
      throw new AppError("NOT_FOUND", "Month not found");
    }
    return toMonthView(row);
  }
  return {
    async createHousehold(actor, input) {
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
      const row = {
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
        allocationMinor: 0
      };
      await store.insertMonth(row);
      return toMonthView(row);
    },
    async addMember(actor, householdId, email) {
      await requireMember(actor, householdId);
      const normalised = email.trim().toLowerCase();
      if (!normalised.includes("@")) {
        throw new AppError("VALIDATION", "Enter a valid email");
      }
      const otherId = await store.findUserIdByEmail(normalised);
      if (!otherId) {
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
    async getMonth(actor, year, month) {
      const householdId = await store.householdIdForUser(actor.userId);
      if (!householdId) {
        throw new AppError("NOT_FOUND", "Household not found");
      }
      await requireMember(actor, householdId);
      return loadView(householdId, year, month);
    },
    async setIncome(actor, input) {
      const amountMinor = assertMinorUnits(input.amountMinor);
      if (amountMinor < 0) {
        throw new AppError("VALIDATION", "Income cannot be negative");
      }
      return patchMoney(actor, input.year, input.month, input.expectedRevision, (row) => ({
        incomeMinor: amountMinor,
        allocationMinor: row.allocationMinor,
        categoryName: row.categoryName
      }));
    },
    async setAllocation(actor, input) {
      const amountMinor = assertMinorUnits(input.amountMinor);
      if (amountMinor < 0) {
        throw new AppError("VALIDATION", "Allocation cannot be negative");
      }
      return patchMoney(actor, input.year, input.month, input.expectedRevision, (row) => ({
        incomeMinor: row.incomeMinor,
        allocationMinor: amountMinor,
        categoryName: input.categoryName?.trim() || row.categoryName
      }));
    },
    async saveMonth(actor, input) {
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
        categoryName: input.categoryName?.trim() || row.categoryName
      }));
    }
  };
  async function patchMoney(actor, year, month, expectedRevision, patchOf) {
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
        toMonthView(current)
      );
    }
    let updated;
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
          toMonthView(latest)
        );
      }
      throw new AppError("UNAVAILABLE", "Could not save. Try again.");
    }
    return toMonthView(updated);
  }
}

// src/persistence/postgres.ts
function asMinor(value) {
  return Number.parseInt(String(value), 10);
}
function mapMonth(row) {
  return {
    householdId: row.household_id,
    monthId: row.month_id,
    year: row.year,
    month: row.month,
    revision: row.revision,
    currency: row.currency,
    incomeMinor: asMinor(row.income_minor),
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryProtect: row.category_protect,
    allocationMinor: asMinor(row.amount_minor)
  };
}
var MONTH_SQL = `
  SELECT
    m.id AS month_id,
    m.household_id,
    m.year,
    m.month,
    m.revision,
    h.currency,
    m.income_minor,
    c.id AS category_id,
    c.name AS category_name,
    c.protect AS category_protect,
    a.amount_minor
  FROM budget_months m
  JOIN households h ON h.id = m.household_id
  JOIN month_allocations a ON a.month_id = m.id
  JOIN categories c ON c.id = a.category_id
`;
function createPostgresStore(pool2, userId) {
  if (!userId) {
    throw new Error("createPostgresStore requires the authenticated user id");
  }
  async function asUser(fn) {
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" })
      ]);
      await client.query("SELECT set_config('app.command_adapter', '1', true)");
      await client.query("SET LOCAL ROLE authenticated");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
      throw error;
    } finally {
      client.release();
    }
  }
  return {
    async insertHousehold(row) {
      await asUser(
        (client) => client.query("INSERT INTO households (id, currency) VALUES ($1, $2)", [row.id, row.currency])
      );
    },
    async insertMember(householdId, memberId) {
      await asUser(
        (client) => client.query(
          "INSERT INTO household_members (household_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [householdId, memberId]
        )
      );
    },
    async findUserIdByEmail(email) {
      return asUser(async (client) => {
        const result = await client.query(
          "SELECT private.user_id_for_email($1) AS id",
          [email]
        );
        return result.rows[0]?.id ?? null;
      });
    },
    async isMember(householdId, memberId) {
      return asUser(async (client) => {
        const result = await client.query(
          "SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2",
          [householdId, memberId]
        );
        return (result.rowCount ?? 0) > 0;
      });
    },
    async householdIdForUser(memberId) {
      return asUser(async (client) => {
        const result = await client.query(
          "SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1",
          [memberId]
        );
        return result.rows[0]?.household_id ?? null;
      });
    },
    async loadMonth(householdId, year, month) {
      return asUser(async (client) => {
        const result = await client.query(MONTH_SQL + " WHERE m.household_id = $1 AND m.year = $2 AND m.month = $3", [
          householdId,
          year,
          month
        ]);
        const row = result.rows[0];
        return row ? mapMonth(row) : null;
      });
    },
    async insertMonth(row) {
      await asUser(async (client) => {
        await client.query(
          `INSERT INTO budget_months (id, household_id, year, month, income_minor, revision)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [row.monthId, row.householdId, row.year, row.month, row.incomeMinor, row.revision]
        );
        await client.query(
          `INSERT INTO categories (id, household_id, name, protect) VALUES ($1, $2, $3, $4)`,
          [row.categoryId, row.householdId, row.categoryName, row.categoryProtect]
        );
        await client.query(
          `INSERT INTO month_allocations (month_id, category_id, amount_minor) VALUES ($1, $2, $3)`,
          [row.monthId, row.categoryId, row.allocationMinor]
        );
      });
    },
    async updateMonth(monthId, expectedRevision, patch) {
      return asUser(async (client) => {
        const updated = await client.query(
          `UPDATE budget_months
           SET income_minor = $1, revision = revision + 1
           WHERE id = $2 AND revision = $3
           RETURNING id`,
          [patch.incomeMinor, monthId, expectedRevision]
        );
        if ((updated.rowCount ?? 0) === 0) {
          return null;
        }
        await client.query(`UPDATE month_allocations SET amount_minor = $1 WHERE month_id = $2`, [
          patch.allocationMinor,
          monthId
        ]);
        await client.query(
          `UPDATE categories SET name = $1
           WHERE id = (SELECT category_id FROM month_allocations WHERE month_id = $2)`,
          [patch.categoryName, monthId]
        );
        const loaded = await client.query(MONTH_SQL + " WHERE m.id = $1", [monthId]);
        const row = loaded.rows[0];
        return row ? mapMonth(row) : null;
      });
    }
  };
}

// src/server/http.ts
function httpStatus(code) {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "UNAVAILABLE":
      return 503;
    case "VALIDATION":
      return 400;
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
  }
}
function errorBody(error) {
  const body = {
    error: error.code,
    message: error.message
  };
  if (error.current) {
    body.current = error.current;
  }
  return body;
}
function createHttpApp(pool2, verifyAccessToken) {
  const appFor = (userId) => createBudgetApp(createPostgresStore(pool2, userId));
  const http = new Hono();
  http.use(
    "/*",
    cors({
      origin: process.env.CORS_ORIGIN ?? "*",
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "OPTIONS"]
    })
  );
  http.get("/health", (c) => c.json({ ok: true }));
  http.use("/month/*", requireAuth(verifyAccessToken));
  http.use("/month", requireAuth(verifyAccessToken));
  http.use("/households", requireAuth(verifyAccessToken));
  http.use("/households/*", requireAuth(verifyAccessToken));
  http.post("/households", async (c) => {
    const userId = c.get("userId");
    const app2 = appFor(userId);
    const body = await c.req.json();
    try {
      const view = await app2.createHousehold(
        { userId },
        {
          currency: body.currency ?? "EUR",
          year: body.year ?? utcYear(),
          month: body.month ?? utcMonth()
        }
      );
      return c.json(view);
    } catch (error) {
      return respondError(c, error);
    }
  });
  http.post("/households/:id/members", async (c) => {
    const userId = c.get("userId");
    const app2 = appFor(userId);
    const body = await c.req.json();
    try {
      await app2.addMember({ userId }, c.req.param("id"), body.email ?? "");
      return c.json({ ok: true });
    } catch (error) {
      return respondError(c, error);
    }
  });
  http.get("/month", async (c) => {
    const userId = c.get("userId");
    const app2 = appFor(userId);
    const year = Number(c.req.query("year") ?? utcYear());
    const month = Number(c.req.query("month") ?? utcMonth());
    try {
      return c.json(await app2.getMonth({ userId }, year, month));
    } catch (error) {
      return respondError(c, error);
    }
  });
  http.post("/month/income", async (c) => {
    const userId = c.get("userId");
    const app2 = appFor(userId);
    const body = await readMoneyBody(c);
    if (body instanceof Response) {
      return body;
    }
    try {
      return c.json(
        await app2.setIncome(
          { userId },
          {
            year: body.year,
            month: body.month,
            expectedRevision: body.expectedRevision,
            amountMinor: body.amountMinor
          }
        )
      );
    } catch (error) {
      return respondError(c, error);
    }
  });
  http.post("/month/save", async (c) => {
    const userId = c.get("userId");
    const app2 = appFor(userId);
    const raw = await c.req.json();
    try {
      return c.json(
        await app2.saveMonth(
          { userId },
          {
            year: Number(raw.year),
            month: Number(raw.month),
            expectedRevision: Number(raw.expectedRevision),
            incomeMinor: parseMajorToMinor(String(raw.income ?? "")),
            allocationMinor: parseMajorToMinor(String(raw.allocation ?? "")),
            ...typeof raw.categoryName === "string" ? { categoryName: raw.categoryName } : {}
          }
        )
      );
    } catch (error) {
      return respondError(c, error);
    }
  });
  http.post("/month/allocation", async (c) => {
    const userId = c.get("userId");
    const app2 = appFor(userId);
    const body = await readMoneyBody(c);
    if (body instanceof Response) {
      return body;
    }
    try {
      return c.json(
        await app2.setAllocation(
          { userId },
          body.categoryName === void 0 ? {
            year: body.year,
            month: body.month,
            expectedRevision: body.expectedRevision,
            amountMinor: body.amountMinor
          } : {
            year: body.year,
            month: body.month,
            expectedRevision: body.expectedRevision,
            amountMinor: body.amountMinor,
            categoryName: body.categoryName
          }
        )
      );
    } catch (error) {
      return respondError(c, error);
    }
  });
  return http;
}
function requireAuth(verifyAccessToken) {
  return createMiddleware(async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      return c.json({ error: "UNAUTHENTICATED", message: "Sign in required" }, 401);
    }
    try {
      c.set("userId", await verifyAccessToken(token));
      await next();
    } catch {
      return c.json({ error: "UNAUTHENTICATED", message: "Sign in required" }, 401);
    }
  });
}
async function readMoneyBody(c) {
  const body = await c.req.json();
  try {
    const amountMinor = parseMajorToMinor(String(body.amount ?? ""));
    return {
      year: Number(body.year),
      month: Number(body.month),
      expectedRevision: Number(body.expectedRevision),
      amountMinor,
      categoryName: typeof body.categoryName === "string" ? body.categoryName : void 0
    };
  } catch (error) {
    const message = error instanceof MoneyError ? error.message : "Enter a valid amount";
    return c.json({ error: "VALIDATION", message }, 400);
  }
}
function respondError(c, error) {
  if (error instanceof AppError) {
    return c.json(errorBody(error), httpStatus(error.code));
  }
  if (error instanceof MoneyError) {
    return c.json({ error: "VALIDATION", message: error.message }, 400);
  }
  return c.json({ error: "UNAVAILABLE", message: "Could not save. Try again." }, 503);
}
function utcYear() {
  return (/* @__PURE__ */ new Date()).getUTCFullYear();
}
function utcMonth() {
  return (/* @__PURE__ */ new Date()).getUTCMonth() + 1;
}

// src/server/supabase-auth.ts
import { createClient } from "@supabase/supabase-js";
function createSupabaseVerifier(url, anonKey) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return async (token) => {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.id) {
      throw new Error("unauthenticated");
    }
    return data.user.id;
  };
}

// src/server/vercel-entry.ts
var databaseUrl = process.env.DATABASE_URL;
var supabaseUrl = process.env.SUPABASE_URL;
var supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!databaseUrl || !supabaseUrl || !supabaseAnonKey) {
  throw new Error("DATABASE_URL, SUPABASE_URL, and SUPABASE_ANON_KEY are required");
}
var pool = new pg.Pool({ connectionString: databaseUrl });
var app = createHttpApp(pool, createSupabaseVerifier(supabaseUrl, supabaseAnonKey));
var config = { runtime: "nodejs" };
var vercel_entry_default = handle(app);
export {
  config,
  vercel_entry_default as default
};
