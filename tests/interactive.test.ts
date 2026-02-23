// ABOUTME: Tests for interactive prompt cancellation handling.
// ABOUTME: Ensures ESC exits map to a clean cancellation flow.

import { describe, expect, test } from "bun:test";
import {
  pickAccount,
  confirmAction,
  PromptCancelledError,
} from "../src/interactive";
import type { SequenceData } from "../src/accounts";

const SEQ: SequenceData = {
  activeAccountNumber: 1,
  lastUpdated: "2026-01-01T00:00:00.000Z",
  sequence: [1],
  accounts: {
    "1": { email: "a@test.com", uuid: "aaa", added: "2026-01-01T00:00:00.000Z" },
  },
};

describe("interactive cancellation", () => {
  test("pickAccount throws PromptCancelledError on ESC", async () => {
    const exitPromptErr = new Error("prompt cancelled");
    exitPromptErr.name = "ExitPromptError";

    const failingSelect = async () => {
      throw exitPromptErr;
    };

    await expect(pickAccount(SEQ, "Switch to account:", failingSelect)).rejects.toBeInstanceOf(
      PromptCancelledError
    );
  });

  test("confirmAction throws PromptCancelledError on ESC", async () => {
    const exitPromptErr = new Error("prompt cancelled");
    exitPromptErr.name = "ExitPromptError";

    const failingConfirm = async () => {
      throw exitPromptErr;
    };

    await expect(confirmAction("Proceed?", failingConfirm)).rejects.toBeInstanceOf(
      PromptCancelledError
    );
  });

  test("pickAccount throws PromptCancelledError on CancelPromptError", async () => {
    const cancelErr = new Error("prompt cancelled");
    cancelErr.name = "CancelPromptError";

    const failingSelect = async () => {
      throw cancelErr;
    };

    await expect(pickAccount(SEQ, "Switch to account:", failingSelect)).rejects.toBeInstanceOf(
      PromptCancelledError
    );
  });

  test("confirmAction throws PromptCancelledError on CancelPromptError", async () => {
    const cancelErr = new Error("prompt cancelled");
    cancelErr.name = "CancelPromptError";

    const failingConfirm = async () => {
      throw cancelErr;
    };

    await expect(confirmAction("Proceed?", failingConfirm)).rejects.toBeInstanceOf(
      PromptCancelledError
    );
  });
});

describe("interactive display labels", () => {
  test("pickAccount shows UI sequence numbers, not internal ids", async () => {
    const seq: SequenceData = {
      activeAccountNumber: 3,
      lastUpdated: "2026-01-01T00:00:00.000Z",
      sequence: [2, 3],
      accounts: {
        "2": { email: "work@test.com", uuid: "bbb", added: "2026-01-01T00:00:00.000Z" },
        "3": { email: "personal@test.com", uuid: "ccc", added: "2026-01-01T00:00:00.000Z" },
      },
    };

    const fakeSelect = async (args: {
      message: string;
      choices: Array<{ name: string; value: string }>;
      theme?: unknown;
    }) => {
      expect(args.choices[0].name).toContain("1: work@test.com");
      expect(args.choices[1].name).toContain("2: personal@test.com");
      expect(args.choices[1].name).toContain("(active)");
      return args.choices[0].value;
    };

    await expect(pickAccount(seq, "Switch to account:", fakeSelect)).resolves.toBe("2");
  });

  test("pickAccount throws clear error for inconsistent sequence data", async () => {
    const brokenSeq: SequenceData = {
      activeAccountNumber: 9,
      lastUpdated: "2026-01-01T00:00:00.000Z",
      sequence: [9],
      accounts: {},
    };

    const fakeSelect = async (_args: {
      message: string;
      choices: Array<{ name: string; value: string }>;
      theme?: unknown;
    }) => {
      return "9";
    };

    await expect(pickAccount(brokenSeq, "Switch to account:", fakeSelect)).rejects.toThrow(
      /Corrupt sequence data/i
    );
  });

  test("pickAccount supports extra action choice for unmanaged current account", async () => {
    const seq: SequenceData = {
      activeAccountNumber: null,
      lastUpdated: "2026-01-01T00:00:00.000Z",
      sequence: [],
      accounts: {},
    };

    const addCurrentChoice = {
      name: "Add current logged-in account (new@test.com)",
      value: "__add_current_account__",
    };

    const fakeSelect = async (args: {
      message: string;
      choices: Array<{ name: string; value: string }>;
      theme?: unknown;
    }) => {
      expect(args.choices).toEqual([addCurrentChoice]);
      return addCurrentChoice.value;
    };

    await expect(
      pickAccount(seq, "Switch to account:", fakeSelect, [addCurrentChoice])
    ).resolves.toBe("__add_current_account__");
  });
});
