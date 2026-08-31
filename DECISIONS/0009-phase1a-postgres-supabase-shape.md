# 0009 — Phase 1A runs on Postgres with a Supabase-shaped schema

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

Phase 0 chose hosted Supabase (ADR 0002) and email OTP (ADR 0005). This environment has **no Docker**, so Supabase CLI local is not available, and no hosted project is provisioned. CI can run a Postgres service. We still need real RLS tests, not mocked membership.

## Decision

- Ship the spine against **PostgreSQL 16** using a migration that calls `auth.uid()` the same way Supabase RLS would.
- Vanilla/CI Postgres applies `supabase/shims/auth_uid.sql` first.
- Identity for this slice is `app_users` plus **email + password** JWTs (the documented OTP fallback). Membership is still a `household_members` row checked on every command.
- The command API is the only writer. Role `ndapp_authenticated` may **SELECT** through RLS and must not UPDATE.
- Hosted Supabase remains the intended production home. Connecting it later means pointing `DATABASE_URL` / Auth at that project and **not** applying the vanilla `auth.uid` shim.

## Consequences

- Phase 1A is not a hosted multi-region SaaS deploy. Two phones can test against a machine running `npm run dev` on a LAN, not against supabase.co.
- OTP mail is still not implemented; password is the working path.
- A future hosted-Supabase adapter should reuse `createBudgetApp` and the same tables.
