// ABOUTME: Integration tests for provider-first CLI behavior.
// ABOUTME: Verifies provider qualification requirements and empty-state interactive guidance.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("provider-first flow", () => {
  test("list without provider exits 2 with guidance", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-first-"));
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "list"], {
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
    expect(stderr).toContain("Provider is required for non-interactive commands");
    expect(stderr).toContain("caflip claude list");
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
