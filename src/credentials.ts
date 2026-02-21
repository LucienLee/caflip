// ABOUTME: Platform-specific credential and config storage for Claude Code accounts.
// ABOUTME: Uses macOS Keychain (security CLI) on macOS and file-based storage on Linux/WSL.

import { existsSync, readFileSync, mkdirSync, chmodSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { detectPlatform, CREDENTIALS_DIR } from "./config";
import { writeJsonAtomic } from "./files";
import { sanitizeEmailForFilename, validateAccountNumber } from "./validation";

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCommand(cmd: string[]): Promise<CommandResult> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

function isSecurityItemMissing(stderr: string): boolean {
  const msg = stderr.toLowerCase();
  return (
    msg.includes("could not be found") ||
    msg.includes("item could not be found") ||
    msg.includes("item not found")
  );
}

function ensureAccountNumberSafe(accountNum: string): void {
  if (!validateAccountNumber(accountNum)) {
    throw new Error(`Unsafe account number for filename: ${accountNum}`);
  }
}

function hasSecretTool(): boolean {
  return Boolean(Bun.which("secret-tool"));
}

function activeSecretToolAttrs(): string[] {
  return ["service", "claude-code", "account", "active"];
}

function backupSecretToolAttrs(accountNum: string, email: string): string[] {
  return ["service", "ccflip", "account", accountNum, "email", email];
}

async function secretToolLookup(attrs: string[]): Promise<string> {
  const result = await runCommand(["secret-tool", "lookup", ...attrs]);
  if (result.exitCode === 0) {
    return result.stdout;
  }
  return "";
}

async function secretToolStore(attrs: string[], secret: string): Promise<void> {
  const proc = Bun.spawn(["secret-tool", "store", "--label", "ccflip credentials", ...attrs], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (!proc.stdin) {
    throw new Error("Failed to open stdin for secret-tool");
  }

  const payload = secret.endsWith("\n") ? secret : `${secret}\n`;
  const stdin = proc.stdin as unknown as {
    write?: (data: string | Uint8Array) => unknown;
    end?: () => unknown;
    getWriter?: () => WritableStreamDefaultWriter<Uint8Array>;
  };

  if (typeof stdin.write === "function") {
    stdin.write(payload);
    if (typeof stdin.end === "function") {
      stdin.end();
    }
  } else if (typeof stdin.getWriter === "function") {
    const writer = stdin.getWriter();
    await writer.write(new TextEncoder().encode(payload));
    await writer.close();
  } else {
    throw new Error("Unsupported stdin interface for secret-tool");
  }

  const [stderr, exitCode] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `Failed to store credentials in secret-tool: ${
        stderr.trim() || `exit code ${exitCode}`
      }`
    );
  }
}

async function secretToolClear(attrs: string[]): Promise<void> {
  const result = await runCommand(["secret-tool", "clear", ...attrs]);
  if (result.exitCode !== 0 && result.stderr.trim()) {
    throw new Error(
      `Failed to clear credentials from secret-tool: ${
        result.stderr || `exit code ${result.exitCode}`
      }`
    );
  }
}

// Read the active Claude Code credentials.
export async function readCredentials(): Promise<string> {
  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      const result = await runCommand([
        "security",
        "find-generic-password",
        "-s",
        "Claude Code-credentials",
        "-w",
      ]);
      if (result.exitCode === 0) {
        return result.stdout;
      }
      if (isSecurityItemMissing(result.stderr)) {
        return "";
      }
      throw new Error(
        `Failed to read active credentials from keychain: ${
          result.stderr || `exit code ${result.exitCode}`
        }`
      );
    }
    case "linux":
    case "wsl": {
      if (hasSecretTool()) {
        const keyringValue = await secretToolLookup(activeSecretToolAttrs());
        if (keyringValue) {
          return keyringValue;
        }
      }

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
      const result = await runCommand(
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
      );
      if (result.exitCode !== 0) {
        throw new Error(
          `Failed to write active credentials to keychain: ${
            result.stderr || `exit code ${result.exitCode}`
          }`
        );
      }
      break;
    }
    case "linux":
    case "wsl": {
      if (hasSecretTool()) {
        await secretToolStore(activeSecretToolAttrs(), credentials);
        return;
      }

      const claudeDir = join(homedir(), ".claude");
      mkdirSync(claudeDir, { recursive: true, mode: 0o700 });
      chmodSync(claudeDir, 0o700);
      const credPath = join(claudeDir, ".credentials.json");
      await Bun.write(credPath, credentials, { mode: 0o600 } as any);
      chmodSync(credPath, 0o600);
      break;
    }
  }
}

// Read backed-up credentials for a specific account.
export async function readAccountCredentials(
  accountNum: string,
  email: string
): Promise<string> {
  ensureAccountNumberSafe(accountNum);
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }

  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      const result = await runCommand([
        "security",
        "find-generic-password",
        "-s",
        `Claude Code-Account-${accountNum}-${email}`,
        "-w",
      ]);
      if (result.exitCode === 0) {
        return result.stdout;
      }
      if (isSecurityItemMissing(result.stderr)) {
        return "";
      }
      throw new Error(
        `Failed to read account credentials from keychain: ${
          result.stderr || `exit code ${result.exitCode}`
        }`
      );
    }
    case "linux":
    case "wsl": {
      if (hasSecretTool()) {
        const keyringValue = await secretToolLookup(
          backupSecretToolAttrs(accountNum, email)
        );
        if (keyringValue) {
          return keyringValue;
        }
      }

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
  ensureAccountNumberSafe(accountNum);
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }

  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      const result = await runCommand(
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
      );
      if (result.exitCode !== 0) {
        throw new Error(
          `Failed to write account credentials to keychain: ${
            result.stderr || `exit code ${result.exitCode}`
          }`
        );
      }
      break;
    }
    case "linux":
    case "wsl": {
      if (hasSecretTool()) {
        await secretToolStore(backupSecretToolAttrs(accountNum, email), credentials);
        return;
      }

      const credFile = join(
        CREDENTIALS_DIR,
        `.claude-credentials-${accountNum}-${email}.json`
      );
      mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
      chmodSync(CREDENTIALS_DIR, 0o700);
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
  ensureAccountNumberSafe(accountNum);
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }

  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      const result = await runCommand(
        [
          "security",
          "delete-generic-password",
          "-s",
          `Claude Code-Account-${accountNum}-${email}`,
        ],
      );
      if (result.exitCode !== 0 && !isSecurityItemMissing(result.stderr)) {
        throw new Error(
          `Failed to delete account credentials from keychain: ${
            result.stderr || `exit code ${result.exitCode}`
          }`
        );
      }
      break;
    }
    case "linux":
    case "wsl": {
      if (hasSecretTool()) {
        await secretToolClear(backupSecretToolAttrs(accountNum, email));
      }
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
  ensureAccountNumberSafe(accountNum);
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
  ensureAccountNumberSafe(accountNum);
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
  ensureAccountNumberSafe(accountNum);
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }
  const configFile = join(
    configsDir,
    `.claude-config-${accountNum}-${email}.json`
  );
  rmSync(configFile, { force: true });
}
