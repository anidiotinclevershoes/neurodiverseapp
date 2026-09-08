import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "api/index.js");
const source = readFileSync(file, "utf8");

if (/(?:from|import)\s+['"][^'"]+\.ts['"]/.test(source)) {
  console.error("Vercel function still imports .ts source files. Node cannot load those on Vercel.");
  process.exit(1);
}

if (source.includes("../src/server/http.")) {
  console.error("Vercel function still points at src/server/http rather than inlining the application.");
  process.exit(1);
}

process.env.DATABASE_URL ??= "postgres://ndapp:ndapp@127.0.0.1:5432/ndapp";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";

const mod = await import(pathToFileURL(file).href);
const handler = mod.default;
if (typeof handler !== "function") {
  console.error("Vercel function default export is not a request handler");
  process.exit(1);
}

const health = await handler(new Request("http://ndapp.local/health"));
if (health.status !== 200) {
  console.error(`/health expected 200, got ${health.status}`);
  process.exit(1);
}

const households = await handler(new Request("http://ndapp.local/households"));
if (households.status !== 401) {
  console.error(`/households expected 401 from application auth, got ${households.status}`);
  process.exit(1);
}

console.log("vercel function ok", { health: health.status, households: households.status });
