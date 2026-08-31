# 0005 — Auth: Supabase Auth, email OTP, equal members

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

The first household is two adults on personal phones. We need real authentication and server-side membership checks without building an identity platform. This is sensitive financial *planning* data, not a bank. Magic-link URLs are consumed by some email scanners on mobile; a short OTP avoids that footgun and avoids App Links as a Phase 0 dependency.

## Decision

- **Supabase Auth** (or equivalent) with **email one-time code** as the V1 sign-in. Codes are hashed, single-use, short TTL, rate-limited. Password is the fallback if email delivery is unusable (see `KNOWN_ISSUES.md`).
- Sessions must be **revocable**. Membership is re-checked on **every** request (RLS + application). A still-valid login token does not keep household access after membership is gone.
- Household membership is a **row in `household_members`**, never user-editable JWT `user_metadata`, never a client-supplied `household_id` grant.
- V1 members are **equal**. No admin/guest roles. `created_by` is audit, not privilege.
- V1 invite: member A enters B’s **email**; B signs in with that email and **confirms** join. No fridge codes, no join-by-household-id, no auto-join. Cap can wait until a third person exists; do not ship unbounded links.
- Do not implement MFA as mandatory for V1. Do not add social OAuth unless OTP proves painful (if we do, Sign in with Apple is required on iOS).

## Consequences

- Isolation tests (including revoked membership with the same session) are part of the first vertical slice.
- Client code never uses the service-role key to “just attach” a membership.
- Failed OTP responses must not reveal whether an email is registered.
