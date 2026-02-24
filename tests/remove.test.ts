// ABOUTME: Tests for remove command identifier validation.
// ABOUTME: Ensures remove does not accept numeric identifiers.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("remove command", () => {
  test("rejects numeric identifier and requires email", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "ccflip-remove-test-"));
    const backupDir = join(testHome, ".caflip-backup/claude");
    mkdirSync(backupDir, { recursive: true, mode: 0o700 });

    const sequenceFile = join(backupDir, "sequence.json");
    await Bun.write(
      sequenceFile,
      JSON.stringify(
        {
          activeAccountNumber: 2,
          lastUpdated: "2026-02-21T00:00:00.000Z",
          sequence: [2],
          accounts: {
            "2": {
              email: "work@test.com",
              uuid: "u-2",
              added: "2026-02-21T00:00:00.000Z",
            },
          },
        },
        null,
        2
      )
    );

    const proc = Bun.spawn(["bun", "run", "src/index.ts", "claude", "remove", "1"], {
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
    expect(stderr).toContain("Error: Remove target must be an email, not a number");

    rmSync(testHome, { recursive: true, force: true });
  });
});
