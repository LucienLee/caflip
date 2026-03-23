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
import { writeFakeCodexBinary } from "./helpers/provider-fixtures";

describe("login registration refresh", () => {
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
});
