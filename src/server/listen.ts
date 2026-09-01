import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import pg from "pg";
import { applySpineSchema } from "../persistence/migrate.ts";
import { createHttpApp } from "./http.ts";
import { createSupabaseVerifier } from "./supabase-auth.ts";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!databaseUrl || !supabaseUrl || !supabaseAnonKey) {
  throw new Error("DATABASE_URL, SUPABASE_URL, and SUPABASE_ANON_KEY are required");
}

if (process.env.APPLY_SCHEMA === "1") {
  if (databaseUrl.includes("supabase.co")) {
    throw new Error("APPLY_SCHEMA is local/CI only. Apply committed migrations to hosted Supabase separately.");
  }
}

const pool = new pg.Pool({ connectionString: databaseUrl });
if (process.env.APPLY_SCHEMA === "1") {
  const existing = await pool.query<{ to_regclass: string | null }>(
    "SELECT to_regclass('public.households') AS to_regclass",
  );
  if (!existing.rows[0]?.to_regclass) {
    await applySpineSchema(pool, { includeAuthShim: true });
  }
}

const http = createHttpApp(pool, createSupabaseVerifier(supabaseUrl, supabaseAnonKey));
if (process.env.SERVE_WEB === "1") {
  http.get("/*", serveStatic({ root: "./dist" }));
}

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: http.fetch, port });
console.info(`NDApp API listening on ${port}`);
