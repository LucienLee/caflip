// ABOUTME: Tests provider registry contract for Claude and Codex adapters.
// ABOUTME: Ensures each provider exposes the expected operation surface.

import { describe, expect, test } from "bun:test";
import { getProvider, providers } from "../src/providers";

describe("provider adapter registry", () => {
  test("registers both claude and codex providers", () => {
    expect(providers.claude.name).toBe("claude");
    expect(providers.codex.name).toBe("codex");
  });

  test("exposes required methods for each provider", () => {
    for (const provider of [providers.claude, providers.codex]) {
      expect(typeof provider.getCurrentAccountEmail).toBe("function");
      expect(typeof provider.readActiveAuth).toBe("function");
      expect(typeof provider.writeActiveAuth).toBe("function");
      expect(typeof provider.clearActiveAuth).toBe("function");
      expect(typeof provider.readAccountAuth).toBe("function");
      expect(typeof provider.writeAccountAuth).toBe("function");
      expect(typeof provider.deleteAccountAuth).toBe("function");
      expect(typeof provider.readAccountConfig).toBe("function");
      expect(typeof provider.writeAccountConfig).toBe("function");
      expect(typeof provider.deleteAccountConfig).toBe("function");
    }
  });

  test("getProvider returns provider by name", () => {
    expect(getProvider("claude").name).toBe("claude");
    expect(getProvider("codex").name).toBe("codex");
  });
});
