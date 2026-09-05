# 0009 — Phase 1A runs on Postgres with a Supabase-shaped schema

**Status:** superseded for production identity and write path — see `0010`, `0012`, and `0013`. Local CI Postgres + shim remains.  
**Date:** 2026-08-31  
**Kind:** historical decision (Phase 1A)

## Context

Phase 0 chose hosted Supabase (ADR 0002) and email OTP (ADR 0005). This environment has **no Docker**, so Supabase CLI local is not available, and no hosted project is provisioned. CI can run a Postgres service. We still need real RLS tests, not mocked membership.

## Decision

- Ship the spine against **PostgreSQL 16** using a migration that calls `auth.uid()` the same way Supabase RLS would.
- Vanilla/CI Postgres applies `supabase/shims/auth_uid.sql` first.
- Identity for this slice is `app_users` plus **email + password** JWTs (the documented OTP fallback). Membership is still a `household_members` row checked on every command.
- The command API is the only writer. *(Superseded by ADR 0013: those writes now run as `authenticated` under RLS, not as the table-owner role.)*
- Hosted Supabase remains the intended production home. Connecting it later means pointing `DATABASE_URL` / Auth at that project and **not** applying the vanilla `auth.uid` shim.

## Consequences

- Phase 1A is not a hosted multi-region SaaS deploy. Two phones can test against a machine running `npm run dev` on a LAN, not against supabase.co.
- OTP mail is still not implemented; password is the working path.
- A future hosted-Supabase adapter should reuse `createBudgetApp` and the same tables.
