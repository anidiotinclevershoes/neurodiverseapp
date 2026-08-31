-- Vanilla Postgres stand-in for Supabase auth.uid().
-- Do not apply this on a hosted Supabase project (it already provides auth.uid()).

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
