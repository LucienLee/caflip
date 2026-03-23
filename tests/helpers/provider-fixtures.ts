// ABOUTME: Shared test fixtures for fake provider binaries and JWT payloads.
// ABOUTME: Keeps login and provider tests aligned on fake Codex/Claude CLI behavior.

import { chmodSync, writeFileSync } from "fs";
import { join } from "path";

function toBase64Url(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function makeJwt(payload: Record<string, unknown>): string {
  return `${toBase64Url({ alg: "none", typ: "JWT" })}.${toBase64Url(payload)}.sig`;
}

export function writeFakeCodexBinary(binDir: string, email: string, accountId: string): void {
  const codexScript = `#!/bin/sh
set -eu
if [ "$1" = "login" ]; then
  shift
  if [ "\${1:-}" = "status" ]; then
    echo "Logged in using ChatGPT"
    exit 0
  fi
  mkdir -p "$HOME/.codex"
  cat > "$HOME/.codex/auth.json" <<'EOF'
{
  "auth_mode": "chatgpt",
  "tokens": {
    "id_token": "${makeJwt({
      email,
      "https://api.openai.com/auth": { chatgpt_account_id: accountId },
    })}",
    "account_id": "${accountId}"
  }
}
EOF
  exit 0
fi
echo "unexpected args: $@" >&2
exit 1
`;

  const codexPath = join(binDir, "codex");
  writeFileSync(codexPath, codexScript, { mode: 0o755 });
  chmodSync(codexPath, 0o755);
}

export function writeFakeClaudeBinary(
  binDir: string,
  statusEmail: string,
  accountId: string,
  options?: { localEmail?: string; invalidStatusJson?: boolean }
): void {
  const localEmail = options?.localEmail ?? statusEmail;
  const statusPayload = options?.invalidStatusJson
    ? "not-json"
    : `{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "email": "${statusEmail}",
  "orgId": "org-test",
  "orgName": "Test Org",
  "subscriptionType": "team"
}`;

  const claudeScript = `#!/bin/sh
set -eu
if [ "$1" = "auth" ] && [ "$2" = "login" ]; then
  mkdir -p "$HOME/.claude"
  cat > "$HOME/.claude/.credentials.json" <<'EOF'
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-test",
    "refreshToken": "sk-ant-ort01-test",
    "expiresAt": 1748276587173,
    "scopes": ["user:inference", "user:profile"]
  }
}
EOF
  cat > "$HOME/.claude/.claude.json" <<'EOF'
{
  "oauthAccount": {
    "emailAddress": "${localEmail}",
    "accountUuid": "${accountId}"
  }
}
EOF
  exit 0
fi
if [ "$1" = "auth" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  cat <<'EOF'
${statusPayload}
EOF
  exit 0
fi
echo "unexpected args: $@" >&2
exit 1
`;

  const claudePath = join(binDir, "claude");
  writeFileSync(claudePath, claudeScript, { mode: 0o755 });
  chmodSync(claudePath, 0o755);
}

export function writeFakeSecurityBinary(binDir: string, credentialsJson: string): void {
  const securityScript = `#!/bin/sh
set -eu
if [ "$1" = "find-generic-password" ] && [ "$2" = "-s" ] && [ "$3" = "Claude Code-credentials" ] && [ "$4" = "-w" ]; then
  printf '%s' '${credentialsJson.replace(/'/g, `'\"'\"'`)}'
  exit 0
fi
if [ "$1" = "add-generic-password" ]; then
  exit 0
fi
if [ "$1" = "delete-generic-password" ]; then
  exit 0
fi
echo "security stub unexpected args: $@" >&2
exit 1
`;

  const securityPath = join(binDir, "security");
  writeFileSync(securityPath, securityScript, { mode: 0o755 });
  chmodSync(securityPath, 0o755);
}
