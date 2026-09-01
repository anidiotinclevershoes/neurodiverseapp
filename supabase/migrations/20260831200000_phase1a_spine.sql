-- Phase 1A spine. Uses auth.uid() so the same file can run on Supabase.
-- Vanilla Postgres tests apply supabase/shims/auth_uid.sql first.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE app_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE households (
  id uuid PRIMARY KEY,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE household_members (
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

CREATE INDEX household_members_user_id_idx ON household_members (user_id);

CREATE TABLE budget_months (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  income_minor bigint NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, year, month)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name text NOT NULL,
  protect boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE month_allocations (
  month_id uuid NOT NULL REFERENCES budget_months (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories (id),
  amount_minor bigint NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  PRIMARY KEY (month_id, category_id)
);

-- SECURITY DEFINER lives in private, not public (Supabase guidance).
CREATE OR REPLACE FUNCTION private.member_household_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id
  FROM household_members
  WHERE user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION private.member_household_ids() FROM PUBLIC;

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE month_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY households_select ON households
  FOR SELECT USING (id IN (SELECT private.member_household_ids()));

CREATE POLICY household_members_select ON household_members
  FOR SELECT USING (household_id IN (SELECT private.member_household_ids()));

CREATE POLICY budget_months_select ON budget_months
  FOR SELECT USING (household_id IN (SELECT private.member_household_ids()));

CREATE POLICY categories_select ON categories
  FOR SELECT USING (household_id IN (SELECT private.member_household_ids()));

CREATE POLICY month_allocations_select ON month_allocations
  FOR SELECT USING (
    month_id IN (
      SELECT id FROM budget_months WHERE household_id IN (SELECT private.member_household_ids())
    )
  );

CREATE POLICY app_users_self_select ON app_users
  FOR SELECT USING (id = auth.uid());

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

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
