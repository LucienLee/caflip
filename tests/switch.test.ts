// ABOUTME: Tests for account switching behavior.
// ABOUTME: Validates early exit when switching to the already-active account.

import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import type { SequenceData } from "../src/accounts";

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

    await performSwitch(seq, "2");

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

    await performSwitch(seq, "2");

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

    await performSwitch(seq, "1");

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("a@test.com")
    );

    logSpy.mockRestore();
  });
});
