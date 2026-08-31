import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

export async function applySpineSchema(pool: Pool, options: { includeAuthShim: boolean }): Promise<void> {
  if (options.includeAuthShim) {
    const shim = await readFile(join(root, "supabase/shims/auth_uid.sql"), "utf8");
    await pool.query(shim);
  }
  const migration = await readFile(
    join(root, "supabase/migrations/20260831200000_phase1a_spine.sql"),
    "utf8",
  );
  await pool.query(migration);
}

export async function resetPublicSchema(pool: Pool): Promise<void> {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
}
