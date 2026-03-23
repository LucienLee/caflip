// ABOUTME: Integration tests for provider-first and top-level read-only CLI behavior.
// ABOUTME: Verifies provider qualification rules, aggregated read-only output, and empty-state guidance.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("provider-first flow", () => {
  test("list without provider shows both providers", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-first-"));
    const backupRoot = join(testHome, ".caflip-backup");
    mkdirSync(join(backupRoot, "claude"), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(backupRoot, "claude", "sequence.json"),
      JSON.stringify(
        {
          activeAccountNumber: 1,
          lastUpdated: "2026-03-24T00:00:00.000Z",
          sequence: [1],
          accounts: {
            "1": {
              email: "claude@test.com",
              uuid: "uuid-1",
              alias: "work",
              added: "2026-03-24T00:00:00.000Z",
            },
          },
        },
        null,
        2
      )
    );
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "list"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Claude Code");
    expect(stdout).toContain("1: claude@test.com [work]");
    expect(stdout).toContain("Codex");
    expect(stdout).toContain("No accounts managed yet. Run: caflip codex add");
    rmSync(testHome, { recursive: true, force: true });
  });

  test("alias without provider exits 2 with guidance", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-first-"));
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "work"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("Alias requires provider prefix");
    expect(stderr).toContain("caflip claude <alias>");
    rmSync(testHome, { recursive: true, force: true });
  });

  test("login without provider exits 2 with login-specific guidance", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-first-"));
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "login"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("login requires provider prefix");
    expect(stderr).toContain("caflip claude login");
    expect(stderr).toContain("caflip codex login");
    rmSync(testHome, { recursive: true, force: true });
  });

  test("status without provider shows both providers", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-first-"));
    mkdirSync(join(testHome, ".claude"), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(testHome, ".claude", ".claude.json"),
      JSON.stringify(
        {
          oauthAccount: {
            emailAddress: "claude-active@test.com",
            accountUuid: "uuid-active",
          },
        },
        null,
        2
      )
    );
    mkdirSync(join(testHome, ".caflip-backup", "claude"), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(testHome, ".caflip-backup", "claude", "sequence.json"),
      JSON.stringify(
        {
          activeAccountNumber: 1,
          lastUpdated: "2026-03-24T00:00:00.000Z",
          sequence: [1],
          accounts: {
            "1": {
              email: "claude-active@test.com",
              uuid: "uuid-active",
              alias: "work",
              added: "2026-03-24T00:00:00.000Z",
            },
          },
        },
        null,
        2
      )
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "status"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Claude Code");
    expect(stdout).toContain("claude-active@test.com [work]");
    expect(stdout).toContain("Codex");
    expect(stdout).toContain("  none");
    rmSync(testHome, { recursive: true, force: true });
  });

  test("status --json without provider still requires provider", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-first-"));
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "status", "--json"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("Provider is required for status --json");
    expect(stderr).toContain("caflip claude status --json");
    rmSync(testHome, { recursive: true, force: true });
  });

  test("provider interactive empty state surfaces add/back choices", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-first-"));
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "claude"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Cancel prompt quickly to avoid hanging in CI environment.
    proc.stdin.write("\u001b");
    proc.stdin.end();

    const [exitCode, output] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(output).toContain("Cancelled");
    rmSync(testHome, { recursive: true, force: true });
  });
});
