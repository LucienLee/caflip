// ABOUTME: Tests provider registry contract for Claude and Codex adapters.
// ABOUTME: Ensures each provider exposes the expected operation surface.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getProvider, providers } from "../src/providers";
import { makeJwt } from "./helpers/provider-fixtures";

describe("provider adapter registry", () => {
  test("registers both claude and codex providers", () => {
    expect(providers.claude.name).toBe("claude");
    expect(providers.codex.name).toBe("codex");
  });

  test("exposes required methods for each provider", () => {
    for (const provider of [providers.claude, providers.codex]) {
      expect(typeof provider.login.buildCommand).toBe("function");
      expect(typeof provider.login.verifyLogin).toBe("function");
      expect(typeof provider.usesAccountConfig).toBe("boolean");
      expect(typeof provider.getCurrentAccountEmail).toBe("function");
      expect(typeof provider.getCurrentAccount).toBe("function");
      expect(typeof provider.readActiveAuth).toBe("function");
      expect(typeof provider.writeActiveAuth).toBe("function");
      expect(typeof provider.clearActiveAuth).toBe("function");
      expect(typeof provider.readActiveConfig).toBe("function");
      expect(typeof provider.writeActiveConfig).toBe("function");
      expect(typeof provider.clearActiveConfig).toBe("function");
      expect(typeof provider.readAccountAuth).toBe("function");
      expect(typeof provider.writeAccountAuth).toBe("function");
      expect(typeof provider.deleteAccountAuth).toBe("function");
      expect(typeof provider.readAccountConfig).toBe("function");
      expect(typeof provider.writeAccountConfig).toBe("function");
      expect(typeof provider.deleteAccountConfig).toBe("function");
    }
  });

  test("getProvider returns provider by name", () => {
    expect(getProvider("claude").name).toBe("claude");
    expect(getProvider("codex").name).toBe("codex");
  });

  test("providers expose symmetric login command builders", () => {
    expect(getProvider("claude").login.buildCommand([])).toEqual(["claude", "auth", "login"]);
    expect(getProvider("codex").login.buildCommand([])).toEqual(["codex", "login"]);
  });

  test("Claude current account exposes email and accountId from config", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-claude-current-account-"));
    const originalHome = process.env.HOME;
    const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

    try {
      process.env.HOME = testHome;
      const claudeDir = join(testHome, ".claude");
      process.env.CLAUDE_CONFIG_DIR = claudeDir;
      mkdirSync(claudeDir, { recursive: true, mode: 0o700 });
      writeFileSync(
        join(claudeDir, ".claude.json"),
        JSON.stringify(
          {
            oauthAccount: {
              emailAddress: "claude@test.com",
              accountUuid: "uuid-123",
            },
          },
          null,
          2
        )
      );

      expect(providers.claude.getCurrentAccount()).toEqual({
        email: "claude@test.com",
        accountId: "uuid-123",
      });
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      if (originalClaudeConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
      } else {
        process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
      }
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  test("Claude login verification accepts logged-in JSON status with email", async () => {
    const result = await providers.claude.login.verifyLogin(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        loggedIn: true,
        email: "lucien@aibor.io",
        authMethod: "claude.ai",
      }),
      stderr: "",
      signal: null,
    }));

    expect(result).toEqual({
      ok: true,
      email: "lucien@aibor.io",
      details: {
        authMethod: "claude.ai",
        orgId: undefined,
        orgName: undefined,
        subscriptionType: undefined,
      },
    });
  });

  test("Claude login verification rejects logged-out JSON status", async () => {
    const result = await providers.claude.login.verifyLogin(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        loggedIn: false,
      }),
      stderr: "",
      signal: null,
    }));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected Claude verification to fail");
    }
    expect(result.reason).toContain("logged out");
  });

  test("Claude login verification rejects invalid JSON status", async () => {
    const result = await providers.claude.login.verifyLogin(async () => ({
      exitCode: 0,
      stdout: "{not-json",
      stderr: "",
      signal: null,
    }));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected Claude verification to fail");
    }
    expect(result.reason).toContain("invalid JSON");
  });

  test("Codex login verification requires logged-in status and readable auth email", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-codex-login-"));
    const originalHome = process.env.HOME;

    try {
      process.env.HOME = testHome;
      const codexDir = join(testHome, ".codex");
      mkdirSync(codexDir, { recursive: true, mode: 0o700 });

      const idToken = makeJwt({
        email: "codex@test.com",
        "https://api.openai.com/auth": {
          chatgpt_account_id: "acct_123",
        },
      });

      writeFileSync(
        join(codexDir, "auth.json"),
        JSON.stringify(
          {
            tokens: {
              id_token: idToken,
              account_id: "acct_123",
            },
          },
          null,
          2
        )
      );

      const result = await providers.codex.login.verifyLogin(async () => ({
        exitCode: 0,
        stdout: "status output changed upstream",
        stderr: "",
        signal: null,
      }));

      expect(result).toEqual({
        ok: true,
        email: "codex@test.com",
        details: {
          accountId: "acct_123",
        },
      });
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  test("Codex login verification rejects API key auth sessions", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-codex-apikey-login-"));
    const originalHome = process.env.HOME;

    try {
      process.env.HOME = testHome;
      const codexDir = join(testHome, ".codex");
      mkdirSync(codexDir, { recursive: true, mode: 0o700 });

      writeFileSync(
        join(codexDir, "auth.json"),
        JSON.stringify(
          {
            auth_mode: "apikey",
            OPENAI_API_KEY: "sk-test",
          },
          null,
          2
        )
      );

      const result = await providers.codex.login.verifyLogin(async () => ({
        exitCode: 0,
        stdout: "Logged in using an API key",
        stderr: "",
        signal: null,
      }));

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error("Expected Codex API key verification to fail");
      }
      expect(result.reason).toContain("API key");
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      rmSync(testHome, { recursive: true, force: true });
    }
  });
});
