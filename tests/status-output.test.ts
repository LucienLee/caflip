// ABOUTME: Integration tests for provider-qualified plain-text status output.
// ABOUTME: Verifies status explains the current active account and managed account count.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("status output", () => {
  test("codex status shows active account and managed account count", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-status-output-"));
    mkdirSync(join(testHome, ".codex"), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(testHome, ".codex", "auth.json"),
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: {
          id_token:
            "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJlbWFpbCI6ImNvZGV4LWFjdGl2ZUB0ZXN0LmNvbSIsImh0dHBzOi8vYXBpLm9wZW5haS5jb20vYXV0aCI6eyJjaGF0Z3B0X2FjY291bnRfaWQiOiJhY2N0LWFjdGl2ZSJ9fQ.sig",
          account_id: "acct-active",
        },
      })
    );

    mkdirSync(join(testHome, ".caflip-backup", "codex"), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(testHome, ".caflip-backup", "codex", "sequence.json"),
      JSON.stringify(
        {
          activeAccountNumber: 1,
          lastUpdated: "2026-03-24T00:00:00.000Z",
          sequence: [1, 2],
          accounts: {
            "1": {
              email: "codex-active@test.com",
              uuid: "acct-active",
              alias: "work",
              added: "2026-03-24T00:00:00.000Z",
            },
            "2": {
              email: "codex-other@test.com",
              uuid: "acct-other",
              added: "2026-03-24T00:00:00.000Z",
            },
          },
        },
        null,
        2
      )
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "status"], {
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
    expect(stdout).toContain("codex-active@test.com [work]");
    expect(stdout).toContain("managed accounts: 2");

    rmSync(testHome, { recursive: true, force: true });
  });

  test("codex status shows zero managed accounts when logged out and unmanaged", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-status-output-none-"));

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "status"], {
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
    expect(stdout).toContain("none");
    expect(stdout).toContain("managed accounts: 0");

    rmSync(testHome, { recursive: true, force: true });
  });
});
