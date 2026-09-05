import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createBudgetApp } from "../application/budget-app.ts";
import { parseMajorToMinor } from "../domain/money.ts";
import { createPostgresStore } from "./postgres.ts";
import { createHttpApp } from "../server/http.ts";
import { createSupabaseVerifier } from "../server/supabase-auth.ts";
import pg from "pg";

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hostedDb = process.env.HOSTED_DATABASE_URL ?? process.env.DATABASE_URL;
const hosted =
  Boolean(supabaseUrl && anonKey && serviceRole && hostedDb && process.env.NDAPP_HOSTED_TESTS === "1");

const describeHosted = hosted ? describe : describe.skip;
const eur = (major: string) => parseMajorToMinor(major);

describeHosted("hosted Supabase auth + RLS", () => {
  let admin: ReturnType<typeof createClient>;
  let pool: pg.Pool;
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const aliceEmail = `alice-${suffix}@ndapp.test`;
  const bobEmail = `bob-${suffix}@ndapp.test`;
  const carolEmail = `carol-${suffix}@ndapp.test`;
  const password = "password1-hosted";
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(supabaseUrl!, serviceRole!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    pool = new pg.Pool({ connectionString: hostedDb });
    for (const email of [aliceEmail, bobEmail, carolEmail]) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw error ?? new Error("could not create hosted test user");
      }
      createdUserIds.push(data.user.id);
    }
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
    if (pool) {
      await pool.query("DELETE FROM households WHERE id IN (SELECT household_id FROM household_members WHERE user_id = ANY($1::uuid[]))", [
        createdUserIds,
      ]);
      await pool.end();
    }
  });

  async function signIn(email: string): Promise<string> {
    const user = createClient(supabaseUrl!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await user.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw error ?? new Error("sign-in failed");
    }
    return data.session.access_token;
  }

  it("identity comes from Supabase Auth; custom tokens are rejected", async () => {
    const token = await signIn(aliceEmail);
    const verify = createSupabaseVerifier(supabaseUrl!, anonKey!);
    const userId = await verify(token);
    expect(createdUserIds).toContain(userId);
    await expect(verify("phase-1a-custom-jwt")).rejects.toThrow();
  });

  it("two members share engine figures; another household is isolated; stale save is 409", async () => {
    const verify = createSupabaseVerifier(supabaseUrl!, anonKey!);
    const http = createHttpApp(pool, verify);
    const tokenA = await signIn(aliceEmail);
    const tokenB = await signIn(bobEmail);
    const tokenC = await signIn(carolEmail);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

    const created = (await (
      await http.request("/households", {
        method: "POST",
        headers: auth(tokenA),
        body: JSON.stringify({ currency: "EUR", year: 2026, month: 8 }),
      })
    ).json()) as { householdId: string };

    await http.request(`/households/${created.householdId}/members`, {
      method: "POST",
      headers: auth(tokenA),
      body: JSON.stringify({ email: bobEmail }),
    });

    const saved = (await (
      await http.request("/month/save", {
        method: "POST",
        headers: auth(tokenA),
        body: JSON.stringify({
          year: 2026,
          month: 8,
          expectedRevision: 1,
          income: "3000",
          allocation: "500",
          categoryName: "Food Shop",
        }),
      })
    ).json()) as { unallocatedMinor: number; revision: number; householdId: string };

    expect(saved.unallocatedMinor).toBe(eur("2500"));
    const bob = (await (
      await http.request("/month?year=2026&month=8", { headers: auth(tokenB) })
    ).json()) as { unallocatedMinor: number; householdId: string };
    expect(bob.unallocatedMinor).toBe(saved.unallocatedMinor);
    expect(bob.householdId).toBe(saved.householdId);

    await http.request("/households", {
      method: "POST",
      headers: auth(tokenC),
      body: JSON.stringify({ currency: "GBP", year: 2026, month: 8 }),
    });
    const carol = (await (
      await http.request("/month?year=2026&month=8", { headers: auth(tokenC) })
    ).json()) as { householdId: string };
    expect(carol.householdId).not.toBe(saved.householdId);

    const stale = await http.request("/month/save", {
      method: "POST",
      headers: auth(tokenB),
      body: JSON.stringify({
        year: 2026,
        month: 8,
        expectedRevision: 1,
        income: "1",
        allocation: "1",
      }),
    });
    expect(stale.status).toBe(409);
  });

  it("PostgREST RLS: member cannot read another household; anon sees nothing; update denied", async () => {
    const tokenA = await signIn(aliceEmail);
    const tokenC = await signIn(carolEmail);
    const headers = (token: string) => ({
      apikey: anonKey!,
      Authorization: `Bearer ${token}`,
    });
    const aliceRows = await fetch(`${supabaseUrl}/rest/v1/budget_months?select=household_id,income_minor`, {
      headers: headers(tokenA),
    });
    expect(aliceRows.ok).toBe(true);
    const aliceData = (await aliceRows.json()) as { household_id: string }[];
    expect(aliceData.length).toBeGreaterThan(0);

    const carolLeak = await fetch(
      `${supabaseUrl}/rest/v1/budget_months?household_id=eq.${aliceData[0]?.household_id}`,
      { headers: headers(tokenC) },
    );
    expect(carolLeak.ok).toBe(true);
    expect(await carolLeak.json()).toEqual([]);

    const anon = await fetch(`${supabaseUrl}/rest/v1/budget_months?select=id`, {
      headers: { apikey: anonKey! },
    });
    expect([200, 401]).toContain(anon.status);
    if (anon.status === 200) {
      expect(await anon.json()).toEqual([]);
    }

    const patch = await fetch(`${supabaseUrl}/rest/v1/budget_months?household_id=eq.${aliceData[0]?.household_id}`, {
      method: "PATCH",
      headers: { ...headers(tokenA), "Content-Type": "application/json" },
      body: JSON.stringify({ income_minor: 1 }),
    });
    expect(patch.ok).toBe(false);
  });

  it("command path still owns calculateBudget mapping", async () => {
    const aliceId = createdUserIds[0];
    if (!aliceId) {
      throw new Error("missing alice");
    }
    const app = createBudgetApp(createPostgresStore(pool, aliceId));
    const view = await app.getMonth({ userId: aliceId }, 2026, 8);
    expect(view.unallocatedMinor + view.allocationMinor).toBe(view.incomeMinor);
  });
});
