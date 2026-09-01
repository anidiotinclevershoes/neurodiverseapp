import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function assertShimAllowed(includeAuthShim: boolean): void {
  if (!includeAuthShim) {
    return;
  }
  if (process.env.NDAPP_FORBID_AUTH_SHIM === "1") {
    throw new Error("Auth shim is local/CI only and is forbidden in this environment");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (databaseUrl.includes("supabase.co")) {
    throw new Error("Refusing to apply the local auth shim to hosted Supabase");
  }
}

export async function applyCommittedMigrations(pool: Pool): Promise<void> {
  const dir = join(root, "supabase/migrations");
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(join(dir, file), "utf8");
    await pool.query(sql);
  }
}

export async function applySpineSchema(pool: Pool, options: { includeAuthShim: boolean }): Promise<void> {
  assertShimAllowed(options.includeAuthShim);
  if (options.includeAuthShim) {
    const shim = await readFile(join(root, "supabase/shims/auth_uid.sql"), "utf8");
    await pool.query(shim);
  }
  await applyCommittedMigrations(pool);
}

export async function resetPublicSchema(pool: Pool): Promise<void> {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
}

export async function resetLocalAuthSchema(pool: Pool): Promise<void> {
  assertShimAllowed(true);
  await pool.query("DROP SCHEMA IF EXISTS auth CASCADE");
}
