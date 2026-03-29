// ABOUTME: Codex provider auth file operations for ChatGPT login mode MVP.
// ABOUTME: Reads/writes ~/.codex/auth.json and resolves current account identity from id_token.

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { runCapturedCommand } from "../login/runner";
import type { CommandRunner, LoginVerificationResult, ProviderLoginAdapter } from "../login/types";
import type { AccountProvider } from "./types";
import { homedir } from "os";
import { join } from "path";
import { sanitizeEmailForFilename, validateAccountNumber } from "../validation";

interface CodexAccount {
  email: string;
  accountId?: string;
  organizationId?: string;
  organizationName?: string;
  planType?: string;
  role?: string;
  uniqueKey?: string;
}

interface CodexAuthFile {
  auth_mode?: string;
  OPENAI_API_KEY?: string | null;
  tokens?: {
    id_token?: string;
    account_id?: string;
  };
}

interface CodexOrganization {
  id?: string;
  title?: string;
  role?: string;
  is_default?: boolean;
}

type CodexAccountResolution = {
  account: CodexAccount | null;
  ambiguousOrganization: boolean;
};

function getCodexAuthPath(): string {
  return join(process.env.HOME ?? homedir(), ".codex", "auth.json");
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function ensureBackupKeySafe(accountNum: string, email: string): void {
  if (!validateAccountNumber(accountNum)) {
    throw new Error(`Unsafe account number for filename: ${accountNum}`);
  }
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }
}

export async function readCodexActiveAuth(): Promise<string> {
  const authPath = getCodexAuthPath();
  if (!existsSync(authPath)) {
    return "";
  }
  try {
    return readFileSync(authPath, "utf-8");
  } catch {
    return "";
  }
}

export async function writeCodexActiveAuth(raw: string): Promise<void> {
  const codexDir = join(process.env.HOME ?? homedir(), ".codex");
  mkdirSync(codexDir, { recursive: true, mode: 0o700 });
  chmodSync(codexDir, 0o700);

  const authPath = getCodexAuthPath();
  writeFileSync(authPath, raw, { mode: 0o600 });
  chmodSync(authPath, 0o600);
}

export async function clearCodexActiveAuth(): Promise<void> {
  rmSync(getCodexAuthPath(), { force: true });
}

export async function readCodexAccountAuthBackup(
  accountNum: string,
  email: string,
  credentialsDir: string
): Promise<string> {
  ensureBackupKeySafe(accountNum, email);
  const backupPath = join(
    credentialsDir,
    `.codex-auth-${accountNum}-${email}.json`
  );
  if (!existsSync(backupPath)) {
    return "";
  }
  try {
    return readFileSync(backupPath, "utf-8");
  } catch {
    return "";
  }
}

export async function writeCodexAccountAuthBackup(
  accountNum: string,
  email: string,
  raw: string,
  credentialsDir: string
): Promise<void> {
  ensureBackupKeySafe(accountNum, email);
  mkdirSync(credentialsDir, { recursive: true, mode: 0o700 });
  chmodSync(credentialsDir, 0o700);
  const backupPath = join(
    credentialsDir,
    `.codex-auth-${accountNum}-${email}.json`
  );
  writeFileSync(backupPath, raw, { mode: 0o600 });
  chmodSync(backupPath, 0o600);
}

export async function deleteCodexAccountAuthBackup(
  accountNum: string,
  email: string,
  credentialsDir: string
): Promise<void> {
  ensureBackupKeySafe(accountNum, email);
  const backupPath = join(
    credentialsDir,
    `.codex-auth-${accountNum}-${email}.json`
  );
  rmSync(backupPath, { force: true });
}

