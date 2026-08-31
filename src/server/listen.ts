import { serve } from "@hono/node-server";
import pg from "pg";
import { applySpineSchema } from "../persistence/migrate.ts";
import { createHttpApp } from "./http.ts";

const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
if (!databaseUrl || !jwtSecret) {
  throw new Error("DATABASE_URL and JWT_SECRET are required");
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

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: createHttpApp(pool, jwtSecret).fetch, port });
console.info(`NDApp API listening on ${port}`);
