The Vercel Node function is generated from `src/server/vercel-entry.ts`.

`npm run build` rewrites `api/index.js`. Commit that file so Vercel always
has a Node-loadable entry (it cannot import `.ts` sources). CI fails if the
committed bundle is stale.

