import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRIVATE_V1_EMAIL_CONFIRMATION_REQUIRED } from "./supabase-browser.ts";

const root = dirname(fileURLToPath(import.meta.url));

describe("private V1 password auth path", () => {
  it("keeps email confirmation disabled and uses Supabase password methods", () => {
    expect(PRIVATE_V1_EMAIL_CONFIRMATION_REQUIRED).toBe(false);
    const app = readFileSync(join(root, "App.tsx"), "utf8");
    expect(app).toContain("signInWithPassword({ email, password })");
    expect(app).toContain("signUp({ email, password })");
    expect(app).not.toContain("verifyOtp");
    expect(app).not.toContain("/auth/sign-up");
    expect(app).not.toContain("JWT_SECRET");
  });
});
