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

  test("returns clear error when provider is selected but not implemented yet", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "caflip-provider-test-"));
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "list"], {
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
    expect(stderr).toContain("Provider codex is not implemented yet");

    rmSync(testHome, { recursive: true, force: true });
  });
});
