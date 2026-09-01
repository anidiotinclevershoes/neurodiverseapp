import pg from "pg";
import { applyCommittedMigrations } from "../src/persistence/migrate.ts";

const databaseUrl = process.env.HOSTED_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("HOSTED_DATABASE_URL or DATABASE_URL is required");
}
if (process.env.NDAPP_APPLY_SHIM === "1") {
  throw new Error("Refusing to apply the local auth shim via the hosted migration script");
}

const pool = new pg.Pool({ connectionString: databaseUrl });
await applyCommittedMigrations(pool);
await pool.end();
console.info("Hosted migrations applied (no auth shim)");
