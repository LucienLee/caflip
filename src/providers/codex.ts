// ABOUTME: Codex provider auth file operations for ChatGPT login mode MVP.
// ABOUTME: Reads/writes ~/.codex/auth.json and resolves current account identity from id_token.

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { sanitizeEmailForFilename, validateAccountNumber } from "../validation";

interface CodexAccount {
  email: string;
  accountId?: string;
}

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
  return readFileSync(authPath, "utf-8");
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
  return readFileSync(backupPath, "utf-8");
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

export function getCodexCurrentAccount(): CodexAccount | null {
  const authPath = getCodexAuthPath();
  if (!existsSync(authPath)) {
    return null;
  }

  try {
    const authObj = JSON.parse(readFileSync(authPath, "utf-8")) as {
      tokens?: {
        id_token?: string;
        account_id?: string;
      };
    };

    const idToken = authObj.tokens?.id_token;
    if (!idToken) {
      return null;
    }

    const payload = decodeJwtPayload(idToken);
    if (!payload) {
      return null;
    }

    const email = typeof payload.email === "string" ? payload.email : null;
    if (!email) {
      return null;
    }

    const authPayload = payload["https://api.openai.com/auth"] as
      | { chatgpt_account_id?: string }
      | undefined;
    const accountId = authPayload?.chatgpt_account_id ?? authObj.tokens?.account_id;

    return {
      email,
      accountId,
    };
  } catch {
    return null;
  }
}
