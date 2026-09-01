# 0011 — Public host is a Vite SPA plus Hono API (Vercel-shaped)

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

Phase 1A was LAN-only. Phase 1B needs a public HTTPS URL for two phones. The spine still uses a command API so the browser never holds the database password or service role.

## Decision

- Ship the UI as a Vite static build.
- Ship the same Hono command API (`createHttpApp`) as a Node server.
- Prefer **Vercel** (static + Node serverless `api/index.ts`) when a Vercel project is linked.
- A single Node process (`SERVE_WEB=1 npm start`) is the fallback host.
- Browser env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` only.
- Server env: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Service role is test/ops only.

## Consequences

- Same-origin `/month` and `/households` avoid CORS on the public site.
- Rollback is a previous deploy, not a schema undo.
- Local `npm run dev` still proxies the API; production does not need `VITE_API_URL`.
