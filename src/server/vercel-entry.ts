import { handle } from "hono/vercel";
import pg from "pg";
import { createHttpApp } from "./http.ts";
import { createSupabaseVerifier } from "./supabase-auth.ts";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!databaseUrl || !supabaseUrl || !supabaseAnonKey) {
  throw new Error("DATABASE_URL, SUPABASE_URL, and SUPABASE_ANON_KEY are required");
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const app = createHttpApp(pool, createSupabaseVerifier(supabaseUrl, supabaseAnonKey));

export const config = { runtime: "nodejs" };
export default handle(app);
