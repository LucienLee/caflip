// ABOUTME: Tests provider token parsing for CLI command routing.
// ABOUTME: Ensures positional provider syntax is parsed and legacy defaults remain.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseProviderArgs } from "../src/providers/types";

describe("provider selection", () => {
  test("defaults to claude when provider is omitted", () => {
    expect(parseProviderArgs(["list"])).toEqual({
      provider: "claude",
      commandArgs: ["list"],
    });
  });

  test("selects codex when first token is codex", () => {
    expect(parseProviderArgs(["codex", "list"])).toEqual({
      provider: "codex",
      commandArgs: ["list"],
    });
  });

  test("selects claude when first token is claude", () => {
    expect(parseProviderArgs(["claude", "status"])).toEqual({
      provider: "claude",
      commandArgs: ["status"],
    });
  });

  test("rejects deprecated --provider flag format", () => {
    expect(() => parseProviderArgs(["--provider", "codex", "list"])).toThrow(
      /Use positional provider syntax/i
    );
  });

  test("supports codex provider command routing", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-test-"));
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "help"], {
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
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("caflip <claude|codex> [command]");

    rmSync(testHome, { recursive: true, force: true });
  });
});