function resolveCodexCurrentAccount(): CodexAccountResolution {
  const authPath = getCodexAuthPath();
  if (!existsSync(authPath)) {
    return { account: null, ambiguousOrganization: false };
  }

  try {
    const authObj = JSON.parse(readFileSync(authPath, "utf-8")) as CodexAuthFile;

    const idToken = authObj.tokens?.id_token;
    if (!idToken) {
      return { account: null, ambiguousOrganization: false };
    }

    const payload = decodeJwtPayload(idToken);
    if (!payload) {
      return { account: null, ambiguousOrganization: false };
    }

    const email = typeof payload.email === "string" ? payload.email : null;
    if (!email) {
      return { account: null, ambiguousOrganization: false };
    }

    const authPayload = payload["https://api.openai.com/auth"] as
      | {
          chatgpt_account_id?: string;
          chatgpt_plan_type?: string;
          organizations?: CodexOrganization[];
        }
      | undefined;
    const accountId = authPayload?.chatgpt_account_id ?? authObj.tokens?.account_id;
    const organizations = Array.isArray(authPayload?.organizations)
      ? authPayload.organizations
      : [];
    const organization = organizations.find((candidate) => candidate.is_default === true)
      ?? (organizations.length === 1 ? organizations[0] : undefined);
    const ambiguousOrganization = organizations.length > 1 && !organization;

    return {
      ambiguousOrganization,
      account: {
        email,
        accountId,
        organizationId: organization?.id,
        organizationName: organization?.title,
        planType: authPayload?.chatgpt_plan_type,
        role: organization?.role,
        uniqueKey: accountId && organization?.id ? `codex:${accountId}:${organization.id}` : undefined,
        identityStatus: ambiguousOrganization
          ? "ambiguous"
          : accountId && organization?.id
            ? "resolved"
            : "partial",
      },
    };
  } catch {
    return { account: null, ambiguousOrganization: false };
  }
}

export function getCodexCurrentAccount(): CodexAccount | null {
  return resolveCodexCurrentAccount().account;
}

function readCodexAuthFile(): CodexAuthFile | null {
  const authPath = getCodexAuthPath();
  if (!existsSync(authPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(authPath, "utf-8")) as CodexAuthFile;
  } catch {
    return null;
  }
}

async function verifyCodexLogin(
  commandRunner: CommandRunner = runCapturedCommand
): Promise<LoginVerificationResult> {
  const result = await commandRunner(["codex", "login", "status"]);

  if (result.exitCode !== 0) {
    return {
      ok: false,
      reason: result.stderr || "codex login status failed",
    };
  }

  const authFile = readCodexAuthFile();
  if (!authFile) {
    return {
      ok: false,
      reason: "codex auth file was missing or unreadable after successful login status",
    };
  }

  if (authFile.OPENAI_API_KEY) {
    return {
      ok: false,
      reason: "caflip does not support Codex API key login sessions",
      details: {
        authMode: authFile.auth_mode ?? "apikey",
      },
    };
  }
  if (authFile.auth_mode && authFile.auth_mode !== "chatgpt") {
    return {
      ok: false,
      reason: `caflip does not support Codex ${authFile.auth_mode} login sessions`,
      details: {
        authMode: authFile.auth_mode,
      },
    };
  }

  const { account: currentAccount, ambiguousOrganization } = resolveCodexCurrentAccount();
  if (!currentAccount?.email) {
    return {
      ok: false,
      reason: "codex auth file did not resolve a current account email",
    };
  }
  if (ambiguousOrganization) {
    return {
      ok: false,
      reason: "codex login resolved an ambiguous workspace context: multiple organizations without a default workspace",
    };
  }

  return {
    ok: true,
    email: currentAccount.email,
    details: {
      accountId: currentAccount.accountId,
      organizationId: currentAccount.organizationId,
      organizationName: currentAccount.organizationName,
      planType: currentAccount.planType,
    },
  };
}

const codexLoginAdapter: ProviderLoginAdapter = {
  buildCommand: (passthroughArgs) => ["codex", "login", ...passthroughArgs],
  verifyLogin: verifyCodexLogin,
};

export const codexProvider: AccountProvider = {
  name: "codex",
  login: codexLoginAdapter,
  usesAccountConfig: false,
  getCurrentAccount: getCodexCurrentAccount,
  getCurrentAccountEmail: () => getCodexCurrentAccount()?.email ?? "none",
  readActiveAuth: readCodexActiveAuth,
  writeActiveAuth: writeCodexActiveAuth,
  clearActiveAuth: clearCodexActiveAuth,
  readActiveConfig: async () => "",
  writeActiveConfig: async () => {},
  clearActiveConfig: async () => {},
  readAccountAuth: readCodexAccountAuthBackup,
  writeAccountAuth: writeCodexAccountAuthBackup,
  deleteAccountAuth: deleteCodexAccountAuthBackup,
  readAccountConfig: () => "",
  writeAccountConfig: async () => {},
  deleteAccountConfig: () => {},
};
