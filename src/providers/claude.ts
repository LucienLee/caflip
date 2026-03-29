// ABOUTME: Claude provider adapter and auth/config operations.
// ABOUTME: Keeps Claude-specific session detection, storage, and login verification in one module.

import { existsSync, readFileSync } from "fs";
import { getClaudeConfigPath } from "../config";
import { writeJsonAtomic } from "../files";
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
import { runCapturedCommand } from "../login/runner";
import type { CommandRunner, LoginVerificationResult, ProviderLoginAdapter } from "../login/types";
import type { AccountProvider } from "./types";

interface ClaudeStatusPayload {
  loggedIn?: boolean;
  email?: string;
  authMethod?: string;
  orgId?: string;
  orgName?: string;
  subscriptionType?: string;
}

function readClaudeConfigObject(): Record<string, any> | null {
  const configPath = getClaudeConfigPath();
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, any>;
  } catch {
    return null;
  }
}

function getClaudeCurrentAccount(): { email: string; accountId?: string } | null {
  const content = readClaudeConfigObject();
  const email = content?.oauthAccount?.emailAddress;
  if (typeof email !== "string" || !email) {
    return null;
  }

  const accountId = typeof content?.oauthAccount?.accountUuid === "string"
    ? content.oauthAccount.accountUuid
    : undefined;
  const organizationId = typeof content?.oauthAccount?.organizationUuid === "string"
    ? content.oauthAccount.organizationUuid
    : undefined;
  const organizationName = typeof content?.oauthAccount?.organizationName === "string"
    ? content.oauthAccount.organizationName
    : undefined;
  const workspaceRole = typeof content?.oauthAccount?.workspaceRole === "string"
    ? content.oauthAccount.workspaceRole
    : undefined;
  const organizationRole = typeof content?.oauthAccount?.organizationRole === "string"
    ? content.oauthAccount.organizationRole
    : undefined;
  const accountName = typeof content?.oauthAccount?.displayName === "string"
    ? content.oauthAccount.displayName
    : undefined;

  return {
    email,
    accountId,
    organizationId,
    organizationName,
    role: workspaceRole ?? organizationRole,
    accountName,
    uniqueKey: accountId && organizationId ? `claude:${accountId}:${organizationId}` : undefined,
    identityStatus: accountId && organizationId ? "resolved" : "partial",
  };
}

function getClaudeCurrentAccountEmail(): string {
  return getClaudeCurrentAccount()?.email ?? "none";
}

async function readClaudeActiveConfig(): Promise<string> {
  const configPath = getClaudeConfigPath();
  if (!existsSync(configPath)) {
    return "";
  }

  try {
    return readFileSync(configPath, "utf-8");
  } catch {
    return "";
  }
}

async function writeClaudeActiveConfig(raw: string): Promise<void> {
  let targetConfig: Record<string, unknown>;
  try {
    targetConfig = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid Claude config backup");
  }

  const oauthAccount = targetConfig.oauthAccount;
  if (!oauthAccount) {
    throw new Error("Invalid oauthAccount in backup");
  }

  const configPath = getClaudeConfigPath();
  let currentConfigObj: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      currentConfigObj = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    } catch {
      currentConfigObj = {};
    }
  }
  currentConfigObj.oauthAccount = oauthAccount;
  await writeJsonAtomic(configPath, currentConfigObj);
}

async function clearClaudeActiveConfig(): Promise<void> {
  const configPath = getClaudeConfigPath();
  let configObj: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      configObj = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    } catch {
      configObj = {};
    }
  }

  delete configObj.oauthAccount;
  await writeJsonAtomic(configPath, configObj);
}

async function verifyClaudeLogin(
  commandRunner: CommandRunner = runCapturedCommand
): Promise<LoginVerificationResult> {
  const result = await commandRunner(["claude", "auth", "status", "--json"]);

  if (result.exitCode !== 0) {
    return {
      ok: false,
      reason: result.stderr || "claude auth status failed",
    };
  }

  let payload: ClaudeStatusPayload;
  try {
    payload = JSON.parse(result.stdout) as ClaudeStatusPayload;
  } catch {
    return {
      ok: false,
      reason: "claude auth status returned invalid JSON",
    };
  }

  if (payload.loggedIn !== true) {
    return {
      ok: false,
      reason: "claude auth status reported logged out",
      details: {
        loggedIn: payload.loggedIn ?? false,
      },
    };
  }

  if (!payload.email) {
    return {
      ok: false,
      reason: "claude auth status did not include an email",
    };
  }

  return {
    ok: true,
    email: payload.email,
    details: {
      authMethod: payload.authMethod,
      orgId: payload.orgId,
      orgName: payload.orgName,
      subscriptionType: payload.subscriptionType,
    },
  };
}

const claudeLoginAdapter: ProviderLoginAdapter = {
  buildCommand: (passthroughArgs) => ["claude", "auth", "login", ...passthroughArgs],
  verifyLogin: verifyClaudeLogin,
};

export const claudeProvider: AccountProvider = {
  name: "claude",
  login: claudeLoginAdapter,
  usesAccountConfig: true,
  getCurrentAccount: getClaudeCurrentAccount,
  getCurrentAccountEmail: getClaudeCurrentAccountEmail,
  readActiveAuth: readCredentials,
  writeActiveAuth: writeCredentials,
  clearActiveAuth: clearActiveCredentials,
  readActiveConfig: readClaudeActiveConfig,
  writeActiveConfig: writeClaudeActiveConfig,
  clearActiveConfig: clearClaudeActiveConfig,
  readAccountAuth: readAccountCredentials,
  writeAccountAuth: writeAccountCredentials,
  deleteAccountAuth: deleteAccountCredentials,
  readAccountConfig,
  writeAccountConfig,
  deleteAccountConfig,
};
