# 0001 — Delivery: mobile-first web app, not native, not a heavy PWA

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

V1 must work on an iPhone 13 and a Nothing Phone (3a). Users are neurodivergent adults; opening the app should not be a ritual. We need speed, reliability, and a path to iOS/Android later without rewriting budget math.

Options considered: responsive web, PWA, Expo/React Native, Capacitor.

## Decision

Ship V1 as a **mobile-first TypeScript web app** (Vite + React when UI work starts). Users open a URL (and may bookmark it).

- Do **not** start with Expo/React Native.
- Do **not** build a service-worker offline PWA in V1.
- Keep `src/domain` UI-agnostic so a later native shell is a UI change, not an engine rewrite.

## Why not the others

- **Expo now:** native notifications/widgets/store are not V1. Expo adds build/signing/store surface before we have a product. Expo web is not a better V1 than Vite for a form-heavy planning app.
- **PWA-first:** Android install is fine; iOS Add-to-Home-Screen is a multi-step Safari share-sheet (high executive-function cost). iOS web push is gated on that install, missing in some EU cases, and storage can be evicted. A PWA would not remove the need for a server and would not make two-phone sync easier.
- **Capacitor now:** wraps the web app for stores without helping V1. Revisit if we need a store binary without rewriting UI.

## Revisit when

Reliable iOS payday reminders, home-screen widgets, or store distribution become product requirements. Then evaluate Expo as a **shell around the existing domain**, not a greenfield rewrite.

## Consequences

- First-device testing is the mobile browser (Safari, Chrome).
- Playwright is the future E2E tool, not Maestro/Detox.
- “Install the app” copy in V1 means “open this link / add a bookmark”, not App Store.
