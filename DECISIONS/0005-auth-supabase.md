# 0005 — Auth: Supabase Auth, magic link, equal members

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

The first household is two adults on personal phones. We need real authentication and server-side membership checks without building an identity platform. This is sensitive financial *planning* data, not a bank.

## Decision

- **Supabase Auth** with **email magic link** as the V1 sign-in (password auth is the fallback if deliverability fails — see `KNOWN_ISSUES.md`).
- Sessions are Supabase-managed JWTs; treat expiry as a first-class UI failure.
- Household membership is a **row in `household_members`**, verified in RLS with `auth.uid()`.
- V1 members are **equal**. No admin/guest roles.
- V1 invite: a signed-in member can add the other user’s id/email after that user has an account. No public unguessable-join-link v1 unless we later need it; a guessable household id must never grant access.
- Do not implement MFA as mandatory for V1. Do not implement social OAuth unless magic link proves painful.

## Consequences

- Isolation tests are part of the first vertical slice.
- Client code never uses the service-role key to “just attach” a membership.
- Revoking membership (future) must be tested; JWT expiry is not enough if a still-valid token would otherwise keep reading rows — RLS membership check handles that on each query.
