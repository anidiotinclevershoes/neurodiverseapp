# 0013 — Production queries run as `authenticated` under the signed-in JWT

**Status:** accepted  
**Date:** 2026-09-05  
**Kind:** current decision

## Context

Phase 1B authenticated the command API with Supabase Auth `getUser`, but `createPostgresStore` used one process-wide `pg` pool as the table-owner / login role. Policies existed. Isolated `SET ROLE authenticated` tests passed. Production writes still bypassed RLS.

`auth.uid()` is not magically filled by “the user is signed in”. It reads JWT claims from the current Postgres session (`request.jwt.claim.sub` and/or `request.jwt.claims`). A privileged `DATABASE_URL` connection does not set those claims and, on hosted Supabase, the login role is typically a superuser that bypasses RLS. `FORCE ROW LEVEL SECURITY` is not used: it would make `SECURITY DEFINER` membership helpers recurse, and it still would not bind a hosted superuser.

## Decision

Keep the existing application boundary (`createBudgetApp` + `BudgetStore`). Scope the **same production adapter** per signed-in user:

1. HTTP verifies the Supabase access token (`getUser`) and takes `user.id`.
2. That request builds `createPostgresStore(pool, userId)`.
3. Every store method opens a transaction on a held pool client, sets
   `request.jwt.claim.sub`, `request.jwt.claims` (`{ sub, role: "authenticated" }`),
   and `app.command_adapter=1`, then `SET LOCAL ROLE authenticated`.
4. Household SQL runs as `authenticated`. `auth.uid()` returns that `sub`.
   RLS policies using `private.member_household_ids()` govern the rows.
5. Revision checking stays `UPDATE … WHERE revision = $expected` inside that
   transaction. A failed write still surfaces as `UNAVAILABLE`, not success.

`authenticated` now has `SELECT, INSERT, UPDATE` on household tables, with
INSERT/UPDATE policies. A trigger rejects writes unless `app.command_adapter=1`,
so PostgREST/Data API cannot skip the command path or revision check.

Email lookup uses `private.user_id_for_email` (SECURITY DEFINER) because
`authenticated` must not `SELECT auth.users`.

`DATABASE_URL` remains a **runtime** server secret (migrations and the Node
API). It is not a browser env var. It is not replaced by the Data API for V1.

## Email confirmation (private V1)

**Private V1 decision — revisit before any public or untrusted-user release.**

This build is a trusted two-person household. Email confirmation may stay
**disabled** so `signUp` returns a session immediately. That does not weaken
household isolation: isolation is RLS + membership, not a mailbox click.
Passwords and sessions stay on Supabase Auth. Homemade auth stays deleted.

If NDApp is ever offered to untrusted or public users, reassess confirmation,
account-enumeration behaviour, and related Auth settings **before** that launch.
Do not build that flow now.

## Consequences

- A second household cannot be read or written through `createPostgresStore(pool, userId)`.
- CI still uses Postgres 16 + `supabase/shims/auth_uid.sql`. That shim now
  mirrors hosted `auth.uid()` (claim.sub **or** claims JSON).
- Owner setup must apply this migration (`npm run migrate:hosted`) before the
  API is pointed at the project.
- Supersedes the “writes use the table-owner role; `authenticated` is SELECT-only”
  clause of ADR 0009 / earlier Phase 1B docs.
