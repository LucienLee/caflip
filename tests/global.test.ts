// ABOUTME: Tests unified cross-provider picker choice building.
// ABOUTME: Ensures switch and add-current actions are generated with provider labels.

import { describe, expect, test } from "bun:test";
import { buildGlobalPickerChoices } from "../src/global";
import type { SequenceData } from "../src/accounts";

const CLAUDE_SEQ: SequenceData = {
  activeAccountNumber: 1,
  lastUpdated: "2026-01-01T00:00:00.000Z",
  sequence: [1],
  accounts: {
    "1": {
      email: "claude-work@test.com",
      uuid: "claude-1",
      added: "2026-01-01T00:00:00.000Z",
      alias: "work",
    },
  },
};

describe("buildGlobalPickerChoices", () => {
  test("includes provider-scoped switch choices with active markers", () => {
    const choices = buildGlobalPickerChoices([
      {
        provider: "claude",
        sequenceData: CLAUDE_SEQ,
        currentEmail: "claude-work@test.com",
      },
      {
        provider: "codex",
        sequenceData: null,
        currentEmail: "none",
      },
    ]);

    expect(choices).toHaveLength(1);
    expect(choices[0]?.name).toContain("Claude Code");
    expect(choices[0]?.name).toContain("1: claude-work@test.com");
    expect(choices[0]?.name).toContain("[work]");
    expect(choices[0]?.name).toContain("(active)");
    expect(choices[0]?.value).toBe("switch:claude:1");
  });

  test("includes add-current action when logged-in account is unmanaged", () => {
    const choices = buildGlobalPickerChoices([
      {
        provider: "claude",
        sequenceData: {
          ...CLAUDE_SEQ,
          accounts: {
            "1": {
              email: "other@test.com",
              uuid: "claude-1",
              added: "2026-01-01T00:00:00.000Z",
            },
          },
        },
        currentEmail: "new@test.com",
      },
      {
        provider: "codex",
        sequenceData: null,
        currentEmail: "none",
      },
    ]);

    expect(choices.some((c) => c.value === "add:claude")).toBe(true);
  });

  test("includes both providers when both have managed accounts", () => {
    const choices = buildGlobalPickerChoices([
      {
        provider: "claude",
        sequenceData: CLAUDE_SEQ,
        currentEmail: "none",
      },
      {
        provider: "codex",
        sequenceData: {
          activeAccountNumber: 2,
          lastUpdated: "2026-01-01T00:00:00.000Z",
          sequence: [2],
          accounts: {
            "2": {
              email: "codex@test.com",
              uuid: "codex-2",
              added: "2026-01-01T00:00:00.000Z",
            },
          },
        },
        currentEmail: "codex@test.com",
      },
    ]);

    expect(choices.some((c) => c.value === "switch:claude:1")).toBe(true);
    expect(choices.some((c) => c.value === "switch:codex:2")).toBe(true);
  });
});
