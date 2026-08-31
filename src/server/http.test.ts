import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { applySpineSchema, resetPublicSchema } from "../persistence/migrate.ts";
import { createHttpApp } from "./http.ts";

const databaseUrl = process.env.DATABASE_URL;
const describeHttp = databaseUrl ? describe : describe.skip;
const secret = "test-secret-phase-1a";

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describeHttp("http spine", () => {
  let pool: pg.Pool;
  let fetchApp: (input: string, init?: RequestInit) => Promise<Response>;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetPublicSchema(pool);
    await pool.query("DROP SCHEMA IF EXISTS private CASCADE");
    await applySpineSchema(pool, { includeAuthShim: true });
    const app = createHttpApp(pool, secret);
    fetchApp = (input, init) => Promise.resolve(app.request(input, init));
  });

  it("two members share calculated remaining; another household is isolated", async () => {
    const signA = await fetchApp("/auth/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "password1" }),
    });
    const signB = await fetchApp("/auth/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com", password: "password1" }),
    });
    const signC = await fetchApp("/auth/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "carol@example.com", password: "password1" }),
    });
    const tokenA = String((await json(signA)).token);
    const tokenB = String((await json(signB)).token);
    const tokenC = String((await json(signC)).token);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

    const created = await json(
      await fetchApp("/households", {
        method: "POST",
        headers: auth(tokenA),
        body: JSON.stringify({ currency: "EUR", year: 2026, month: 8 }),
      }),
    );
    await fetchApp(`/households/${String(created.householdId)}/members`, {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify({ email: "bob@example.com" }),
    });
    await fetchApp("/month/income", {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify({ year: 2026, month: 8, expectedRevision: 1, amount: "3000" }),
    });
    const alloc = await json(
      await fetchApp("/month/allocation", {
        method: "POST",
        headers: auth(tokenA),
        body: JSON.stringify({
          year: 2026,
          month: 8,
          expectedRevision: 2,
          amount: "500",
          categoryName: "Food Shop",
        }),
      }),
    );
    expect(alloc.unallocatedMinor).toBe(250000);
    const reload = await json(await fetchApp("/month?year=2026&month=8", { headers: auth(tokenA) }));
    expect(reload).toMatchObject({ allocationMinor: 50000, unallocatedMinor: 250000 });
    const bob = await json(await fetchApp("/month?year=2026&month=8", { headers: auth(tokenB) }));
    expect(bob.unallocatedMinor).toBe(reload.unallocatedMinor);
    expect(bob.headlineSafeToSpendMinor).toBe(reload.headlineSafeToSpendMinor);

    const carolHouse = await fetchApp("/households", {
      method: "POST",
      headers: auth(tokenC),
      body: JSON.stringify({ currency: "GBP", year: 2026, month: 8 }),
    });
    expect(carolHouse.status).toBe(200);
    const carolRead = await json(await fetchApp("/month?year=2026&month=8", { headers: auth(tokenC) }));
    expect(carolRead.householdId).not.toBe(created.householdId);
    expect(carolRead.currency).toBe("GBP");

    const unauth = await fetchApp("/month?year=2026&month=8");
    expect(unauth.status).toBe(401);
  });

  it("saves income and allocation in one revision and rejects a stale save", async () => {
    const signA = await fetchApp("/auth/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "password1" }),
    });
    const tokenA = String((await json(signA)).token);
    const auth = { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" };
    await fetchApp("/households", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ currency: "EUR", year: 2026, month: 8 }),
    });
    const saved = await fetchApp("/month/save", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        year: 2026,
        month: 8,
        expectedRevision: 1,
        income: "3000",
        allocation: "500",
        categoryName: "Food Shop",
      }),
    });
    expect(saved.status).toBe(200);
    const body = await json(saved);
    expect(body.revision).toBe(2);
    expect(body.unallocatedMinor).toBe(250000);

    const stale = await fetchApp("/month/save", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        year: 2026,
        month: 8,
        expectedRevision: 1,
        income: "9999",
        allocation: "1",
      }),
    });
    expect(stale.status).toBe(409);
    const conflict = await json(stale);
    expect(conflict.error).toBe("CONFLICT");
    expect(conflict.current).toMatchObject({ incomeMinor: 300000, revision: 2 });

    const invalid = await fetchApp("/month/save", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        year: 2026,
        month: 8,
        expectedRevision: 2,
        income: "1e2",
        allocation: "0",
      }),
    });
    expect(invalid.status).toBe(400);
  });
});
