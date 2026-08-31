# 0002 — Persistence: Supabase (Postgres + Auth + RLS)

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

Two household members need the same authoritative budget. Isolation must be enforced server-side. We do not want to build auth, membership, and SQL access control from scratch. The domain engine must not import the database.

Rejected: local-only storage (cannot share), Firebase document model (weaker relational constraints for money), a custom Express+Passport stack (more files, more auth surface), event sourcing (not justified).

## Decision

Use **Supabase** as the V1 persistence and authentication platform:

- Postgres for household-scoped tables;
- Supabase Auth for sessions;
- **Row Level Security** as the authorization implementation;
- client uses the publishable/anon key only; service role stays server-side.

The application talks to a persistence **port**. The Supabase SDK is an adapter. Domain code never imports `@supabase/supabase-js`.

Realtime is available and **not used in V1** (see 0003).

## Consequences

- Schema changes go through migrations (`supabase migration new …` when that tooling is added).
- Every exposed table enables RLS and gets deny/allow tests.
- Views that expose financial data must use `security_invoker` (Postgres 15+) or equivalent.
- Authorization data must not live in user-editable `user_metadata`.
- Phase 0 does **not** provision a project; that is slice-1 work.
