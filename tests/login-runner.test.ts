// ABOUTME: Tests unified provider login command composition and subprocess execution.
// ABOUTME: Verifies login runner behavior without invoking real provider logins.

import { describe, expect, test } from "bun:test";
import { runCapturedCommand, runLoginCommand } from "../src/login/runner";
import { providers } from "../src/providers";

describe("login runner command composition", () => {
  test("builds Claude login command with passthrough args", () => {
    expect(providers.claude.login.buildCommand(["--email", "lucien@aibor.io", "--sso"])).toEqual([
      "claude",
      "auth",
      "login",
      "--email",
      "lucien@aibor.io",
      "--sso",
    ]);
  });

  test("builds Codex login command with passthrough args", () => {
    expect(providers.codex.login.buildCommand(["--device-auth"])).toEqual([
      "codex",
      "login",
      "--device-auth",
    ]);
  });
});

describe("login runner subprocess execution", () => {
  test("returns subprocess exit code for inherited-stdio login commands", async () => {
    const result = await runLoginCommand([
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
  });

  test("reports non-zero exit codes", async () => {
    const result = await runLoginCommand([
      process.execPath,
      "-e",
      "process.exit(7)",
    ]);

    expect(result.exitCode).toBe(7);
    expect(result.signal).toBeNull();
  });

  test("captures stdout and stderr for provider verification helpers", async () => {
    const result = await runCapturedCommand([
      process.execPath,
      "-e",
      "console.log('ok'); console.error('warn');",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("ok");
    expect(result.stderr).toBe("warn");
  });

  test("times out captured verification helpers that hang", async () => {
    const result = await runCapturedCommand(
      [process.execPath, "-e", "setTimeout(() => {}, 1000)"],
      { timeoutMs: 20 }
    );

    expect(result.exitCode).toBe(124);
    expect(result.stderr).toContain("timed out");
  });
});
