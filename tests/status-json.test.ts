// ABOUTME: Integration tests for provider-qualified status JSON output.
// ABOUTME: Ensures status --json reports provider, email, alias, and managed fields.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("status --json", () => {
  test("claude status --json returns structured payload", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-status-json-"));

    const claudeConfigPath = join(testHome, ".claude.json");
    await Bun.write(
      claudeConfigPath,
      JSON.stringify(
        {
          oauthAccount: {
            emailAddress: "claude-a@test.com",
            accountUuid: "uuid-a",
          },
        },
        null,
        2
      )
    );

    const claudeBackupDir = join(testHome, ".caflip-backup", "claude");
    mkdirSync(claudeBackupDir, { recursive: true, mode: 0o700 });
    await Bun.write(
      join(claudeBackupDir, "sequence.json"),
      JSON.stringify(
        {
          activeAccountNumber: 1,
          lastUpdated: "2026-01-01T00:00:00.000Z",
          sequence: [1],
          accounts: {
            "1": {
              email: "claude-a@test.com",
              uuid: "uuid-a",
              added: "2026-01-01T00:00:00.000Z",
              alias: "work",
            },
          },
        },
        null,
        2
      )
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "claude", "status", "--json"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.trim()) as {
      provider: string;
      email: string | null;
      alias: string | null;
      managed: boolean;
    };
    expect(payload.provider).toBe("claude");
    expect(payload.email).toBe("claude-a@test.com");
    expect(payload.alias).toBe("work");
    expect(payload.managed).toBe(true);
    rmSync(testHome, { recursive: true, force: true });
  });

  test("claude status --json respects CLAUDE_CONFIG_DIR", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-status-json-home-"));
    const configRoot = mkdtempSync(join(tmpdir(), "caflip-status-json-config-"));

    await Bun.write(
      join(configRoot, ".claude.json"),
      JSON.stringify(
        {
          oauthAccount: {
            emailAddress: "claude-config@test.com",
            accountUuid: "uuid-config",
          },
        },
        null,
        2
      )
    );

    const claudeBackupDir = join(testHome, ".caflip-backup", "claude");
    mkdirSync(claudeBackupDir, { recursive: true, mode: 0o700 });
    await Bun.write(
      join(claudeBackupDir, "sequence.json"),
      JSON.stringify(
        {
          activeAccountNumber: 1,
          lastUpdated: "2026-01-01T00:00:00.000Z",
          sequence: [1],
          accounts: {
            "1": {
              email: "claude-config@test.com",
              uuid: "uuid-config",
              added: "2026-01-01T00:00:00.000Z",
              alias: "custom",
            },
          },
        },
        null,
        2
      )
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "claude", "status", "--json"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome, CLAUDE_CONFIG_DIR: configRoot },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.trim()) as {
      provider: string;
      email: string | null;
      alias: string | null;
      managed: boolean;
    };
    expect(payload.provider).toBe("claude");
    expect(payload.email).toBe("claude-config@test.com");
    expect(payload.alias).toBe("custom");
    expect(payload.managed).toBe(true);

    rmSync(testHome, { recursive: true, force: true });
    rmSync(configRoot, { recursive: true, force: true });
  });

  test("codex status --json returns null email when logged out", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-status-json-"));

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "status", "--json"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.trim()) as {
      provider: string;
      email: string | null;
      alias: string | null;
      managed: boolean;
    };
    expect(payload.provider).toBe("codex");
    expect(payload.email).toBe(null);
    expect(payload.alias).toBe(null);
    expect(payload.managed).toBe(false);
    rmSync(testHome, { recursive: true, force: true });
  });
});
