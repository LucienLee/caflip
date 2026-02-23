// ABOUTME: Tests for account switching behavior.
// ABOUTME: Validates early exit when switching to the already-active account.

import { describe, expect, test, spyOn } from "bun:test";
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

    await performSwitch(seq, "2", { currentEmail: "b@test.com" });

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

    await performSwitch(seq, "2", { currentEmail: "b@test.com" });

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

    await performSwitch(seq, "1", { currentEmail: "a@test.com" });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("a@test.com")
    );

    logSpy.mockRestore();
  });

  test("uses UI account label when internal ids are sparse", async () => {
    const { performSwitch } = await import("../src/index");

    const seq: SequenceData = {
      activeAccountNumber: 3,
      lastUpdated: "2026-01-01T00:00:00.000Z",
      sequence: [2, 3],
      accounts: {
        "2": { email: "a@test.com", uuid: "aaa", added: "2026-01-01T00:00:00.000Z" },
        "3": { email: "b@test.com", uuid: "bbb", added: "2026-01-01T00:00:00.000Z" },
      },
    };

    const logSpy = spyOn(console, "log");
    await performSwitch(seq, "3", { currentEmail: "b@test.com" });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Already using Account-2")
    );
    logSpy.mockRestore();
  });

  test("does not early-exit when sequence active is stale and current logged-in email differs", async () => {
    const { performSwitch } = await import("../src/index");

    const seq: SequenceData = {
      activeAccountNumber: 1,
      lastUpdated: "2026-01-01T00:00:00.000Z",
      sequence: [1, 2],
      accounts: {
        "1": { email: "old@test.com", uuid: "aaa", added: "2026-01-01T00:00:00.000Z" },
        "2": { email: "work@test.com", uuid: "bbb", added: "2026-01-01T00:00:00.000Z" },
      },
    };

    const logSpy = spyOn(console, "log");

    await expect(performSwitch(seq, "1", { currentEmail: "new@test.com" })).rejects.toThrow();
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Already using"));

    logSpy.mockRestore();
  });
});
