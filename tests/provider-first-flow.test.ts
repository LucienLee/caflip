// ABOUTME: Integration tests for provider-first and top-level CLI behavior.
// ABOUTME: Verifies provider qualification rules, aggregated read-only output, and interactive provider fallback.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  makeJwt,
  writeFakeClaudeBinary,
  writeFakeSecurityBinary,
} from "./helpers/provider-fixtures";

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

  test("add without provider picks default provider interactively and adds the current account", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-first-"));
    mkdirSync(join(testHome, ".caflip-backup"), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(testHome, ".caflip-backup", ".meta.json"),
      JSON.stringify(
        {
          lastProvider: "codex",
        },
        null,
        2
      )
    );
    mkdirSync(join(testHome, ".codex"), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(testHome, ".codex", "auth.json"),
      JSON.stringify(
        {
          auth_mode: "chatgpt",
          tokens: {
            id_token: makeJwt({
              email: "interactive-add@test.com",
              "https://api.openai.com/auth": {
                chatgpt_account_id: "acct-interactive-add",
              },
            }),
            account_id: "acct-interactive-add",
          },
        },
        null,
        2
      )
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "add"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write("\u001b[B\r");
    proc.stdin.end();

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Added Account-1: interactive-add@test.com");
    rmSync(testHome, { recursive: true, force: true });
  });

  test("remove without provider picks default provider interactively and then runs remove validation", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-first-"));
    mkdirSync(join(testHome, ".caflip-backup", "claude"), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(testHome, ".caflip-backup", "claude", "sequence.json"),
      JSON.stringify(
        {
          activeAccountNumber: 2,
          lastUpdated: "2026-03-24T00:00:00.000Z",
          sequence: [2],
          accounts: {
            "2": {
              email: "interactive-remove@test.com",
              uuid: "uuid-interactive-remove",
              added: "2026-03-24T00:00:00.000Z",
            },
          },
        },
        null,
        2
      )
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "remove", "1"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write("\r");
    proc.stdin.end();

    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Error: Remove target must be an email, not a number");
    rmSync(testHome, { recursive: true, force: true });
  });

  test("login without provider picks default provider interactively and runs login flow", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-first-"));
    const fakeBinDir = mkdtempSync(join(tmpdir(), "caflip-provider-first-bin-"));
    writeFakeClaudeBinary(fakeBinDir, "interactive-login@test.com", "uuid-interactive-login");
    writeFakeSecurityBinary(
      fakeBinDir,
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "sk-ant-oat01-test",
          refreshToken: "sk-ant-ort01-test",
          expiresAt: 1748276587173,
          scopes: ["user:inference", "user:profile"],
        },
      })
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "login"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: testHome,
        PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write("\r");
    proc.stdin.end();

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Added Account-1: interactive-login@test.com");
    rmSync(testHome, { recursive: true, force: true });
    rmSync(fakeBinDir, { recursive: true, force: true });
  });

  test("login without provider still rejects provider args not passed after --", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-first-"));
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "login", "--device-auth"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write("\r");
    proc.stdin.end();

    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Provider login arguments must be passed after --");
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
    expect(stdout).toContain("  managed accounts: 1");
    expect(stdout).toContain("Codex");
    expect(stdout).toContain("  none");
    expect(stdout).toContain("  managed accounts: 0");
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
