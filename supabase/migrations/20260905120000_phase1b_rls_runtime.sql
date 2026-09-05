-- Phase 1B security checkpoint: production queries run as role `authenticated`
-- with the signed-in user's JWT claims, so auth.uid() and RLS govern every
-- command-adapter read and write. Table-owner / superuser connections bypass
-- RLS; the adapter must SET LOCAL ROLE authenticated inside a transaction.

CREATE SCHEMA IF NOT EXISTS private;

-- Do not FORCE RLS: SECURITY DEFINER helpers are owned by the migration role.
-- FORCE would make those helpers recurse through household_members policies.
-- Production isolation is SET LOCAL ROLE authenticated (not the login role).

-- Hosted auth.uid() reads request.jwt.claims JSON and/or request.jwt.claim.sub.
-- Email lookup cannot SELECT auth.users as `authenticated`.
CREATE OR REPLACE FUNCTION private.user_id_for_email(lookup_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(email) = lower(lookup_email)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION private.user_id_for_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.user_id_for_email(text) TO authenticated;

-- Bypass RLS so "is this household empty?" is not hidden from a non-member.
CREATE OR REPLACE FUNCTION private.household_has_members(hid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM household_members WHERE household_id = hid)
$$;

REVOKE ALL ON FUNCTION private.household_has_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.household_has_members(uuid) TO authenticated;

-- Block PostgREST / ad-hoc SQL writes that skip the command adapter.
-- The adapter sets app.command_adapter=1 in the same transaction as SET ROLE.
CREATE OR REPLACE FUNCTION private.require_command_adapter()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.command_adapter', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'writes must use the command adapter'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS households_require_command_adapter ON households;
CREATE TRIGGER households_require_command_adapter
  BEFORE INSERT OR UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION private.require_command_adapter();

DROP TRIGGER IF EXISTS household_members_require_command_adapter ON household_members;
CREATE TRIGGER household_members_require_command_adapter
  BEFORE INSERT OR UPDATE ON household_members
  FOR EACH ROW EXECUTE FUNCTION private.require_command_adapter();

DROP TRIGGER IF EXISTS budget_months_require_command_adapter ON budget_months;
CREATE TRIGGER budget_months_require_command_adapter
  BEFORE INSERT OR UPDATE ON budget_months
  FOR EACH ROW EXECUTE FUNCTION private.require_command_adapter();

DROP TRIGGER IF EXISTS categories_require_command_adapter ON categories;
CREATE TRIGGER categories_require_command_adapter
  BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION private.require_command_adapter();

DROP TRIGGER IF EXISTS month_allocations_require_command_adapter ON month_allocations;
CREATE TRIGGER month_allocations_require_command_adapter
  BEFORE INSERT OR UPDATE ON month_allocations
  FOR EACH ROW EXECUTE FUNCTION private.require_command_adapter();

DROP POLICY IF EXISTS households_insert ON households;
CREATE POLICY households_insert ON households
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS households_update ON households;
CREATE POLICY households_update ON households
  FOR UPDATE TO authenticated
  USING (id IN (SELECT private.member_household_ids()))
  WITH CHECK (id IN (SELECT private.member_household_ids()));

DROP POLICY IF EXISTS household_members_insert ON household_members;
CREATE POLICY household_members_insert ON household_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      user_id = auth.uid()
      AND NOT private.household_has_members(household_id)
    )
    OR household_id IN (SELECT private.member_household_ids())
  );

DROP POLICY IF EXISTS budget_months_insert ON budget_months;
CREATE POLICY budget_months_insert ON budget_months
  FOR INSERT TO authenticated
  WITH CHECK (household_id IN (SELECT private.member_household_ids()));

DROP POLICY IF EXISTS budget_months_update ON budget_months;
CREATE POLICY budget_months_update ON budget_months
  FOR UPDATE TO authenticated
  USING (household_id IN (SELECT private.member_household_ids()))
  WITH CHECK (household_id IN (SELECT private.member_household_ids()));

DROP POLICY IF EXISTS categories_insert ON categories;
CREATE POLICY categories_insert ON categories
  FOR INSERT TO authenticated
  WITH CHECK (household_id IN (SELECT private.member_household_ids()));

DROP POLICY IF EXISTS categories_update ON categories;
CREATE POLICY categories_update ON categories
  FOR UPDATE TO authenticated
  USING (household_id IN (SELECT private.member_household_ids()))
  WITH CHECK (household_id IN (SELECT private.member_household_ids()));

DROP POLICY IF EXISTS month_allocations_insert ON month_allocations;
CREATE POLICY month_allocations_insert ON month_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    month_id IN (
      SELECT id FROM budget_months WHERE household_id IN (SELECT private.member_household_ids())
    )
  );

DROP POLICY IF EXISTS month_allocations_update ON month_allocations;
CREATE POLICY month_allocations_update ON month_allocations
  FOR UPDATE TO authenticated
  USING (
    month_id IN (
      SELECT id FROM budget_months WHERE household_id IN (SELECT private.member_household_ids())
    )
  )
  WITH CHECK (
    month_id IN (
      SELECT id FROM budget_months WHERE household_id IN (SELECT private.member_household_ids())
    )
  );

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.member_household_ids() TO authenticated;
GRANT SELECT, INSERT, UPDATE ON
  households, household_members, budget_months, categories, month_allocations
  TO authenticated;

-- Login role (local `ndapp` / hosted `postgres`) must be allowed to SET ROLE.
DO $$
BEGIN
  EXECUTE format('GRANT authenticated TO %I', current_user);
END
$$;
