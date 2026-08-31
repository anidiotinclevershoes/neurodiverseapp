# KNOWN_ISSUES.md

**Status:** current  
**Last verified:** 2026-08-31  
**Kind:** current debt, bugs, and concerns (not a changelog)

---

## Bugs

None known in the Phase 1A spine tests.

---

## Technical debt

| ID | Item | Severity | Notes |
| --- | --- | --- | --- |
| TD-03 | ESLint is not type-aware | Low | `tsc` is the type gate |
| TD-04 | Money V1 is two-decimal only | Low | Unchanged |
| TD-05 | Headline vs `planSafe` | Info | Unchanged; extras still not in the engine |
| TD-07 | Income is a column, not `month_incomes` lines | Low | Slice chose the smaller table |
| TD-08 | Password JWT, not OTP | Medium | ADR 0009. No session-revocation table |
| TD-09 | Add-member does not require the invitee to confirm | Low | Existing account email only; unknown emails are a silent no-op so mailboxes are not enumerable |
| TD-10 | UI month is hard-coded August 2026 | Low | Matches the first real month; not a picker |
| TD-11 | Synthetic payday account in the mapper | Info | No accounts table in this slice |
| TD-12 | `processed_commands` idempotency table not built | Low | UI disables Save while saving |

---

## Architectural concerns

| ID | Item | Severity | Notes |
| --- | --- | --- | --- |
| AC-01 | Hosted Supabase not provisioned | Medium | Schema is Supabase-shaped; CI uses Postgres 16 |
| AC-03 | No public deploy | Medium | Phones must hit a LAN `npm run dev` until hosting exists |
| AC-05 | `private.member_household_ids` is SECURITY DEFINER | Info | Required to avoid RLS recursion; lives outside `public` |
| AC-06 | Sign-up duplicate email returns a generic 400 | Low | Hostile clients can still probe whether an email is registered |

---

## Phase 1A security review

Checked and accepted for this slice:

- RLS enabled on household-owned tables and `app_users`.
- Membership via `household_members` + `private.member_household_ids()`; client “I am a member” is ignored.
- Role `ndapp_authenticated` has SELECT only; hostile UPDATE is denied.
- No Supabase service-role (or any DB secret) in the browser bundle. The UI talks to the command API with a user JWT.
- Auth required on `/month` and `/households`.
- Money parsed with `parseMajorToMinor` before persist.
- No public join codes; unknown add-member emails are a silent no-op.
- API error bodies are generic; amounts and tokens are not logged.

Logged, not blocking: AC-01, AC-03, AC-06, TD-08.

## Explicitly rejected (do not reintroduce)

- Spend ledger / payday checklist in this slice
- Client writes to budget tables
- Realtime
- Monorepo / empty hexagonal folders
- Service-worker PWA
