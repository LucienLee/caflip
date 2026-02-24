// ABOUTME: Tests Codex provider auth storage and current account resolution for MVP.
// ABOUTME: Covers read/write/clear auth.json and id_token-based identity parsing.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  clearCodexActiveAuth,
  getCodexCurrentAccount,
  readCodexActiveAuth,
  writeCodexActiveAuth,
} from "../src/providers/codex";

const originalHome = process.env.HOME;
let testHome = "";

function toBase64Url(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${toBase64Url({ alg: "none", typ: "JWT" })}.${toBase64Url(payload)}.sig`;
}

afterEach(() => {
  process.env.HOME = originalHome;
  if (testHome) {
    rmSync(testHome, { recursive: true, force: true });
    testHome = "";
  }
});

describe("codex provider auth storage", () => {
  test("reads empty when auth.json is missing", async () => {
    testHome = mkdtempSync(join(tmpdir(), "caflip-codex-provider-"));
    process.env.HOME = testHome;

    expect(await readCodexActiveAuth()).toBe("");
  });

  test("writes and reads auth payload", async () => {
    testHome = mkdtempSync(join(tmpdir(), "caflip-codex-provider-"));
    process.env.HOME = testHome;
    const raw = JSON.stringify({ auth_mode: "chatgpt", tokens: { id_token: "x.y.z" } });

    await writeCodexActiveAuth(raw);

    expect(await readCodexActiveAuth()).toBe(raw);
    expect(existsSync(join(testHome, ".codex", "auth.json"))).toBe(true);
  });

  test("clears auth payload", async () => {
    testHome = mkdtempSync(join(tmpdir(), "caflip-codex-provider-"));
    process.env.HOME = testHome;
    await writeCodexActiveAuth(JSON.stringify({ auth_mode: "chatgpt" }));

    await clearCodexActiveAuth();

    expect(await readCodexActiveAuth()).toBe("");
  });
});

describe("codex provider current account", () => {
  test("returns null when auth file is missing", () => {
    testHome = mkdtempSync(join(tmpdir(), "caflip-codex-provider-"));
    process.env.HOME = testHome;
    expect(getCodexCurrentAccount()).toBeNull();
  });

  test("parses email and account id from id_token payload", async () => {
    testHome = mkdtempSync(join(tmpdir(), "caflip-codex-provider-"));
    process.env.HOME = testHome;
    const jwt = makeJwt({
      email: "codex@test.com",
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-123" },
    });
    await writeCodexActiveAuth(
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: { id_token: jwt, account_id: "acct-fallback" },
      })
    );

    expect(getCodexCurrentAccount()).toEqual({
      email: "codex@test.com",
      accountId: "acct-123",
    });
  });

  test("returns null on malformed auth payload", async () => {
    testHome = mkdtempSync(join(tmpdir(), "caflip-codex-provider-"));
    process.env.HOME = testHome;
    await writeCodexActiveAuth("not-json");
    expect(getCodexCurrentAccount()).toBeNull();
  });
});
