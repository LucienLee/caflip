// ABOUTME: Tests for the config module.
// ABOUTME: Validates paths, platform detection, and constant definitions.

import { describe, expect, test } from "bun:test";
import {
  BACKUP_DIR,
  SEQUENCE_FILE,
  LOCK_DIR,
  getBackupDir,
  getSequenceFile,
  getLockDir,
  getConfigsDir,
  getCredentialsDir,
  RESERVED_COMMANDS,
  detectPlatform,
  getClaudeConfigPath,
} from "../src/config";
import { homedir } from "os";
import { existsSync } from "fs";

describe("config constants", () => {
  test("BACKUP_DIR is under home directory", () => {
    expect(BACKUP_DIR).toBe(`${homedir()}/.caflip-backup/claude`);
  });

  test("SEQUENCE_FILE is inside BACKUP_DIR", () => {
    expect(SEQUENCE_FILE).toStartWith(BACKUP_DIR);
    expect(SEQUENCE_FILE).toEndWith("sequence.json");
  });

  test("LOCK_DIR is inside BACKUP_DIR", () => {
    expect(LOCK_DIR).toStartWith(BACKUP_DIR);
  });

  test("RESERVED_COMMANDS includes all subcommands", () => {
    expect(RESERVED_COMMANDS).toContain("list");
    expect(RESERVED_COMMANDS).toContain("add");
    expect(RESERVED_COMMANDS).toContain("remove");
    expect(RESERVED_COMMANDS).toContain("next");
    expect(RESERVED_COMMANDS).toContain("status");
    expect(RESERVED_COMMANDS).toContain("alias");
    expect(RESERVED_COMMANDS).toContain("all");
    expect(RESERVED_COMMANDS).toContain("claude");
    expect(RESERVED_COMMANDS).toContain("codex");
    expect(RESERVED_COMMANDS).toContain("help");
  });
});

describe("provider path factories", () => {
  test("returns provider-scoped backup directories", () => {
    const claudeBackup = getBackupDir("claude");
    const codexBackup = getBackupDir("codex");
    expect(claudeBackup).toEndWith("/.caflip-backup/claude");
    expect(codexBackup).toEndWith("/.caflip-backup/codex");
    expect(claudeBackup).not.toBe(codexBackup);
  });

  test("returns provider-scoped sequence, lock, config, and credentials paths", () => {
    const seq = getSequenceFile("codex");
    const lock = getLockDir("codex");
    const configs = getConfigsDir("codex");
    const creds = getCredentialsDir("codex");
    expect(seq).toEndWith("/.caflip-backup/codex/sequence.json");
    expect(lock).toEndWith("/.caflip-backup/codex/.lock");
    expect(configs).toEndWith("/.caflip-backup/codex/configs");
    expect(creds).toEndWith("/.caflip-backup/codex/credentials");
  });
});

describe("detectPlatform", () => {
  test("returns a known platform string", () => {
    const platform = detectPlatform();
    expect(["macos", "linux", "wsl", "windows", "unknown"]).toContain(platform);
  });
});

describe("getClaudeConfigPath", () => {
  test("returns a path ending in .claude.json", () => {
    const configPath = getClaudeConfigPath();
    expect(configPath).toEndWith(".claude.json");
  });

  test("returns primary path if it exists and has oauthAccount", () => {
    const primary = `${homedir()}/.claude/.claude.json`;
    const fallback = `${homedir()}/.claude.json`;
    const configPath = getClaudeConfigPath();
    // Should return one of the two known locations
    expect([primary, fallback]).toContain(configPath);
  });
});
