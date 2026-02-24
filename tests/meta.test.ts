// ABOUTME: Tests CLI metadata persistence for provider picker defaults.
// ABOUTME: Ensures missing or invalid metadata falls back to Claude.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readCliMeta, writeLastProvider } from "../src/meta";

describe("cli meta", () => {
  test("reads default provider when file is missing", () => {
    const originalHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), "caflip-meta-test-"));
    process.env.HOME = home;

    expect(readCliMeta().lastProvider).toBe("claude");

    process.env.HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
  });

  test("persists last provider", async () => {
    const originalHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), "caflip-meta-test-"));
    process.env.HOME = home;

    await writeLastProvider("codex");
    expect(readCliMeta().lastProvider).toBe("codex");

    process.env.HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
  });
});
