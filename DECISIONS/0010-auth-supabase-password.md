# 0010 — V1 sign-in is Supabase Auth email + password

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

ADR 0005 chose email OTP. Phase 1A implemented a temporary custom password+JWT against `app_users`. Phase 1B must use real Supabase Auth. OTP needs reliable email delivery and is awkward on phones when mail is delayed or scanned. This environment cannot receive household OTP emails during automated proof.

## Decision

- **Supabase Auth** is the only identity provider.
- V1 sign-in is **email + password** (`signInWithPassword` / `signUp`).
- The command API authenticates with `supabase.auth.getUser(accessToken)`. Phase 1A custom hashing and JWT issuance are **deleted**.
- OTP / magic link remains a later improvement, not a second live path.
- Membership is still a `household_members` row. `user_metadata` is ignored.

This supersedes the OTP-as-V1-primary clause of ADR 0005. The rest of 0005 (equal members, no join codes, re-check membership) still stands.

## Consequences

- First household can sign in without waiting for mail.
- Hosted tests can create users with the Admin API and sign in with a password.
- **Private V1 decision — revisit before any public or untrusted-user release.** Email confirmation stays disabled so `signUp` returns a session. This is intentional low friction for a trusted household, not an oversight. Isolation is RLS, not a mailbox click. Reassess confirmation and account-enumeration controls before any public launch. See ADR 0013.
