-- LOCAL / CI ONLY.
-- Do not apply this file to hosted Supabase. Hosted already provides auth.uid()
-- and auth.users. listen.ts refuses APPLY_SCHEMA when DATABASE_URL is a
-- supabase.co host.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
