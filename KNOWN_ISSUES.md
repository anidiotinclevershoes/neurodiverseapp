# KNOWN_ISSUES.md

**Status:** current  
**Last verified:** 2026-09-05  
**Kind:** current debt, bugs, and concerns (not a changelog)

---

## Bugs

None known in the local Phase 1B gates.

---

## Technical debt

| ID | Item | Severity | Notes |
| --- | --- | --- | --- |
| TD-03 | ESLint is not type-aware | Low | `tsc` is the type gate |
| TD-04 | Money V1 is two-decimal only | Low | Unchanged |
| TD-05 | Headline vs `planSafe` | Info | Unchanged |
| TD-07 | Income is a column, not `month_incomes` lines | Low | Unchanged |
| TD-08 | Password, not OTP | Low | Now via Supabase Auth (ADR 0010), not custom JWT |
| TD-09 | Add-member does not require the invitee to confirm | Low | Existing Auth email only; unknown emails silent |
| TD-10 | UI month is hard-coded August 2026 | Low | Unchanged |
| TD-11 | Synthetic payday account in the mapper | Info | Unchanged |
| TD-12 | `processed_commands` idempotency table not built | Low | Unchanged |
| TD-13 | Email confirmation stays disabled | Info | **Private V1 decision — revisit before any public or untrusted-user release.** Not a missing feature. |

---

## Architectural concerns

| ID | Item | Severity | Notes |
| --- | --- | --- | --- |
| AC-01 | Hosted project must be provisioned outside this repo | Medium | Code is ready; secrets are not committed |
| AC-03 | Public URL depends on linking a host (Vercel or `SERVE_WEB=1`) | Medium | `vercel.json` + `api/index.ts` are in tree |
| AC-05 | `private.member_household_ids` is SECURITY DEFINER | Info | Unchanged; not in `public` |
| AC-06 | Supabase Auth may still reveal registered emails on sign-up | Low | Platform behaviour; we do not add our own user table |

---

## Phase 1B security review

Checked in code (ADR 0013):

- Production adapter runs as `authenticated` with the signed-in JWT `sub`. RLS is the isolation boundary.
- `authenticated` may SELECT/INSERT/UPDATE rows that policies allow. Data API writes are rejected unless `app.command_adapter=1`.
- Membership via `household_members` + `auth.uid()`.
- Command API verifies Supabase `getUser` and builds a per-request store. Custom JWT issuer deleted.
- Browser env is publishable URL + anon key only. `DATABASE_URL` is server/runtime only.
- Shim cannot apply to `supabase.co`.
- Add-member unknown emails remain a silent no-op.
- Bundle CI grep forbids `service_role` / `JWT_SECRET`.
- Email confirmation is intentionally off for the trusted household.

Must re-check on a live project: hosted suite (`NDAPP_HOSTED_TESTS=1`), service-role not in Vercel `VITE_*`, Confirm email still disabled.

## Explicitly rejected (do not reintroduce)

- Custom password hashing / JWT minting
- `app_users` as identity
- Applying `supabase/shims/` to hosted Supabase
- Client writes to budget tables
- Payday / spend / realtime
