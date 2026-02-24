// ABOUTME: Provider types and CLI parsing helpers for multi-provider support.
// ABOUTME: Defines supported provider names and parsing logic for positional provider tokens.

export type ProviderName = "claude" | "codex";

export const SUPPORTED_PROVIDERS: ProviderName[] = ["claude", "codex"];

export function isProviderName(value: string): value is ProviderName {
  return SUPPORTED_PROVIDERS.includes(value as ProviderName);
}

export function parseProviderArgs(args: string[]): {
  provider: ProviderName | null;
  commandArgs: string[];
  isProviderQualified: boolean;
} {
  if (args[0] === "--provider") {
    throw new Error("Use positional provider syntax: caflip <claude|codex> <command>");
  }

  if (args[0] && isProviderName(args[0])) {
    return { provider: args[0], commandArgs: args.slice(1), isProviderQualified: true };
  }

  return { provider: null, commandArgs: args, isProviderQualified: false };
}
