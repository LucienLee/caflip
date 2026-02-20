// ABOUTME: Platform-specific credential and config storage for Claude Code accounts.
// ABOUTME: Uses macOS Keychain (security CLI) on macOS and file-based storage on Linux/WSL.

import { existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { detectPlatform, CREDENTIALS_DIR } from "./config";
import { writeJsonAtomic } from "./files";
import { sanitizeEmailForFilename } from "./validation";

// Run a shell command and return stdout, or empty string on failure.
async function exec(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return output.trim();
}

// Read the active Claude Code credentials.
export async function readCredentials(): Promise<string> {
  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      return exec([
        "security",
        "find-generic-password",
        "-s",
        "Claude Code-credentials",
        "-w",
      ]);
    }
    case "linux":
    case "wsl": {
      const credPath = join(homedir(), ".claude", ".credentials.json");
      if (existsSync(credPath)) {
        return readFileSync(credPath, "utf-8");
      }
      return "";
    }
    default:
      return "";
  }
}

// Write the active Claude Code credentials.
export async function writeCredentials(credentials: string): Promise<void> {
  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      const proc = Bun.spawn(
        [
          "security",
          "add-generic-password",
          "-U",
          "-s",
          "Claude Code-credentials",
          "-a",
          process.env.USER ?? "unknown",
          "-w",
          credentials,
        ],
        { stdout: "pipe", stderr: "pipe" }
      );
      await proc.exited;
      break;
    }
    case "linux":
    case "wsl": {
      const claudeDir = join(homedir(), ".claude");
      mkdirSync(claudeDir, { recursive: true });
      const credPath = join(claudeDir, ".credentials.json");
      await Bun.write(credPath, credentials, { mode: 0o600 } as any);
      break;
    }
  }
}

// Read backed-up credentials for a specific account.
export async function readAccountCredentials(
  accountNum: string,
  email: string
): Promise<string> {
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }

  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      return exec([
        "security",
        "find-generic-password",
        "-s",
        `Claude Code-Account-${accountNum}-${email}`,
        "-w",
      ]);
    }
    case "linux":
    case "wsl": {
      const credFile = join(
        CREDENTIALS_DIR,
        `.claude-credentials-${accountNum}-${email}.json`
      );
      if (existsSync(credFile)) {
        return readFileSync(credFile, "utf-8");
      }
      return "";
    }
    default:
      return "";
  }
}

// Write backed-up credentials for a specific account.
export async function writeAccountCredentials(
  accountNum: string,
  email: string,
  credentials: string
): Promise<void> {
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }

  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      const proc = Bun.spawn(
        [
          "security",
          "add-generic-password",
          "-U",
          "-s",
          `Claude Code-Account-${accountNum}-${email}`,
          "-a",
          process.env.USER ?? "unknown",
          "-w",
          credentials,
        ],
        { stdout: "pipe", stderr: "pipe" }
      );
      await proc.exited;
      break;
    }
    case "linux":
    case "wsl": {
      const credFile = join(
        CREDENTIALS_DIR,
        `.claude-credentials-${accountNum}-${email}.json`
      );
      mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
      // Credentials are JSON, use atomic write
      const parsed = JSON.parse(credentials);
      await writeJsonAtomic(credFile, parsed);
      break;
    }
  }
}

// Delete backed-up credentials for a specific account.
export async function deleteAccountCredentials(
  accountNum: string,
  email: string
): Promise<void> {
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }

  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      const proc = Bun.spawn(
        [
          "security",
          "delete-generic-password",
          "-s",
          `Claude Code-Account-${accountNum}-${email}`,
        ],
        { stdout: "pipe", stderr: "pipe" }
      );
      await proc.exited;
      break;
    }
    case "linux":
    case "wsl": {
      const { rmSync } = await import("fs");
      const credFile = join(
        CREDENTIALS_DIR,
        `.claude-credentials-${accountNum}-${email}.json`
      );
      rmSync(credFile, { force: true });
      break;
    }
  }
}

// Read backed-up config for a specific account.
export function readAccountConfig(
  accountNum: string,
  email: string,
  configsDir: string
): string {
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }
  const configFile = join(
    configsDir,
    `.claude-config-${accountNum}-${email}.json`
  );
  if (existsSync(configFile)) {
    return readFileSync(configFile, "utf-8");
  }
  return "";
}

// Write backed-up config for a specific account.
export async function writeAccountConfig(
  accountNum: string,
  email: string,
  config: string,
  configsDir: string
): Promise<void> {
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }
  const configFile = join(
    configsDir,
    `.claude-config-${accountNum}-${email}.json`
  );
  mkdirSync(configsDir, { recursive: true, mode: 0o700 });
  const parsed = JSON.parse(config);
  await writeJsonAtomic(configFile, parsed);
}

// Delete backed-up config for a specific account.
export function deleteAccountConfig(
  accountNum: string,
  email: string,
  configsDir: string
): void {
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }
  const { rmSync } = require("fs");
  const configFile = join(
    configsDir,
    `.claude-config-${accountNum}-${email}.json`
  );
  rmSync(configFile, { force: true });
}
