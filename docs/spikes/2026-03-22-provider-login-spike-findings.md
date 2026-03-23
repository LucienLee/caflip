# Provider Login Spike Findings

Date: 2026-03-22
Status: Research complete
Related plan: `docs/superpowers/plans/2026-03-17-login-spike-plan.md`

## Goal

Validate whether `caflip` can safely orchestrate the official `codex` and `claude` login flows, then detect the resulting logged-in account strongly enough to auto-register it back into caflip.

This document records technical validation only. No implementation work was done.

## Scope

Checked:

- installed CLI command shapes for `codex` and `claude`
- official status commands, when available
- current local auth/config file shapes used by caflip readers
- whether caflip's current provider readers are sufficient for post-login detection

Did not check:

- full interactive login completion
- browser/OAuth flow details
- account switching after a fresh login
- Windows behavior

## Environment

- repo: `caflip`
- date of validation: 2026-03-22
- shell: `zsh`
- platform under test: macOS
- installed Codex CLI: `codex-cli 0.115.0`
- installed Claude CLI: `2.1.81 (Claude Code)`

## Commands Observed

### Codex

Observed command shape:

```sh
codex login
codex login status
```

Observed help summary:

- `codex login` exists and is a first-class command
- `codex login status` exists and can be used as a post-login verification step
- `codex login` also supports `--with-api-key` and `--device-auth`

Observed status output:

```text
Logged in using ChatGPT
```

Implication:

- The spike plan assumed `codex login` exists. That assumption is correct.
- The plan did not rely on `codex login status`, but it should. This gives a stronger official verification path than reading local files alone.

### Claude

Observed command shape:

```sh
claude auth login
claude auth status --json
claude auth status --text
```

Observed help summary:

- `claude auth login` exists
- supports `--email`
- supports `--sso`
- supports `--claudeai` and `--console`
- `claude auth status` exists with `--json` and `--text`

Observed status output from validated runs:

```json
{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty"
  "email": "lucien@aibor.io",
  "orgId": "8d86291a-f009-4ec1-8244-25d9c2fefdf7",
  "orgName": "Aibor",
  "subscriptionType": "team"
}
```

Implication:

- The spike plan assumed `claude auth login` exists. That assumption is correct.
- The official CLI provides a machine-readable verification command. Any Claude login orchestration should use that as the source of truth.

## Current caflip Reader Assumptions

### Codex reader

Current implementation: `src/providers/codex.ts`

Current detection strategy:

- read `~/.codex/auth.json`
- extract `tokens.id_token`
- decode JWT payload
- use payload `email`
- use `https://api.openai.com/auth.chatgpt_account_id` or fallback `tokens.account_id`

Observed local file shape:

```json
{
  "OPENAI_API_KEY": "...",
  "auth_mode": "...",
  "last_refresh": "...",
  "tokens": {
    "access_token": "...",
    "account_id": "...",
    "id_token": "...",
    "refresh_token": "..."
  }
}
```

Observed JWT payload shape relevant to caflip:

- `email` exists
- `https://api.openai.com/auth.chatgpt_account_id` exists

Assessment:

- Current Codex reader assumptions match the environment under test.
- For the spike, Codex post-login detection is likely reliable if validated with both:
  - `codex login status`
  - `~/.codex/auth.json` parsing through existing caflip logic

### Claude reader

Current implementation: `src/providers/claude.ts`

Current detection strategy:

- resolve config path via `getClaudeConfigPath()`
- read `oauthAccount.emailAddress`
- treat that as the current logged-in account

Current auth storage strategy for active credentials on macOS:

- read Keychain item `Claude Code-credentials`

Observed local config state:

- `~/.claude.json` exists
- `oauthAccount.emailAddress` exists

Observed official Claude status:

- `claude auth status --json` can report full logged-in identity, including email and org metadata
- `claude auth status --text` reports the same session in human-readable form

Assessment:

- Current Claude reader assumptions are still weaker than the official CLI status signal.
- The official `claude auth status --json` output is strong enough to be the primary post-login success gate.
- caflip should still avoid treating `oauthAccount.emailAddress` alone as proof of an active session, because the official status command exposes richer and more authoritative state.

## Key Finding

The shared login orchestration idea is viable, but the shared post-login verification strategy should still be provider-owned rather than assuming all local readers are equally authoritative.

- Codex: current caflip reader is consistent with observed local auth shape, and the official CLI adds a usable status command.
- Claude: the official CLI status signal is richer and more authoritative than caflip's current config-based reader.

This means the spike should not treat "reader can resolve an email" as a universal provider-agnostic success condition.

## Decision Against Original Plan Assumptions

### Assumption: current caflip readers are enough to validate login completion

Result:

- Codex: mostly yes
- Claude: only if official `claude auth status --json` is the gate, not config-email alone

### Assumption: both providers can share one symmetric post-login registration path

Result:

- only partially true
- the outer lifecycle can stay symmetric
- the verification gate must be provider-aware

### Assumption: the spike can decide ship/no-ship without a separate findings doc

Result:

- false
- a findings doc is necessary because Claude behavior diverges from the original design assumptions

## Recommended Verification Model

### Codex

Recommended success gate after subprocess exit:

1. `codex login status` indicates logged in
2. caflip's Codex reader can resolve an email from `~/.codex/auth.json`

Why:

- official CLI confirms session state
- local file parsing confirms caflip can actually register the account it needs to manage

### Claude

Recommended success gate after subprocess exit:

1. `claude auth status --json` returns `loggedIn: true`
2. use returned `email` as the primary identity for registration
3. only then read local account/config data if extra metadata is still needed

Why:

- the official status command already returns the canonical login state plus the account identity caflip needs

## Go / No-Go Recommendation

### Codex

Recommendation: Go

Reason:

- command exists
- status command exists
- local auth file matches caflip assumptions
- registration path appears technically feasible

### Claude

Recommendation: Go, with a revised verification design

Reason:

- official status command exists and returns strong machine-readable identity data
- the spike should use official status output as the success gate instead of relying on config-email alone

### Product-level recommendation

Recommended decision:

- ship `codex` first
- `claude` is also feasible, but only with official `claude auth status --json` as the required gate before registration
- do not ship `claude` login orchestration if it relies only on config-reader success

## Minimum Plan Changes Before Any Implementation

The plan in `docs/superpowers/plans/2026-03-17-login-spike-plan.md` should be adjusted as follows:

1. Treat provider verification as provider-owned, not fully generic.
2. Add `codex login status` to the Codex verification path.
3. Require `claude auth status --json` for Claude success detection.
4. Remove any assumption that Claude config email alone proves active login.
5. Update the final decision gate to allow `codex`-only ship without forcing a second auth architecture for Claude.

## Evidence Summary

Commands run during validation:

```sh
which codex
codex --version
codex login --help
codex login status
codex login status --help

which claude
claude --version
claude auth login --help
claude auth status --help
claude auth status --json
claude auth status --text

jq '{top_level_keys:(keys), token_keys:(.tokens|keys), has_id_token:(.tokens.id_token!=null), has_account_id:(.tokens.account_id!=null)}' ~/.codex/auth.json
jq '{top_level_keys:(keys), oauth_keys:(.oauthAccount|keys), has_email:(.oauthAccount.emailAddress!=null)}' ~/.claude.json
security find-generic-password -s 'Claude Code-credentials'
```

## Bottom Line

The spike is worth continuing only if it stops pretending both providers can use the same post-login proof.

- `codex` is technically ready for a real spike implementation.
- `claude` is also technically viable if caflip treats `claude auth status --json` as the source of truth.
