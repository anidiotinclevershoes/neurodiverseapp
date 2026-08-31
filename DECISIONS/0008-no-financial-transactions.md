# 0008 — No financial transactions, no payment or banking SDKs

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

NDApp recommends and tracks household money movement. It must never perform that movement. Payment and Open Banking APIs would make it easy to “just complete the transfer” later and would expand threat surface for no V1 value.

## Decision

- Do not add Stripe, payment processors, Open Banking, bank-link, or payout SDKs.
- Do not store bank credentials or payment-card numbers.
- Transfers in the domain are **recommendations** (from payday account to bill accounts). Completing them is a user action outside NDApp, optionally ticked off as a manual record in a later slice.
- Statement import, if it ever happens, is read-only classification and must not execute payments. It is not scheduled.

## Consequences

- Architecture review of any dependency that touches money movement is a hard stop.
- PCI / banking-licence complexity is out of scope.
- Product copy must not imply NDApp paid a bill.
