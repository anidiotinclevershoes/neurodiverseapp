# 0003 — Household sync: server authority, manual refresh, last-write-wins

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

Two adults edit one budget on two phones. True realtime is not mandatory. Correctness and a simple mental model beat impressive live updates. Optimistic UI that shows a save which never reached the server is unacceptable.

## Decision

- Postgres is authoritative.
- V1 uses **manual refresh** (and a refresh after successful save). No Supabase Realtime subscriptions.
- Concurrent edits use **last-write-wins** on a row, plus a monotonic **`revision`**. Saves send `expectedRevision`. If it does not match, the application refuses (or asks to reload) rather than clobbering quietly.
- **No optimistic financial writes.** The UI may show a spinner; it may not show the new allocation as saved until the server confirms.
- Offline writes are out of V1. Stale cached reads, if shown, are labelled stale.

## Why not realtime / CRDT / operational transform

Two users, one budget, low edit rate. Realtime adds reconnect, presence, and conflict UI we do not need. CRDTs are the wrong tool for “the rent is €900”.

## Consequences

- Second-phone tests are “save on A, refresh on B”.
- We still need a visible “this copy is stale” path, or two people will think they both saved.
- Revisit realtime only if missed refreshes become a real household pain.
