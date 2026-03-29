// ABOUTME: Tests for account switching behavior.
// ABOUTME: Validates early exit when switching to the already-active account.

import { afterEach, describe, expect, test, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { SequenceData } from "../src/accounts";
import { makeJwt } from "./helpers/provider-fixtures";

const ORIGINAL_ENV = {
  HOME: process.env.HOME,
  PATH: process.env.PATH,
  USER: process.env.USER,
  CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
};

function writeStatefulSecurityBinary(binDir: string, storeDir: string): void {
  const script = `#!/bin/sh
set -eu
store_dir="${storeDir}"
mkdir -p "$store_dir"
service=""
value=""
mode=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    find-generic-password)
      mode="find"
      shift
      ;;
    add-generic-password)
      mode="add"
      shift
      ;;
    delete-generic-password)
      mode="delete"
      shift
      ;;
    -s)
      service="$2"
      shift 2
      ;;
    -w)
      if [ "$mode" = "add" ]; then
        value="$2"
        shift 2
      else
        shift
      fi
      ;;
    *)
      shift
      ;;
  esac
done
key=$(printf '%s' "$service" | tr ' /@.:+' '_')
path="$store_dir/$key"
case "$mode" in
  find)
    if [ -f "$path" ]; then
      cat "$path"
      exit 0
    fi
    echo "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain." >&2
    exit 44
    ;;
  add)
    printf '%s' "$value" > "$path"
    exit 0
    ;;
  delete)
    rm -f "$path"
    exit 0
    ;;
esac
echo "unexpected args" >&2
exit 1
`;

  writeFileSync(join(binDir, "security"), script, { mode: 0o755 });
}

afterEach(() => {
  if (ORIGINAL_ENV.HOME === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = ORIGINAL_ENV.HOME;
  }
  if (ORIGINAL_ENV.PATH === undefined) {
    delete process.env.PATH;
  } else {
    process.env.PATH = ORIGINAL_ENV.PATH;
  }
  if (ORIGINAL_ENV.USER === undefined) {
    delete process.env.USER;
  } else {
    process.env.USER = ORIGINAL_ENV.USER;
  }
  if (ORIGINAL_ENV.CLAUDE_CONFIG_DIR === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = ORIGINAL_ENV.CLAUDE_CONFIG_DIR;
  }
});

describe("performSwitch", () => {
  test("exits early when target account is already active", async () => {
    // Dynamically import to get the function after it's exported
    const { performSwitch } = await import("../src/index");

    const seq: SequenceData = {
      activeAccountNumber: 2,
      lastUpdated: "2026-01-01T00:00:00.000Z",
      sequence: [1, 2],
      accounts: {
        "1": { email: "a@test.com", uuid: "aaa", added: "2026-01-01T00:00:00.000Z" },
        "2": { email: "b@test.com", uuid: "bbb", added: "2026-01-01T00:00:00.000Z", alias: "work" },
      },
    };

    const logSpy = spyOn(console, "log");

    await performSwitch(seq, "2", { currentEmail: "b@test.com" });

    // Should print the "already using" message
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Already using Account-2")
    );

    logSpy.mockRestore();
  });

  test("includes alias in early-exit message when account has one", async () => {
    const { performSwitch } = await import("../src/index");

    const seq: SequenceData = {
      activeAccountNumber: 2,
      lastUpdated: "2026-01-01T00:00:00.000Z",
      sequence: [1, 2],
      accounts: {
        "1": { email: "a@test.com", uuid: "aaa", added: "2026-01-01T00:00:00.000Z" },
        "2": { email: "b@test.com", uuid: "bbb", added: "2026-01-01T00:00:00.000Z", alias: "work" },
      },
    };

    const logSpy = spyOn(console, "log");

    await performSwitch(seq, "2", { currentEmail: "b@test.com" });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[work]")
    );

    logSpy.mockRestore();
  });

  test("includes email in early-exit message", async () => {
    const { performSwitch } = await import("../src/index");

    const seq: SequenceData = {
      activeAccountNumber: 1,
      lastUpdated: "2026-01-01T00:00:00.000Z",
      sequence: [1, 2],
      accounts: {
        "1": { email: "a@test.com", uuid: "aaa", added: "2026-01-01T00:00:00.000Z" },
        "2": { email: "b@test.com", uuid: "bbb", added: "2026-01-01T00:00:00.000Z" },
      },
    };

    const logSpy = spyOn(console, "log");

    await performSwitch(seq, "1", { currentEmail: "a@test.com" });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("a@test.com")
    );

    logSpy.mockRestore();
  });

  test("uses UI account label when internal ids are sparse", async () => {
    const { performSwitch } = await import("../src/index");

    const seq: SequenceData = {
      activeAccountNumber: 3,
      lastUpdated: "2026-01-01T00:00:00.000Z",
      sequence: [2, 3],
      accounts: {
        "2": { email: "a@test.com", uuid: "aaa", added: "2026-01-01T00:00:00.000Z" },
        "3": { email: "b@test.com", uuid: "bbb", added: "2026-01-01T00:00:00.000Z" },
      },
    };

    const logSpy = spyOn(console, "log");
    await performSwitch(seq, "3", { currentEmail: "b@test.com" });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Already using Account-2")
    );
    logSpy.mockRestore();
  });

  test("does not early-exit when sequence active is stale and current logged-in email differs", async () => {
    const { performSwitch } = await import("../src/index");

    const seq: SequenceData = {
      activeAccountNumber: 1,
      lastUpdated: "2026-01-01T00:00:00.000Z",
      sequence: [1, 2],
      accounts: {
        "1": { email: "old@test.com", uuid: "aaa", added: "2026-01-01T00:00:00.000Z" },
        "2": { email: "work@test.com", uuid: "bbb", added: "2026-01-01T00:00:00.000Z" },
      },
    };

    const logSpy = spyOn(console, "log");

    await expect(performSwitch(seq, "1", { currentEmail: "new@test.com" })).rejects.toThrow();
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Already using"));

    logSpy.mockRestore();
  });

  test("backs up the current same-email workspace before switching to another workspace", async () => {
    const { performSwitch } = await import("../src/index");
    const testHome = mkdtempSync(join(tmpdir(), "caflip-switch-workspace-"));
    const fakeBinDir = mkdtempSync(join(tmpdir(), "caflip-switch-bin-"));
    const securityStoreDir = join(testHome, "keychain");
    const claudeDir = join(testHome, ".claude");
    const backupDir = join(testHome, ".caflip-backup", "claude");
    const configBackupDir = join(backupDir, "configs");

    mkdirSync(claudeDir, { recursive: true, mode: 0o700 });
    mkdirSync(configBackupDir, { recursive: true, mode: 0o700 });
    mkdirSync(fakeBinDir, { recursive: true, mode: 0o700 });
    mkdirSync(securityStoreDir, { recursive: true, mode: 0o700 });
    writeStatefulSecurityBinary(fakeBinDir, securityStoreDir);

    process.env.HOME = testHome;
    process.env.PATH = `${fakeBinDir}:${ORIGINAL_ENV.PATH ?? ""}`;
    process.env.USER = "test-user";
    delete process.env.CLAUDE_CONFIG_DIR;

    writeFileSync(
      join(claudeDir, ".claude.json"),
      JSON.stringify(
        {
          oauthAccount: {
            emailAddress: "same@test.com",
            accountUuid: "acct-1",
            organizationUuid: "org-a",
            organizationName: "Workspace A",
            workspaceRole: "member",
          },
        },
        null,
        2
      )
    );
    writeFileSync(
      join(securityStoreDir, "Claude_Code-credentials"),
      JSON.stringify({ accessToken: "active-org-a" })
    );
    writeFileSync(
      join(securityStoreDir, "Claude_Code-Account-2-same_test_com"),
      JSON.stringify({ accessToken: "backup-org-b" })
    );
    writeFileSync(
      join(configBackupDir, ".claude-config-2-same@test.com.json"),
      JSON.stringify(
        {
          oauthAccount: {
            emailAddress: "same@test.com",
            accountUuid: "acct-1",
            organizationUuid: "org-b",
            organizationName: "Workspace B",
            workspaceRole: "member",
          },
        },
        null,
        2
      )
    );

    const seq: SequenceData = {
      activeAccountNumber: 1,
      lastUpdated: "2026-01-01T00:00:00.000Z",
      sequence: [1, 2],
      accounts: {
        "1": {
          email: "same@test.com",
          uuid: "claude:acct-1:org-a",
          added: "2026-01-01T00:00:00.000Z",
          identity: {
            provider: "claude",
            accountId: "acct-1",
            organizationId: "org-a",
            uniqueKey: "claude:acct-1:org-a",
          },
          display: {
            email: "same@test.com",
            accountName: null,
            organizationName: "Workspace A",
            planType: "team",
            role: "owner",
            label: "same@test.com · Workspace A",
          },
        },
        "2": {
          email: "same@test.com",
          uuid: "claude:acct-1:org-b",
          added: "2026-01-01T00:00:00.000Z",
          identity: {
            provider: "claude",
            accountId: "acct-1",
            organizationId: "org-b",
            uniqueKey: "claude:acct-1:org-b",
          },
          display: {
            email: "same@test.com",
            accountName: null,
            organizationName: "Workspace B",
            planType: "team",
            role: "owner",
            label: "same@test.com · Workspace B",
          },
        },
      },
    };

    const logSpy = spyOn(console, "log");

    await performSwitch(seq, "2", { currentEmail: "same@test.com" });

    expect(seq.activeAccountNumber).toBe(2);
    expect(readFileSync(join(securityStoreDir, "Claude_Code-Account-1-same_test_com"), "utf-8"))
      .toContain("active-org-a");
    expect(readFileSync(join(claudeDir, ".claude.json"), "utf-8"))
      .toContain('"organizationUuid": "org-b"');
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Already using"));

    logSpy.mockRestore();
    rmSync(testHome, { recursive: true, force: true });
    rmSync(fakeBinDir, { recursive: true, force: true });
  });

  test("codex next rejects switching when current same-email workspace is ambiguous", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-switch-ambiguous-current-"));
    mkdirSync(join(testHome, ".codex"), { recursive: true, mode: 0o700 });
    mkdirSync(join(testHome, ".caflip-backup", "codex", "credentials"), {
      recursive: true,
      mode: 0o700,
    });

    writeFileSync(
      join(testHome, ".codex", "auth.json"),
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: {
          id_token: makeJwt({
            email: "same@test.com",
            "https://api.openai.com/auth": {
              chatgpt_account_id: "acct-1",
              chatgpt_plan_type: "team",
              organizations: [
                { id: "org-a", title: "Workspace A", role: "owner", is_default: false },
                { id: "org-b", title: "Workspace B", role: "owner", is_default: false },
              ],
            },
          }),
          account_id: "acct-1",
        },
      })
    );

    writeFileSync(
      join(testHome, ".caflip-backup", "codex", "sequence.json"),
      JSON.stringify(
        {
          activeAccountNumber: 1,
          lastUpdated: "2026-03-24T00:00:00.000Z",
          sequence: [1, 2],
          accounts: {
            "1": {
              email: "same@test.com",
              uuid: "codex:acct-1:org-a",
              added: "2026-03-24T00:00:00.000Z",
              identity: {
                provider: "codex",
                accountId: "acct-1",
                organizationId: "org-a",
                uniqueKey: "codex:acct-1:org-a",
              },
              display: {
                email: "same@test.com",
                accountName: null,
                organizationName: "Workspace A",
                planType: "team",
                role: "owner",
                label: "same@test.com · Workspace A",
              },
            },
            "2": {
              email: "same@test.com",
              uuid: "codex:acct-1:org-b",
              added: "2026-03-24T00:00:00.000Z",
              identity: {
                provider: "codex",
                accountId: "acct-1",
                organizationId: "org-b",
                uniqueKey: "codex:acct-1:org-b",
              },
              display: {
                email: "same@test.com",
                accountName: null,
                organizationName: "Workspace B",
                planType: "team",
                role: "owner",
                label: "same@test.com · Workspace B",
              },
            },
          },
        },
        null,
        2
      )
    );

    writeFileSync(
      join(testHome, ".caflip-backup", "codex", "credentials", ".codex-auth-1-same@test.com.json"),
      "{\"slot\":1}"
    );
    writeFileSync(
      join(testHome, ".caflip-backup", "codex", "credentials", ".codex-auth-2-same@test.com.json"),
      "{\"slot\":2}"
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "next"], {
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

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Cannot determine which managed account is currently active");

    const authAfter = JSON.parse(readFileSync(join(testHome, ".codex", "auth.json"), "utf-8")) as {
      tokens: { account_id: string };
    };
    expect(authAfter.tokens.account_id).toBe("acct-1");

    rmSync(testHome, { recursive: true, force: true });
  });

  test("codex next rejects switching when current account identity is partial and only email-matches a normalized account", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-switch-partial-current-"));
    mkdirSync(join(testHome, ".codex"), { recursive: true, mode: 0o700 });
    mkdirSync(join(testHome, ".caflip-backup", "codex", "credentials"), {
      recursive: true,
      mode: 0o700,
    });

    writeFileSync(
      join(testHome, ".codex", "auth.json"),
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: {
          id_token: makeJwt({
            email: "same@test.com",
            "https://api.openai.com/auth": {
              chatgpt_account_id: "acct-1",
              chatgpt_plan_type: "team",
            },
          }),
          account_id: "acct-1",
        },
      })
    );

    writeFileSync(
      join(testHome, ".caflip-backup", "codex", "sequence.json"),
      JSON.stringify(
        {
          activeAccountNumber: 1,
          lastUpdated: "2026-03-24T00:00:00.000Z",
          sequence: [1, 2],
          accounts: {
            "1": {
              email: "same@test.com",
              uuid: "codex:acct-1:org-a",
              added: "2026-03-24T00:00:00.000Z",
              identity: {
                provider: "codex",
                accountId: "acct-1",
                organizationId: "org-a",
                uniqueKey: "codex:acct-1:org-a",
              },
              display: {
                email: "same@test.com",
                accountName: null,
                organizationName: "Workspace A",
                planType: "team",
                role: "owner",
                label: "same@test.com · Workspace A",
              },
            },
            "2": {
              email: "other@test.com",
              uuid: "codex:acct-2:org-z",
              added: "2026-03-24T00:00:00.000Z",
              identity: {
                provider: "codex",
                accountId: "acct-2",
                organizationId: "org-z",
                uniqueKey: "codex:acct-2:org-z",
              },
              display: {
                email: "other@test.com",
                accountName: null,
                organizationName: "Workspace Z",
                planType: "team",
                role: "owner",
                label: "other@test.com · Workspace Z",
              },
            },
          },
        },
        null,
        2
      )
    );

    writeFileSync(
      join(testHome, ".caflip-backup", "codex", "credentials", ".codex-auth-1-same@test.com.json"),
      "{\"slot\":1}"
    );
    writeFileSync(
      join(testHome, ".caflip-backup", "codex", "credentials", ".codex-auth-2-other@test.com.json"),
      "{\"slot\":2}"
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "next"], {
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

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Cannot determine which managed account is currently active");

    const authAfter = JSON.parse(readFileSync(join(testHome, ".codex", "auth.json"), "utf-8")) as {
      tokens: { account_id: string };
    };
    expect(authAfter.tokens.account_id).toBe("acct-1");

    rmSync(testHome, { recursive: true, force: true });
  });
});
