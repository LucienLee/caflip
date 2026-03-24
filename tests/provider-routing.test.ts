// ABOUTME: Tests provider resolution rules for provider-less interactive commands.
// ABOUTME: Ensures add/remove/login prompt for provider selection while other commands keep existing policy.

import { describe, expect, mock, test } from "bun:test";
import {
  resolveCliContext,
  resolveProviderForCommand,
  supportsInteractiveProviderSelection,
} from "../src/index";

describe("provider routing", () => {
  test("only add remove and login support interactive provider selection", () => {
    expect(supportsInteractiveProviderSelection("add")).toBe(true);
    expect(supportsInteractiveProviderSelection("remove")).toBe(true);
    expect(supportsInteractiveProviderSelection("login")).toBe(true);
    expect(supportsInteractiveProviderSelection("next")).toBe(false);
    expect(supportsInteractiveProviderSelection("alias")).toBe(false);
    expect(supportsInteractiveProviderSelection("status")).toBe(false);
    expect(supportsInteractiveProviderSelection(undefined)).toBe(false);
  });

  test("returns existing provider without prompting", async () => {
    const readCliMeta = mock(() => ({ lastProvider: "claude" as const }));
    const pickProvider = mock(async () => "codex" as const);
    const writeLastProvider = mock(async () => {});

    await expect(
      resolveProviderForCommand("claude", "login", {
        readCliMeta,
        pickProvider,
        writeLastProvider,
      })
    ).resolves.toBe("claude");

    expect(readCliMeta).not.toHaveBeenCalled();
    expect(pickProvider).not.toHaveBeenCalled();
    expect(writeLastProvider).not.toHaveBeenCalled();
  });

  test("prompts for provider and persists selection for provider-less add", async () => {
    const readCliMeta = mock(() => ({ lastProvider: "codex" as const }));
    const pickProvider = mock(async (defaultProvider: "claude" | "codex") => {
      expect(defaultProvider).toBe("codex");
      return "claude" as const;
    });
    const writeLastProvider = mock(async () => {});

    await expect(
      resolveProviderForCommand(null, "add", {
        readCliMeta,
        pickProvider,
        writeLastProvider,
      })
    ).resolves.toBe("claude");

    expect(readCliMeta).toHaveBeenCalledTimes(1);
    expect(pickProvider).toHaveBeenCalledTimes(1);
    expect(writeLastProvider).toHaveBeenCalledWith("claude");
  });

  test("does not prompt for unsupported provider-less commands", async () => {
    const readCliMeta = mock(() => ({ lastProvider: "claude" as const }));
    const pickProvider = mock(async () => "codex" as const);
    const writeLastProvider = mock(async () => {});

    await expect(
      resolveProviderForCommand(null, "next", {
        readCliMeta,
        pickProvider,
        writeLastProvider,
      })
    ).resolves.toBeNull();

    expect(readCliMeta).not.toHaveBeenCalled();
    expect(pickProvider).not.toHaveBeenCalled();
    expect(writeLastProvider).not.toHaveBeenCalled();
  });

  test("resolves no-args invocation as interactive switch mode", async () => {
    await expect(
      resolveCliContext(
        {
          provider: null,
          commandArgs: [],
          isProviderQualified: false,
        },
        {
          resolveProviderForCommand: mock(async () => {
            throw new Error("should not resolve provider");
          }),
        }
      )
    ).resolves.toEqual({
      mode: "interactive-switch",
      provider: null,
      args: [],
      command: undefined,
    });
  });

  test("resolves provider-less list as all-provider read-only mode", async () => {
    await expect(
      resolveCliContext(
        {
          provider: null,
          commandArgs: ["list"],
          isProviderQualified: false,
        },
        {
          resolveProviderForCommand: mock(async () => {
            throw new Error("should not resolve provider");
          }),
        }
      )
    ).resolves.toEqual({
      mode: "all-providers",
      provider: null,
      args: ["list"],
      command: "list",
    });
  });

  test("resolves provider-less interactive command to selected provider", async () => {
    const resolveProvider = mock(async () => "codex" as const);

    await expect(
      resolveCliContext(
        {
          provider: null,
          commandArgs: ["add", "--alias", "work"],
          isProviderQualified: false,
        },
        {
          resolveProviderForCommand: resolveProvider,
        }
      )
    ).resolves.toEqual({
      mode: "provider-command",
      provider: "codex",
      args: ["add", "--alias", "work"],
      command: "add",
    });

    expect(resolveProvider).toHaveBeenCalledWith(null, "add");
  });
});
