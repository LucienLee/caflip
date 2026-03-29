// ABOUTME: Tests login-triggered account registration and refresh behavior.
// ABOUTME: Verifies existing managed accounts are refreshed instead of rejected.

import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  writeFakeClaudeBinary,
  writeFakeCodexBinary,
  writeFakeSecurityBinary,
} from "./helpers/provider-fixtures";

describe("login registration refresh", () => {
  test("codex login keeps same-email accounts from different workspaces", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-login-same-email-workspaces-"));
    const firstBinDir = mkdtempSync(join(tmpdir(), "caflip-login-workspace-a-bin-"));
    const secondBinDir = mkdtempSync(join(tmpdir(), "caflip-login-workspace-b-bin-"));

    writeFakeCodexBinary(firstBinDir, "codex-shared@test.com", "acct-shared", {
      organizationId: "org-a",
      organizationName: "Workspace A",
    });
    writeFakeCodexBinary(secondBinDir, "codex-shared@test.com", "acct-shared", {
      organizationId: "org-b",
      organizationName: "Workspace B",
    });

    let proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "codex", "login", "--", "--device-auth"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: testHome,
          PATH: `${firstBinDir}:${process.env.PATH ?? ""}`,
        },
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    expect(await proc.exited).toBe(0);

    proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "codex", "login", "--", "--device-auth"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: testHome,
          PATH: `${secondBinDir}:${process.env.PATH ?? ""}`,
        },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Added Account-2: codex-shared@test.com");

    const seq = JSON.parse(
      readFileSync(join(testHome, ".caflip-backup", "codex", "sequence.json"), "utf-8")
    ) as {
      sequence: number[];
      accounts: Record<
        string,
        { email: string; identity?: { uniqueKey: string }; display?: { organizationName?: string } }
      >;
    };

    expect(seq.sequence).toEqual([1, 2]);
    expect(seq.accounts["1"].identity?.uniqueKey).toBe("codex:acct-shared:org-a");
    expect(seq.accounts["2"].identity?.uniqueKey).toBe("codex:acct-shared:org-b");
    expect(seq.accounts["1"].display?.organizationName).toBe("Workspace A");
    expect(seq.accounts["2"].display?.organizationName).toBe("Workspace B");

    rmSync(testHome, { recursive: true, force: true });
    rmSync(firstBinDir, { recursive: true, force: true });
    rmSync(secondBinDir, { recursive: true, force: true });
  });

  test("codex login refreshes backups for an existing managed account", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-login-refresh-"));
    const fakeBinDir = mkdtempSync(join(tmpdir(), "caflip-login-refresh-bin-"));
    writeFakeCodexBinary(fakeBinDir, "codex-existing@test.com", "acct-fresh");

    const backupDir = join(testHome, ".caflip-backup", "codex");
    const credentialsDir = join(backupDir, "credentials");
    mkdirSync(credentialsDir, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(backupDir, "sequence.json"),
      JSON.stringify(
        {
          activeAccountNumber: 1,
          lastUpdated: "2026-01-01T00:00:00.000Z",
          sequence: [1],
          accounts: {
            "1": {
              email: "codex-existing@test.com",
              uuid: "acct-stale",
              added: "2026-01-01T00:00:00.000Z",
              alias: "work",
            },
          },
        },
        null,
        2
      )
    );
    const staleBackupPath = join(
      credentialsDir,
      ".codex-auth-1-codex-existing@test.com.json"
    );
    writeFileSync(staleBackupPath, "{\"stale\":true}");

    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "codex", "login", "--", "--device-auth"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: testHome,
          PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
        },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Updated Account-1: codex-existing@test.com");
    expect(existsSync(staleBackupPath)).toBe(true);
    const refreshedBackup = readFileSync(staleBackupPath, "utf-8");
    expect(refreshedBackup).toContain("acct-fresh");
    expect(refreshedBackup).not.toContain("\"stale\":true");

    const seq = JSON.parse(readFileSync(join(backupDir, "sequence.json"), "utf-8")) as {
      activeAccountNumber: number | null;
      accounts: Record<string, { email: string; alias?: string }>;
    };
    expect(seq.activeAccountNumber).toBe(1);
    expect(seq.accounts["1"].email).toBe("codex-existing@test.com");
    expect(seq.accounts["1"].alias).toBe("work");

    rmSync(testHome, { recursive: true, force: true });
    rmSync(fakeBinDir, { recursive: true, force: true });
  });

  test("claude login keeps same-email accounts from different organizations", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-claude-login-same-email-orgs-"));
    const firstBinDir = mkdtempSync(join(tmpdir(), "caflip-claude-login-org-a-bin-"));
    const secondBinDir = mkdtempSync(join(tmpdir(), "caflip-claude-login-org-b-bin-"));

    writeFakeClaudeBinary(firstBinDir, "claude-shared@test.com", "acct-shared", {
      orgId: "org-a",
      orgName: "Org A",
    });
    writeFakeSecurityBinary(
      firstBinDir,
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "sk-ant-oat01-a",
          refreshToken: "sk-ant-ort01-a",
          expiresAt: 1748276587173,
          scopes: ["user:inference", "user:profile"],
        },
      })
    );
    writeFakeClaudeBinary(secondBinDir, "claude-shared@test.com", "acct-shared", {
      orgId: "org-b",
      orgName: "Org B",
    });
    writeFakeSecurityBinary(
      secondBinDir,
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "sk-ant-oat01-b",
          refreshToken: "sk-ant-ort01-b",
          expiresAt: 1748276587173,
          scopes: ["user:inference", "user:profile"],
        },
      })
    );

    let proc = Bun.spawn(["bun", "run", "src/index.ts", "claude", "login"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: testHome,
        PATH: `${firstBinDir}:${process.env.PATH ?? ""}`,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(0);

    proc = Bun.spawn(["bun", "run", "src/index.ts", "claude", "login"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: testHome,
        PATH: `${secondBinDir}:${process.env.PATH ?? ""}`,
      },
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
    expect(stdout).toContain("Added Account-2: claude-shared@test.com");

    const seq = JSON.parse(
      readFileSync(join(testHome, ".caflip-backup", "claude", "sequence.json"), "utf-8")
    ) as {
      sequence: number[];
      accounts: Record<
        string,
        { email: string; identity?: { uniqueKey: string }; display?: { organizationName?: string } }
      >;
    };

    expect(seq.sequence).toEqual([1, 2]);
    expect(seq.accounts["1"].identity?.uniqueKey).toBe("claude:acct-shared:org-a");
    expect(seq.accounts["2"].identity?.uniqueKey).toBe("claude:acct-shared:org-b");
    expect(seq.accounts["1"].display?.organizationName).toBe("Org A");
    expect(seq.accounts["2"].display?.organizationName).toBe("Org B");

    rmSync(testHome, { recursive: true, force: true });
    rmSync(firstBinDir, { recursive: true, force: true });
    rmSync(secondBinDir, { recursive: true, force: true });
  });
});
