import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { createBudgetApp } from "../application/budget-app.ts";
import { parseMajorToMinor } from "../domain/money.ts";
import { applySpineSchema, resetLocalAuthSchema, resetPublicSchema } from "./migrate.ts";
import { createPostgresStore, insertAuthUser } from "./postgres.ts";

const databaseUrl = process.env.DATABASE_URL;

const describePersistence = databaseUrl ? describe : describe.skip;

const eur = (major: string) => parseMajorToMinor(major);
const year = 2026;
const month = 8;

describePersistence("postgres persistence + RLS", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query("SELECT 1");
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetPublicSchema(pool);
    await pool.query("DROP SCHEMA IF EXISTS private CASCADE");
    await resetLocalAuthSchema(pool);
    await applySpineSchema(pool, { includeAuthShim: true });
    await pool.query("GRANT authenticated TO CURRENT_USER");
  });

  it("round-trips income and allocation through the domain engine", async () => {
    const alice = crypto.randomUUID();
    const bob = crypto.randomUUID();
    await insertAuthUser(pool, { id: alice, email: "alice@example.com" });
    await insertAuthUser(pool, { id: bob, email: "bob@example.com" });
    const aliceApp = createBudgetApp(createPostgresStore(pool, alice));
    const bobApp = createBudgetApp(createPostgresStore(pool, bob));
    const created = await aliceApp.createHousehold({ userId: alice }, { currency: "EUR", year, month });
    await aliceApp.addMember({ userId: alice }, created.householdId, "bob@example.com");
    await aliceApp.setIncome({ userId: alice }, {
      year,
      month,
      expectedRevision: 1,
      amountMinor: eur("3000"),
    });
    const saved = await aliceApp.setAllocation({ userId: alice }, {
      year,
      month,
      expectedRevision: 2,
      amountMinor: eur("500"),
      categoryName: "Food Shop",
    });
    const reloaded = await aliceApp.getMonth({ userId: alice }, year, month);
    expect(reloaded).toEqual(saved);
    const fromBob = await bobApp.getMonth({ userId: bob }, year, month);
    expect(fromBob.unallocatedMinor).toBe(saved.unallocatedMinor);
    expect(fromBob.allocationMinor).toBe(eur("500"));
  });

  it("rejects stale revision at the database write", async () => {
    const alice = crypto.randomUUID();
    await insertAuthUser(pool, { id: alice, email: "alice@example.com" });
    const app = createBudgetApp(createPostgresStore(pool, alice));
    await app.createHousehold({ userId: alice }, { currency: "EUR", year, month });
    await app.setIncome({ userId: alice }, {
      year,
      month,
      expectedRevision: 1,
      amountMinor: eur("100"),
    });
    await expect(
      app.setIncome({ userId: alice }, {
        year,
        month,
        expectedRevision: 1,
        amountMinor: eur("200"),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const latest = await app.getMonth({ userId: alice }, year, month);
    expect(latest.incomeMinor).toBe(eur("100"));
  });

  it("RLS: member A cannot read or write household B; Data API writes are denied", async () => {
    const alice = crypto.randomUUID();
    const carol = crypto.randomUUID();
    await insertAuthUser(pool, { id: alice, email: "alice@example.com" });
    await insertAuthUser(pool, { id: carol, email: "carol@example.com" });
    const aliceApp = createBudgetApp(createPostgresStore(pool, alice));
    const carolApp = createBudgetApp(createPostgresStore(pool, carol));
    const houseA = await aliceApp.createHousehold({ userId: alice }, { currency: "EUR", year, month });
    await carolApp.createHousehold({ userId: carol }, { currency: "GBP", year, month });
    await aliceApp.setIncome({ userId: alice }, {
      year,
      month,
      expectedRevision: 1,
      amountMinor: eur("3000"),
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [alice]);
      const asAlice = await client.query<{ household_id: string; income_minor: string }>(
        "SELECT household_id, income_minor FROM budget_months",
      );
      expect(asAlice.rows).toHaveLength(1);
      expect(asAlice.rows[0]?.household_id).toBe(houseA.householdId);
      expect(asAlice.rows[0]?.income_minor).toBe("300000");

      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [carol]);
      const asCarol = await client.query<{ currency: string }>(
        "SELECT h.currency FROM budget_months m JOIN households h ON h.id = m.household_id",
      );
      expect(asCarol.rows).toHaveLength(1);
      expect(asCarol.rows[0]?.currency).toBe("GBP");
      const leak = await client.query("SELECT 1 FROM budget_months WHERE household_id = $1", [
        houseA.householdId,
      ]);
      expect(leak.rowCount).toBe(0);

      await client.query("SAVEPOINT before_bare_write");
      await expect(
        client.query("UPDATE budget_months SET income_minor = 1"),
      ).rejects.toThrow(/command adapter|permission denied/);
      await client.query("ROLLBACK TO SAVEPOINT before_bare_write");

      await client.query("SELECT set_config('app.command_adapter', '1', true)");
      const stolen = await client.query("UPDATE budget_months SET income_minor = 1 WHERE household_id = $1", [
        houseA.householdId,
      ]);
      expect(stolen.rowCount).toBe(0);

      await client.query("ROLLBACK");
    } finally {
      try {
        await client.query("ROLLBACK");
      } catch {
        // already rolled back
      }
      client.release();
    }
  });

  it("RLS: unauthenticated (no jwt sub) sees nothing", async () => {
    const alice = crypto.randomUUID();
    await insertAuthUser(pool, { id: alice, email: "alice@example.com" });
    const app = createBudgetApp(createPostgresStore(pool, alice));
    await app.createHousehold({ userId: alice }, { currency: "EUR", year, month });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      const rows = await client.query("SELECT * FROM budget_months");
      expect(rows.rowCount).toBe(0);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("production adapter cannot read or write another household", async () => {
    const alice = crypto.randomUUID();
    const carol = crypto.randomUUID();
    await insertAuthUser(pool, { id: alice, email: "alice@example.com" });
    await insertAuthUser(pool, { id: carol, email: "carol@example.com" });
    const aliceApp = createBudgetApp(createPostgresStore(pool, alice));
    const carolApp = createBudgetApp(createPostgresStore(pool, carol));
    const houseA = await aliceApp.createHousehold({ userId: alice }, { currency: "EUR", year, month });
    const houseB = await carolApp.createHousehold({ userId: carol }, { currency: "GBP", year, month });
    await aliceApp.setIncome({ userId: alice }, {
      year,
      month,
      expectedRevision: 1,
      amountMinor: eur("3000"),
    });

    const aliceStore = createPostgresStore(pool, alice);
    expect(await aliceStore.loadMonth(houseB.householdId, year, month)).toBeNull();
    expect(await aliceStore.isMember(houseB.householdId, alice)).toBe(false);
    expect(await aliceStore.updateMonth(houseB.monthId, houseB.revision, {
      incomeMinor: 1,
      allocationMinor: 1,
      categoryName: "Stolen",
    })).toBeNull();

    const carolView = await carolApp.getMonth({ userId: carol }, year, month);
    expect(carolView.incomeMinor).toBe(0);
    expect(carolView.householdId).toBe(houseB.householdId);

    const aliceView = await aliceApp.getMonth({ userId: alice }, year, month);
    expect(aliceView.incomeMinor).toBe(eur("3000"));
    expect(aliceView.householdId).toBe(houseA.householdId);

    await expect(aliceStore.insertMember(houseB.householdId, alice)).rejects.toThrow();
    expect(await aliceStore.isMember(houseB.householdId, alice)).toBe(false);
  });

  it("failed persistence through the production adapter is not treated as success", async () => {
    const alice = crypto.randomUUID();
    await insertAuthUser(pool, { id: alice, email: "alice@example.com" });
    const app = createBudgetApp(createPostgresStore(pool, alice));
    await app.createHousehold({ userId: alice }, { currency: "EUR", year, month });
    await pool.query(`
      CREATE OR REPLACE FUNCTION private.fail_next_update()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'simulated persistence failure';
      END;
      $$;
      CREATE TRIGGER fail_budget_update
        AFTER UPDATE ON budget_months
        FOR EACH ROW EXECUTE FUNCTION private.fail_next_update();
    `);
    await expect(
      app.setIncome({ userId: alice }, {
        year,
        month,
        expectedRevision: 1,
        amountMinor: eur("100"),
      }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    const stillZero = await app.getMonth({ userId: alice }, year, month);
    expect(stillZero.incomeMinor).toBe(0);
    expect(stillZero.revision).toBe(1);
    await pool.query("DROP TRIGGER fail_budget_update ON budget_months");
    const saved = await app.setIncome({ userId: alice }, {
      year,
      month,
      expectedRevision: 1,
      amountMinor: eur("100"),
    });
    expect(saved.incomeMinor).toBe(eur("100"));
  });

  it("requires a signed-in user id on the production adapter", () => {
    expect(() => createPostgresStore(pool, "")).toThrow(/authenticated user id/);
  });

  it("refuses to apply the local auth shim against a hosted URL", async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://postgres:postgres@db.example.supabase.co:5432/postgres";
    try {
      await expect(applySpineSchema(pool, { includeAuthShim: true })).rejects.toThrow(/hosted Supabase/);
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
    }
  });
});
