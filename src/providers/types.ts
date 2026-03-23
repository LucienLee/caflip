// ABOUTME: Provider types and CLI parsing helpers for multi-provider support.
// ABOUTME: Defines supported providers, shared provider contracts, and positional parsing logic.

import type { ProviderLoginAdapter } from "../login/types";

export type ProviderName = "claude" | "codex";

export interface AccountProvider {
  readonly name: ProviderName;
  readonly login: ProviderLoginAdapter;
  readonly usesAccountConfig: boolean;
  getCurrentAccount(): { email: string; accountId?: string } | null;
  getCurrentAccountEmail(): string;
  readActiveAuth(): Promise<string>;
  writeActiveAuth(raw: string): Promise<void>;
  clearActiveAuth(): Promise<void>;
  readActiveConfig(): Promise<string>;
  writeActiveConfig(raw: string): Promise<void>;
  clearActiveConfig(): Promise<void>;
  readAccountAuth(accountNum: string, email: string, credentialsDir: string): Promise<string>;
  writeAccountAuth(
    accountNum: string,
    email: string,
    raw: string,
    credentialsDir: string
  ): Promise<void>;
  deleteAccountAuth(accountNum: string, email: string, credentialsDir: string): Promise<void>;
  readAccountConfig(accountNum: string, email: string, configsDir: string): string;
  writeAccountConfig(
    accountNum: string,
    email: string,
    config: string,
    configsDir: string
  ): Promise<void>;
  deleteAccountConfig(accountNum: string, email: string, configsDir: string): void;
}

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
