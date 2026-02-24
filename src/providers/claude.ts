// ABOUTME: Provider adapters for Claude and Codex, exposing a shared operation contract.
// ABOUTME: Keeps provider-specific auth mechanisms behind one interface.

import { existsSync, readFileSync } from "fs";
import { getClaudeConfigPath } from "../config";
import {
  clearActiveCredentials,
  deleteAccountConfig,
  deleteAccountCredentials,
  readAccountConfig,
  readAccountCredentials,
  readCredentials,
  writeAccountConfig,
  writeAccountCredentials,
  writeCredentials,
} from "../credentials";
import {
  clearCodexActiveAuth,
  deleteCodexAccountAuthBackup,
  getCodexCurrentAccount,
  readCodexAccountAuthBackup,
  readCodexActiveAuth,
  writeCodexAccountAuthBackup,
  writeCodexActiveAuth,
} from "./codex";

export interface AccountProvider {
  readonly name: "claude" | "codex";
  getCurrentAccountEmail(): string;
  readActiveAuth(): Promise<string>;
  writeActiveAuth(raw: string): Promise<void>;
  clearActiveAuth(): Promise<void>;
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

function getClaudeCurrentAccountEmail(): string {
  const configPath = getClaudeConfigPath();
  if (!existsSync(configPath)) return "none";
  try {
    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    return content?.oauthAccount?.emailAddress ?? "none";
  } catch {
    return "none";
  }
}

export const claudeProvider: AccountProvider = {
  name: "claude",
  getCurrentAccountEmail: getClaudeCurrentAccountEmail,
  readActiveAuth: readCredentials,
  writeActiveAuth: writeCredentials,
  clearActiveAuth: clearActiveCredentials,
  readAccountAuth: readAccountCredentials,
  writeAccountAuth: writeAccountCredentials,
  deleteAccountAuth: deleteAccountCredentials,
  readAccountConfig,
  writeAccountConfig,
  deleteAccountConfig,
};

export const codexProvider: AccountProvider = {
  name: "codex",
  getCurrentAccountEmail: () => getCodexCurrentAccount()?.email ?? "none",
  readActiveAuth: readCodexActiveAuth,
  writeActiveAuth: writeCodexActiveAuth,
  clearActiveAuth: clearCodexActiveAuth,
  readAccountAuth: readCodexAccountAuthBackup,
  writeAccountAuth: writeCodexAccountAuthBackup,
  deleteAccountAuth: deleteCodexAccountAuthBackup,
  // Codex MVP does not require separate config payloads.
  readAccountConfig: () => "",
  writeAccountConfig: async () => {},
  deleteAccountConfig: () => {},
};
