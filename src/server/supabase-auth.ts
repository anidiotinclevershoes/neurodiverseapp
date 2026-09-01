import { createClient } from "@supabase/supabase-js";

export type AccessTokenVerifier = (token: string) => Promise<string>;

/**
 * Authoritative identity for the command API: Supabase Auth getUser.
 * Custom JWTs minted by Phase 1A are not accepted.
 */
export function createSupabaseVerifier(url: string, anonKey: string): AccessTokenVerifier {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (token) => {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.id) {
      throw new Error("unauthenticated");
    }
    return data.user.id;
  };
}
