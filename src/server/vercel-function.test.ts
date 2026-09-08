import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function runNode(script: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://ndapp:ndapp@127.0.0.1:5432/ndapp",
      SUPABASE_URL: process.env.SUPABASE_URL ?? "https://example.supabase.co",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "test-anon-key",
    },
  });
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

describe("Vercel function packaging", () => {
  it("transpile-only emit keeps .ts imports (the production crash mode)", async () => {
    const result = await esbuild.build({
      absWorkingDir: root,
      entryPoints: [join(root, "src/server/vercel-entry.ts")],
      bundle: false,
      write: false,
      format: "esm",
      platform: "node",
    });
    const naive = result.outputFiles[0]?.text ?? "";
    expect(naive).toMatch(/from ["'][^"']+\.ts["']/);
  });

  it("bundled function loads under Node and reaches /health and /households", () => {
    const built = runNode("scripts/build-vercel-function.mjs");
    expect(built.status, built.output).toBe(0);
    const js = readFileSync(join(root, "api/index.js"), "utf8");
    expect(js).not.toMatch(/(?:from|import)\s+['"][^'"]+\.ts['"]/);
    const probed = runNode("scripts/probe-vercel-function.mjs");
    expect(probed.status, probed.output).toBe(0);
    expect(probed.output).toContain("health: 200");
    expect(probed.output).toContain("households: 401");
  });
});
