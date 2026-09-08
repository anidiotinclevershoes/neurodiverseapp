# 0011 — Public host is a Vite SPA plus Hono API (Vercel-shaped)

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

Phase 1A was LAN-only. Phase 1B needs a public HTTPS URL for two phones. The spine still uses a command API so the browser never holds the database password or service role.

## Decision

- Ship the UI as a Vite static build.
- Ship the same Hono command API (`createHttpApp`) as a Node server.
- Prefer **Vercel** (static Vite build + Node serverless function). The function is **bundled** from `src/server/vercel-entry.ts` into `api/index.js` at build time. Vercel’s transpile-only emit would leave `.ts` imports that Node cannot load.
- A single Node process (`SERVE_WEB=1 npm start`) is the fallback host.
- Browser env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` only.
- Server **runtime** env: `DATABASE_URL` (required — direct Postgres adapter), `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Service role is test/ops only and is not required to run the app.
- Migrations: `HOSTED_DATABASE_URL` or the same `DATABASE_URL` (session port 5432 if the pooler rejects migration SQL).

## Consequences

- Same-origin `/month` and `/households` avoid CORS on the public site.
- `npm run build` emits the SPA and the Node function. CI loads that function with Node (not tsx) so a `.ts` import cannot pass.
- Rollback is a previous deploy, not a schema undo.
- Local `npm run dev` still proxies the API; production does not need `VITE_API_URL`.
