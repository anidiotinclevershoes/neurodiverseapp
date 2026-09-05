import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { applySpineSchema, resetLocalAuthSchema, resetPublicSchema } from "../persistence/migrate.ts";
import { insertAuthUser } from "../persistence/postgres.ts";
import { createHttpApp } from "./http.ts";
import type { AccessTokenVerifier } from "./supabase-auth.ts";

const databaseUrl = process.env.DATABASE_URL;
const describeHttp = databaseUrl ? describe : describe.skip;

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function testVerifier(tokens: Map<string, string>): AccessTokenVerifier {
  return async (token) => {
    const userId = tokens.get(token);
    if (!userId) {
      throw new Error("unauthenticated");
    }
    return userId;
  };
}

describeHttp("http spine", () => {
  let pool: pg.Pool;
  let tokens: Map<string, string>;
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
    await resetLocalAuthSchema(pool);
    await applySpineSchema(pool, { includeAuthShim: true });
    tokens = new Map();
    const app = createHttpApp(pool, testVerifier(tokens));
    fetchApp = (input, init) => Promise.resolve(app.request(input, init));
  });

  async function register(email: string, token: string): Promise<string> {
    const id = crypto.randomUUID();
    await insertAuthUser(pool, { id, email });
    tokens.set(token, id);
    return id;
  }

  it("rejects anonymous access and does not expose custom sign-up", async () => {
    const unauth = await fetchApp("/month?year=2026&month=8");
    expect(unauth.status).toBe(401);
    const signup = await fetchApp("/auth/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "password1" }),
    });
    expect(signup.status).toBe(404);
    const junk = await fetchApp("/month?year=2026&month=8", {
      headers: { Authorization: "Bearer phase-1a-custom-jwt" },
    });
    expect(junk.status).toBe(401);
  });

  it("two members share calculated remaining; another household is isolated", async () => {
    await register("alice@example.com", "token-a");
    await register("bob@example.com", "token-b");
    await register("carol@example.com", "token-c");
    const auth = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

    const created = await json(
      await fetchApp("/households", {
        method: "POST",
        headers: auth("token-a"),
        body: JSON.stringify({ currency: "EUR", year: 2026, month: 8 }),
      }),
    );
    await fetchApp(`/households/${String(created.householdId)}/members`, {
      method: "POST",
      headers: auth("token-a"),
      body: JSON.stringify({ email: "bob@example.com" }),
    });
    await fetchApp("/month/income", {
      method: "POST",
      headers: auth("token-a"),
      body: JSON.stringify({ year: 2026, month: 8, expectedRevision: 1, amount: "3000" }),
    });
    const alloc = await json(
      await fetchApp("/month/allocation", {
        method: "POST",
        headers: auth("token-a"),
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
    const reload = await json(await fetchApp("/month?year=2026&month=8", { headers: auth("token-a") }));
    expect(reload).toMatchObject({ allocationMinor: 50000, unallocatedMinor: 250000 });
    const bob = await json(await fetchApp("/month?year=2026&month=8", { headers: auth("token-b") }));
    expect(bob.unallocatedMinor).toBe(reload.unallocatedMinor);
    expect(bob.headlineSafeToSpendMinor).toBe(reload.headlineSafeToSpendMinor);

    const carolHouse = await fetchApp("/households", {
      method: "POST",
      headers: auth("token-c"),
      body: JSON.stringify({ currency: "GBP", year: 2026, month: 8 }),
    });
    expect(carolHouse.status).toBe(200);
    const carolRead = await json(await fetchApp("/month?year=2026&month=8", { headers: auth("token-c") }));
    expect(carolRead.householdId).not.toBe(created.householdId);
    expect(carolRead.currency).toBe("GBP");
  });

  it("saves income and allocation in one revision and rejects a stale save", async () => {
    await register("alice@example.com", "token-a");
    const auth = { Authorization: "Bearer token-a", "Content-Type": "application/json" };
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

  it("production HTTP path cannot write another household", async () => {
    await register("alice@example.com", "token-a");
    await register("carol@example.com", "token-c");
    const auth = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
    await fetchApp("/households", {
      method: "POST",
      headers: auth("token-a"),
      body: JSON.stringify({ currency: "EUR", year: 2026, month: 8 }),
    });
    await fetchApp("/month/income", {
      method: "POST",
      headers: auth("token-a"),
      body: JSON.stringify({ year: 2026, month: 8, expectedRevision: 1, amount: "3000" }),
    });
    await fetchApp("/households", {
      method: "POST",
      headers: auth("token-c"),
      body: JSON.stringify({ currency: "GBP", year: 2026, month: 8 }),
    });
    const carolSave = await fetchApp("/month/income", {
      method: "POST",
      headers: auth("token-c"),
      body: JSON.stringify({ year: 2026, month: 8, expectedRevision: 1, amount: "9" }),
    });
    expect(carolSave.status).toBe(200);
    const carol = await json(carolSave);
    expect(carol.currency).toBe("GBP");
    expect(carol.incomeMinor).toBe(900);
    const alice = await json(await fetchApp("/month?year=2026&month=8", { headers: auth("token-a") }));
    expect(alice.currency).toBe("EUR");
    expect(alice.incomeMinor).toBe(300000);
    expect(alice.householdId).not.toBe(carol.householdId);
  });

  it("does not reintroduce the Phase 1A custom auth module", async () => {
    const { existsSync } = await import("node:fs");
    expect(existsSync(new URL("./auth.ts", import.meta.url))).toBe(false);
    const signup = await fetchApp("/auth/sign-in", { method: "POST" });
    expect(signup.status).toBe(404);
  });
});
