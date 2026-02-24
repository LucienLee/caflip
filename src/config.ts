// ABOUTME: Configuration constants and platform detection for ccflip.
// ABOUTME: Defines paths, reserved commands, and Claude config file resolution.

import { homedir } from "os";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { ProviderName } from "./providers/types";

export type Platform = "macos" | "linux" | "wsl" | "windows" | "unknown";

export function getBackupDir(provider: ProviderName): string {
  return join(homedir(), ".caflip-backup", provider);
}

export function getSequenceFile(provider: ProviderName): string {
  return join(getBackupDir(provider), "sequence.json");
}

export function getLockDir(provider: ProviderName): string {
  return join(getBackupDir(provider), ".lock");
}

export function getConfigsDir(provider: ProviderName): string {
  return join(getBackupDir(provider), "configs");
}

export function getCredentialsDir(provider: ProviderName): string {
  return join(getBackupDir(provider), "credentials");
}

export const BACKUP_DIR = getBackupDir("claude");
export const SEQUENCE_FILE = getSequenceFile("claude");
export const LOCK_DIR = getLockDir("claude");
export const CONFIGS_DIR = getConfigsDir("claude");
export const CREDENTIALS_DIR = getCredentialsDir("claude");

export const RESERVED_COMMANDS = [
  "list",
  "add",
  "remove",
  "next",
  "status",
  "alias",
  "all",
  "claude",
  "codex",
  "help",
] as const;

export function detectPlatform(): Platform {
  switch (process.platform) {
    case "darwin":
      return "macos";
    case "linux":
      return process.env.WSL_DISTRO_NAME ? "wsl" : "linux";
    case "win32":
      return "windows";
    default:
      return "unknown";
  }
}

export function getClaudeConfigPath(): string {
  const primary = join(homedir(), ".claude", ".claude.json");
  const fallback = join(homedir(), ".claude.json");

  if (existsSync(primary)) {
    try {
      const content = JSON.parse(readFileSync(primary, "utf-8"));
      if (content.oauthAccount) {
        return primary;
      }
    } catch {
      // Fall through to fallback
    }
  }

  return fallback;
}
