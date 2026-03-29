// ABOUTME: Regression tests for lock lifecycle in CLI commands.
// ABOUTME: Ensures lock directory is released even when command exits with an error.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, existsSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("lock cleanup", () => {
  test("ccflip add releases lock on error", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "ccflip-lock-test-"));
    const lockPath = join(testHome, ".caflip-backup/claude", ".lock");

    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "claude", "add"],
      {
        cwd: process.cwd(),
        env: { ...process.env, HOME: testHome },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
    expect(existsSync(lockPath)).toBe(false);

    rmSync(testHome, { recursive: true, force: true });
  });

  test("ccflip alias with ambiguous same-email target releases lock", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "ccflip-lock-test-"));
    const backupDir = join(testHome, ".caflip-backup/claude");
    const lockPath = join(backupDir, ".lock");
    mkdirSync(backupDir, { recursive: true, mode: 0o700 });

    await Bun.write(
      join(backupDir, "sequence.json"),
      JSON.stringify(
        {
          activeAccountNumber: 2,
          lastUpdated: "2026-02-21T00:00:00.000Z",
          sequence: [1, 2],
          accounts: {
            "1": {
              email: "work@test.com",
              uuid: "claude:acct-1:org-a",
              added: "2026-02-21T00:00:00.000Z",
              identity: {
                provider: "claude",
                accountId: "acct-1",
                organizationId: "org-a",
                uniqueKey: "claude:acct-1:org-a",
              },
              display: {
                email: "work@test.com",
                accountName: null,
                organizationName: "Org A",
                planType: null,
                role: "member",
                label: "work@test.com · Org A",
              },
            },
            "2": {
              email: "work@test.com",
              uuid: "claude:acct-1:org-b",
              added: "2026-02-21T00:00:00.000Z",
              identity: {
                provider: "claude",
                accountId: "acct-1",
                organizationId: "org-b",
                uniqueKey: "claude:acct-1:org-b",
              },
              display: {
                email: "work@test.com",
                accountName: null,
                organizationName: "Org B",
                planType: null,
                role: "member",
                label: "work@test.com · Org B",
              },
            },
          },
        },
        null,
        2
      )
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "claude", "alias", "work", "work@test.com"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Multiple managed accounts match work@test.com");
    expect(existsSync(lockPath)).toBe(false);

    rmSync(testHome, { recursive: true, force: true });
  });

  test("ccflip alias accepts UI account index targets", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "ccflip-lock-test-"));
    const backupDir = join(testHome, ".caflip-backup/claude");
    mkdirSync(backupDir, { recursive: true, mode: 0o700 });

    await Bun.write(
      join(backupDir, "sequence.json"),
      JSON.stringify(
        {
          activeAccountNumber: 1,
          lastUpdated: "2026-02-21T00:00:00.000Z",
          sequence: [1, 2],
          accounts: {
            "1": {
              email: "personal@test.com",
              uuid: "u-1",
              added: "2026-02-21T00:00:00.000Z",
            },
            "2": {
              email: "work@test.com",
              uuid: "u-2",
              added: "2026-02-21T00:00:00.000Z",
            },
          },
        },
        null,
        2
      )
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "claude", "alias", "work", "2"], {
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
    expect(stdout).toContain('Alias "work" set for Account-2 (work@test.com)');

    rmSync(testHome, { recursive: true, force: true });
  });

  test("missing backup dir should not surface lock-held error", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "ccflip-lock-test-"));
    const backupDir = join(testHome, ".caflip-backup/claude");
    rmSync(backupDir, { recursive: true, force: true });

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "claude", "alias", "work"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("No accounts managed yet");
    expect(stderr).not.toContain("Another instance is running");

    rmSync(testHome, { recursive: true, force: true });
  });

  test("does not remove another process lock when acquire fails", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "ccflip-lock-test-"));
    const lockPath = join(testHome, ".caflip-backup/claude", ".lock");
    mkdirSync(lockPath, { recursive: true, mode: 0o700 });
    await Bun.write(
      join(lockPath, "owner.json"),
      JSON.stringify({ pid: process.pid, startedAt: "2026-02-22T00:00:00.000Z" })
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "claude", "add"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Another instance is running");
    expect(existsSync(lockPath)).toBe(true);

    rmSync(testHome, { recursive: true, force: true });
  });
});
