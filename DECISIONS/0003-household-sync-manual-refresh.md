# 0003 — Household sync: server authority, manual refresh, optimistic concurrency

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

Two adults edit one budget on two phones. True realtime is not mandatory. Correctness and a simple mental model beat impressive live updates. Optimistic UI that shows a save which never reached the server is unacceptable. Silent last-write-wins on money is a product bug: one partner’s allocation can vanish without a word.

## Decision

- Postgres is authoritative.
- V1 uses **manual refresh** (and a refresh after successful save). No Supabase Realtime subscriptions.
- Money mutations (income, allocation, spend, bills, extras, close) use **month-level optimistic concurrency**: commands send `expectedRevision`. Mismatch → **409** plus the current view. The loser refreshes and retries. This is **not** silent last-write-wins.
- Low-risk catalogue edits (category rename) may last-write-wins on that row.
- **No optimistic financial writes.** The UI may show a spinner; it may not show the new allocation as saved until the server confirms.
- Duplicate submit: client mints a `commandId` per gesture; the server stores it with the write. Retry the same id, do not mint a second spend.
- Offline writes are out of V1. Stale cached reads, if shown, are labelled stale.

## Why not realtime / CRDT / operational transform

Two users, one budget, low edit rate. Realtime adds reconnect, presence, and conflict UI we do not need. CRDTs are the wrong tool for “the rent is €900”.

## Consequences

- Second-phone tests are “save on A, refresh on B”.
- Two concurrent `SetIncome` with the same revision: one succeeds, one 409.
- Revisit realtime only if missed refreshes become a real household pain.
