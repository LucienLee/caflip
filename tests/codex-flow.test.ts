// ABOUTME: Integration tests for Codex provider command flows.
// ABOUTME: Verifies status/add/next behavior using ~/.codex/auth.json in a temp HOME.

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function toBase64Url(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${toBase64Url({ alg: "none", typ: "JWT" })}.${toBase64Url(payload)}.sig`;
}

async function writeCodexAuth(testHome: string, email: string, accountId: string): Promise<string> {
  const auth = JSON.stringify(
    {
      auth_mode: "chatgpt",
      tokens: {
        id_token: makeJwt({
          email,
          "https://api.openai.com/auth": { chatgpt_account_id: accountId },
        }),
        account_id: accountId,
      },
    },
    null,
    2
  );
  const codexDir = join(testHome, ".codex");
  mkdirSync(codexDir, { recursive: true, mode: 0o700 });
  await Bun.write(join(codexDir, "auth.json"), auth);
  return auth;
}

describe("codex flow", () => {
  test("status prints current codex account email", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-codex-flow-"));
    await writeCodexAuth(testHome, "codex-a@test.com", "acct-a");

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "status"], {
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
    expect(stdout.trim()).toBe("codex-a@test.com");
    rmSync(testHome, { recursive: true, force: true });
  });

  test("add stores codex account into codex sequence", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-codex-flow-"));
    await writeCodexAuth(testHome, "codex-a@test.com", "acct-a");

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "add"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const sequenceFile = join(testHome, ".caflip-backup", "codex", "sequence.json");
    expect(existsSync(sequenceFile)).toBe(true);
    const seq = JSON.parse(readFileSync(sequenceFile, "utf-8")) as {
      activeAccountNumber: number | null;
      sequence: number[];
      accounts: Record<string, { email: string }>;
    };
    expect(seq.activeAccountNumber).toBe(1);
    expect(seq.sequence).toEqual([1]);
    expect(seq.accounts["1"].email).toBe("codex-a@test.com");
    rmSync(testHome, { recursive: true, force: true });
  });

  test("next switches codex active auth to next managed account", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-codex-flow-"));
    const authA = await writeCodexAuth(testHome, "codex-a@test.com", "acct-a");

    let proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "add"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(0);

    const authB = await writeCodexAuth(testHome, "codex-b@test.com", "acct-b");
    proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "add"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(0);

    proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "next"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: testHome },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(0);

    const activeAuthPath = join(testHome, ".codex", "auth.json");
    const activeAuth = readFileSync(activeAuthPath, "utf-8");
    expect(activeAuth).toBe(authA);
    expect(activeAuth).not.toBe(authB);

    rmSync(testHome, { recursive: true, force: true });
  });
});
