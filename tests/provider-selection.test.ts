// ABOUTME: Tests provider token parsing for CLI command routing.
// ABOUTME: Ensures positional provider syntax is parsed and non-provider args remain unqualified.

import { describe, expect, test } from "bun:test";
import { parseProviderArgs } from "../src/providers/types";

describe("provider selection", () => {
  test("returns null provider for top-level interactive no-args", () => {
    expect(parseProviderArgs([])).toEqual({
      provider: null,
      commandArgs: [],
      isProviderQualified: false,
    });
  });

  test("marks command as unqualified when provider is omitted", () => {
    expect(parseProviderArgs(["list"])).toEqual({
      provider: null,
      commandArgs: ["list"],
      isProviderQualified: false,
    });
  });

  test("selects codex when first token is codex", () => {
    expect(parseProviderArgs(["codex", "list"])).toEqual({
      provider: "codex",
      commandArgs: ["list"],
      isProviderQualified: true,
    });
  });

  test("selects claude when first token is claude", () => {
    expect(parseProviderArgs(["claude", "status"])).toEqual({
      provider: "claude",
      commandArgs: ["status"],
      isProviderQualified: true,
    });
  });

  test("rejects deprecated --provider flag format", () => {
    expect(() => parseProviderArgs(["--provider", "codex", "list"])).toThrow(
      /Use positional provider syntax/i
    );
  });
});
