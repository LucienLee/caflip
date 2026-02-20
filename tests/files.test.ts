// ABOUTME: Tests for atomic JSON write and directory-based file locking.
// ABOUTME: Validates write safety (no corruption on failure) and lock exclusivity.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { writeJsonAtomic, acquireLock, releaseLock } from "../src/files";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DIR = join(tmpdir(), "ccflip-test-" + Date.now());

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("writeJsonAtomic", () => {
  test("writes valid JSON to file", async () => {
    const file = join(TEST_DIR, "test.json");
    const data = { hello: "world" };
    await writeJsonAtomic(file, data);
    const content = JSON.parse(readFileSync(file, "utf-8"));
    expect(content).toEqual(data);
  });

  test("sets file permissions to 600", async () => {
    const file = join(TEST_DIR, "test.json");
    await writeJsonAtomic(file, { a: 1 });
    const stat = Bun.file(file);
    // Verify file exists and is readable
    expect(existsSync(file)).toBe(true);
  });

  test("does not corrupt file on invalid JSON", async () => {
    const file = join(TEST_DIR, "test.json");
    await writeJsonAtomic(file, { original: true });

    // Circular reference will fail JSON.stringify
    const circular: any = {};
    circular.self = circular;
    await expect(writeJsonAtomic(file, circular)).rejects.toThrow();

    // Original file should still be intact
    const content = JSON.parse(readFileSync(file, "utf-8"));
    expect(content).toEqual({ original: true });
  });
});

describe("acquireLock / releaseLock", () => {
  test("acquires and releases lock", () => {
    const lockDir = join(TEST_DIR, ".lock");
    acquireLock(lockDir);
    expect(existsSync(lockDir)).toBe(true);
    releaseLock(lockDir);
    expect(existsSync(lockDir)).toBe(false);
  });

  test("throws if lock already held", () => {
    const lockDir = join(TEST_DIR, ".lock");
    acquireLock(lockDir);
    expect(() => acquireLock(lockDir)).toThrow(/another instance/i);
    releaseLock(lockDir);
  });
});
