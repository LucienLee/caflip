// ABOUTME: Codex provider auth file operations for ChatGPT login mode MVP.
// ABOUTME: Reads/writes ~/.codex/auth.json and resolves current account identity from id_token.

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

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
