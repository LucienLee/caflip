// ABOUTME: Integration tests for provider-qualified login command routing.
// ABOUTME: Uses fake provider binaries to verify login passthrough and registration behavior.

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
  makeJwt,
  writeFakeClaudeBinary,
  writeFakeCodexBinary,
  writeFakeSecurityBinary,
} from "./helpers/provider-fixtures";

describe("provider login command", () => {
  test("help includes login command", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "help"], {
      cwd: process.cwd(),
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("<provider> login [-- <args...>]");
    expect(stdout).toContain("login [-- <args...>]                 Pick provider, then run provider login");
    expect(stdout).toContain("add [--alias <name>]                 Pick provider, then add current account");
    expect(stdout).toContain("remove [<email>]                     Pick provider, then remove an account");
  });

  test("provider-qualified alias usage includes provider prefix", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-alias-usage-home-"));
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "claude", "alias"], {
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
    expect(stderr).toContain("Usage: caflip claude alias <name> [<account>]");

    rmSync(testHome, { recursive: true, force: true });
  });

  test("codex login registers a newly logged-in account", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-login-command-"));
    const fakeBinDir = mkdtempSync(join(tmpdir(), "caflip-login-bin-"));
    writeFakeCodexBinary(fakeBinDir, "codex-login@test.com", "acct-login");

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
    expect(stdout).toContain("Added Account-1: codex-login@test.com");

    const sequenceFile = join(testHome, ".caflip-backup", "codex", "sequence.json");
    expect(existsSync(sequenceFile)).toBe(true);
    const seq = JSON.parse(readFileSync(sequenceFile, "utf-8")) as {
      activeAccountNumber: number | null;
      sequence: number[];
      accounts: Record<string, { email: string }>;
    };
    expect(seq.activeAccountNumber).toBe(1);
    expect(seq.sequence).toEqual([1]);
    expect(seq.accounts["1"].email).toBe("codex-login@test.com");

    rmSync(testHome, { recursive: true, force: true });
    rmSync(fakeBinDir, { recursive: true, force: true });
  });

  test("claude login registers a newly logged-in account", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-claude-login-command-"));
    const fakeBinDir = mkdtempSync(join(tmpdir(), "caflip-claude-login-bin-"));
    writeFakeClaudeBinary(fakeBinDir, "claude-login@test.com", "uuid-login");
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

    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "claude", "login", "--", "--email", "claude-login@test.com"],
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
    expect(stdout).toContain("Added Account-1: claude-login@test.com");

    const sequenceFile = join(testHome, ".caflip-backup", "claude", "sequence.json");
    expect(existsSync(sequenceFile)).toBe(true);
    const seq = JSON.parse(readFileSync(sequenceFile, "utf-8")) as {
      activeAccountNumber: number | null;
      sequence: number[];
      accounts: Record<string, { email: string; uuid: string }>;
    };
    expect(seq.activeAccountNumber).toBe(1);
    expect(seq.sequence).toEqual([1]);
    expect(seq.accounts["1"].email).toBe("claude-login@test.com");
    expect(seq.accounts["1"].uuid).toBe("uuid-login");

    rmSync(testHome, { recursive: true, force: true });
    rmSync(fakeBinDir, { recursive: true, force: true });
  });

  test("claude login fails when verifier email does not match active account", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-claude-login-mismatch-"));
    const fakeBinDir = mkdtempSync(join(tmpdir(), "caflip-claude-login-mismatch-bin-"));
    writeFakeClaudeBinary(fakeBinDir, "claude-status@test.com", "uuid-status", {
      localEmail: "claude-local@test.com",
    });
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

    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "claude", "login"],
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

    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Active Claude Code account changed during login verification");
    expect(existsSync(join(testHome, ".caflip-backup", "claude", "sequence.json"))).toBe(false);

    rmSync(testHome, { recursive: true, force: true });
    rmSync(fakeBinDir, { recursive: true, force: true });
  });

  test("claude login fails when verifier returns invalid JSON", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-claude-login-invalid-json-"));
    const fakeBinDir = mkdtempSync(join(tmpdir(), "caflip-claude-login-invalid-json-bin-"));
    writeFakeClaudeBinary(fakeBinDir, "claude-login@test.com", "uuid-login", {
      invalidStatusJson: true,
    });
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

    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "claude", "login"],
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

    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("claude auth status returned invalid JSON");

    rmSync(testHome, { recursive: true, force: true });
    rmSync(fakeBinDir, { recursive: true, force: true });
  });

  test("login rejects provider args that are not passed after --", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-login-args-home-"));
    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "codex", "login", "--device-auth"],
      {
        cwd: process.cwd(),
        env: { ...process.env, HOME: testHome },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Provider login arguments must be passed after --");

    rmSync(testHome, { recursive: true, force: true });
  });

  test("existing account add with alias does not print false added message", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-add-existing-home-"));
    const fakeBinDir = mkdtempSync(join(tmpdir(), "caflip-add-existing-bin-"));
    writeFakeCodexBinary(fakeBinDir, "codex-existing@test.com", "acct-existing");

    mkdirSync(join(testHome, ".codex"), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(testHome, ".codex", "auth.json"),
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: {
          id_token: makeJwt({
            email: "codex-existing@test.com",
            "https://api.openai.com/auth": { chatgpt_account_id: "acct-existing" },
          }),
          account_id: "acct-existing",
        },
      })
    );

    const backupDir = join(testHome, ".caflip-backup", "codex");
    mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(backupDir, "sequence.json"),
      JSON.stringify({
        activeAccountNumber: 1,
        lastUpdated: "2026-01-01T00:00:00.000Z",
        sequence: [1],
        accounts: {
          "1": {
            email: "codex-existing@test.com",
            uuid: "acct-existing",
            added: "2026-01-01T00:00:00.000Z",
          },
        },
      })
    );

    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "codex", "add", "--alias", "work"],
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
    expect(stdout).toContain("Account codex-existing@test.com is already managed.");
    expect(stdout).not.toContain("Added ");

    const seq = JSON.parse(readFileSync(join(backupDir, "sequence.json"), "utf-8")) as {
      accounts: Record<string, { alias?: string }>;
    };
    expect(seq.accounts["1"].alias).toBeUndefined();

    rmSync(testHome, { recursive: true, force: true });
    rmSync(fakeBinDir, { recursive: true, force: true });
  });
});
