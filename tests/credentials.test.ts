// ABOUTME: Tests Claude credential path resolution and Linux/WSL active auth file handling.
// ABOUTME: Verifies CLAUDE_CONFIG_DIR is respected before falling back to ~/.claude.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  clearActiveCredentials,
  getClaudeCredentialsDir,
  getClaudeCredentialsPath,
  readCredentials,
  writeCredentials,
} from "../src/credentials";

const originalPlatform = process.platform;
const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}

describe("Claude credential path resolution", () => {
  test("uses CLAUDE_CONFIG_DIR when present", () => {
    const env = { CLAUDE_CONFIG_DIR: "/tmp/custom-claude" };
    expect(getClaudeCredentialsDir(env, "/Users/tester")).toBe("/tmp/custom-claude");
    expect(getClaudeCredentialsPath(env, "/Users/tester")).toBe(
      "/tmp/custom-claude/.credentials.json"
    );
  });

  test("falls back to ~/.claude when CLAUDE_CONFIG_DIR is absent", () => {
    const env = {};
    expect(getClaudeCredentialsDir(env, "/Users/tester")).toBe("/Users/tester/.claude");
    expect(getClaudeCredentialsPath(env, "/Users/tester")).toBe(
      "/Users/tester/.claude/.credentials.json"
    );
  });

  test("ignores blank CLAUDE_CONFIG_DIR values", () => {
    const env = { CLAUDE_CONFIG_DIR: "   " };
    expect(getClaudeCredentialsDir(env, "/Users/tester")).toBe("/Users/tester/.claude");
  });
});

describe("Linux Claude active credentials", () => {
  let tempDir: string;
  let credentialPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "caflip-claude-creds-"));
    credentialPath = join(tempDir, ".credentials.json");
    process.env.CLAUDE_CONFIG_DIR = tempDir;
    setPlatform("linux");
  });

  afterEach(() => {
    if (originalClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    }
    setPlatform(originalPlatform);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("writes active credentials to CLAUDE_CONFIG_DIR", async () => {
    const credentials = JSON.stringify({
      claudeAiOauth: {
        accessToken: "sk-ant-oat01-test",
        refreshToken: "sk-ant-ort01-test",
        expiresAt: 1748276587173,
        scopes: ["user:inference", "user:profile"],
      },
    });

    await writeCredentials(credentials);

    expect(existsSync(credentialPath)).toBe(true);
    expect(readFileSync(credentialPath, "utf-8")).toBe(credentials);
  });

  test("reads active credentials from CLAUDE_CONFIG_DIR", async () => {
    const credentials = "{\"claudeAiOauth\":{\"accessToken\":\"token\"}}";
    await writeCredentials(credentials);

    await expect(readCredentials()).resolves.toBe(credentials);
  });

  test("clears active credentials from CLAUDE_CONFIG_DIR", async () => {
    await writeCredentials("{\"claudeAiOauth\":{\"accessToken\":\"token\"}}");
    expect(existsSync(credentialPath)).toBe(true);

    await clearActiveCredentials();

    expect(existsSync(credentialPath)).toBe(false);
  });
});
