-- Phase 1B: membership points at auth.users (hosted Supabase Auth).
-- Apply after 20260831200000_phase1a_spine.sql.
-- Never apply supabase/shims/auth_uid.sql on hosted Supabase.

ALTER TABLE household_members DROP CONSTRAINT IF EXISTS household_members_user_id_fkey;
DROP POLICY IF EXISTS app_users_self_select ON app_users;
DROP TABLE IF EXISTS app_users;

ALTER TABLE household_members
  ADD CONSTRAINT household_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.member_household_ids() TO authenticated;
GRANT SELECT ON households, household_members, budget_months, categories, month_allocations
  TO authenticated;

REVOKE ALL ON TABLE households, household_members, budget_months, categories, month_allocations FROM anon;
REVOKE ALL ON SCHEMA private FROM anon;
