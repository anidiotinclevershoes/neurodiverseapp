import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Private V1 decision — revisit before any public or untrusted-user release.
 * The trusted two-person household signs in with email + password immediately.
 * Supabase Auth remains the only identity provider; confirmation stays off.
 */
export const PRIVATE_V1_EMAIL_CONFIRMATION_REQUIRED = false;

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (client) {
    return client;
  }
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required");
  }
  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storage: sessionStorage },
  });
  return client;
}
