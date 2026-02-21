// ABOUTME: Configuration constants and platform detection for ccflip.
// ABOUTME: Defines paths, reserved commands, and Claude config file resolution.

import { homedir } from "os";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type Platform = "macos" | "linux" | "wsl" | "windows" | "unknown";

export const BACKUP_DIR = join(homedir(), ".claude-switch-backup");
export const SEQUENCE_FILE = join(BACKUP_DIR, "sequence.json");
export const LOCK_DIR = join(BACKUP_DIR, ".lock");
export const CONFIGS_DIR = join(BACKUP_DIR, "configs");
export const CREDENTIALS_DIR = join(BACKUP_DIR, "credentials");

export const RESERVED_COMMANDS = [
  "list",
  "add",
  "remove",
  "next",
  "status",
  "alias",
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
