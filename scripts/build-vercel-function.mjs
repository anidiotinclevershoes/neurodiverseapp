import * as esbuild from "esbuild";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "api/index.js");

await mkdir(join(root, "api"), { recursive: true });
await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(root, "src/server/vercel-entry.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile,
  packages: "external",
  logLevel: "info",
});
