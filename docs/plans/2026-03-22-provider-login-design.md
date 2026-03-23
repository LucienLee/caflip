# Unified Provider Login Design

Date: 2026-03-22
Status: Approved design
Scope: `caflip claude login` and `caflip codex login`

## Goal

Add a unified `login` interface to `caflip` that can orchestrate the official `claude` and `codex` login flows, verify the resulting session with provider-appropriate checks, and then register or refresh the active account in caflip.

This design does not change provider auth flows. `caflip` remains an orchestration layer around the official CLIs.

## Product Semantics

`caflip <provider> login` means:

1. run the provider's official login command
2. verify that login actually succeeded
3. register the resulting active session into caflip
4. keep the newly logged-in account as the current active account

This is intentionally different from a passive "launch login UI only" command.

If the login lands on an account that is already managed by caflip, caflip should refresh that account's stored auth/config backup instead of printing `already managed`.

The first version does not restore the previous active account after login.

## Command Contract

New commands:

- `caflip claude login [-- <provider-login-args...>]`
- `caflip codex login [-- <provider-login-args...>]`

Rules:

- caflip does not natively parse provider login flags.
- all args after `--` are passed through unchanged to the provider CLI
- caflip-specific login flags are out of scope for v1
- successful login automatically registers the active account

Examples:

```bash
caflip claude login -- --email lucien@aibor.io --sso
caflip claude login -- --console
caflip codex login -- --device-auth
```

## Why Passthrough Instead of Native Flags

Provider login flags are not caflip's product surface and may change frequently.

Using `--` passthrough keeps the contract stable:

- caflip does not need to mirror provider flag churn
- new provider flags work without caflip parser changes
- help text can stay simple
- future caflip-specific lifecycle flags remain available without ambiguity

## Shared Lifecycle

Both providers should follow the same outer lifecycle:

1. route `caflip <provider> login`
2. build provider login command
3. spawn official CLI with inherited stdio
4. if subprocess exits non-zero, stop without mutating caflip state
5. run provider-specific verification
6. if verification fails, stop without mutating caflip state
7. register the current active session in caflip with `updateIfExists: true`
8. print whether the account was added or updated

The symmetry stops at the outer lifecycle. Verification remains provider-owned.

## Provider-Specific Design

### Claude

Official login command:

```bash
claude auth login
```

Observed supported official login flags:

- `--claudeai`
- `--console`
- `--email <email>`
- `--sso`

Verification command:

```bash
claude auth status --json
```

Required success gate:

- `loggedIn === true`
- `email` is present

Reason:

- the official JSON status output is a stronger and more authoritative signal than config email alone
- caflip's local Claude readers are sufficient for registration, but the official status command should remain the login success gate

Registration dependencies:

- active credentials via caflip's Claude credential reader
- active config via `getClaudeConfigPath()`
- both now respect `CLAUDE_CONFIG_DIR`

### Codex

Official login command:

```bash
codex login
```

Observed official login variants from prior research:

- `--with-api-key`
- `--device-auth`

Verification commands:

```bash
codex login status
```

Required success gate:

1. `codex login status` indicates logged in
2. caflip's existing Codex reader can resolve an email from `~/.codex/auth.json`

Reason:

- the official status command confirms login state
- local auth parsing confirms caflip can actually manage the resulting session

Registration dependencies:

- active auth via existing Codex auth reader
- no separate config payload required in current Codex provider model

## Registration Design

Current `cmdAdd()` in `src/index.ts` mixes:

- active-account discovery
- validation
- auth/config backup reads
- sequence updates
- backup writes
- user-facing output

That logic should be split so login can reuse the same registration path.

Introduce a shared helper:

```ts
registerCurrentActiveAccount(options?: {
  alias?: string;
  updateIfExists?: boolean;
}): Promise<{
  action: "added" | "updated";
  accountNum: string;
  email: string;
}>
```

Behavior:

- discover current active account
- read active auth
- for Claude, also read active config and `oauthAccount.accountUuid`
- if account does not exist:
  - create sequence entry
  - write backups
  - return `added`
- if account exists and `updateIfExists === true`:
  - preserve account number and alias
  - refresh auth/config backup
  - update sequence timestamps as needed
  - return `updated`
- if account exists and `updateIfExists !== true`:
  - preserve current `already managed` behavior

Command usage:

- `cmdAdd()` uses `updateIfExists: false`
- `cmdLogin()` uses `updateIfExists: true`

## Failure Semantics

No caflip state should be mutated when:

- provider binary is missing
- official login subprocess exits non-zero
- verification command fails
- verification command succeeds but required identity fields are missing
- caflip cannot read the active auth/config needed for registration

This avoids partially registered sessions after an interrupted or inconsistent login.

## User-Facing Output

Suggested outputs:

- added:
  - `Added Account-2: lucien@aibor.io`
- updated:
  - `Updated Account-1: lucien@aibor.io`
- login subprocess failure:
  - `Claude Code login failed`
  - `Codex login failed`
- verification failure:
  - provider-specific message indicating login did not produce a readable active session

The first version should not print `already managed` after a successful login.

## Code Shape

Recommended file layout:

- `src/login/types.ts`
  - login adapter types
  - verification result types
- `src/login/runner.ts`
  - provider login subprocess execution
  - lightweight command construction helpers
- `src/index.ts`
  - command routing for `login`
  - shared `registerCurrentActiveAccount()`
  - help text updates
- `src/providers/claude.ts`
  - Claude login adapter metadata and verification
- `src/providers/codex.ts`
  - Codex login adapter metadata and verification

Alternative designs that duplicate login logic inside `src/index.ts` were rejected because they would reintroduce provider-specific branching into the CLI entrypoint.

## Testing Strategy

Minimum required tests:

### Login runner

- builds Claude login command with passthrough args
- builds Codex login command with passthrough args
- runs subprocess with inherited stdio
- reports non-zero exit cleanly

### Command routing

- `caflip claude login -- ...` is recognized
- `caflip codex login -- ...` is recognized
- help output includes `login`

### Registration reuse

- login success adds a new account
- login success on an existing account refreshes backup instead of returning early
- login failure does not mutate sequence or backups

### Provider verification

- Claude login requires `claude auth status --json` with `loggedIn: true` and `email`
- Codex login requires successful `codex login status` plus readable current account from local auth

### Regression coverage

- existing `add`, `status`, `next`, `switch`, and `remove` flows still behave the same

## Out of Scope

Not included in v1:

- restoring the previous active account after login
- caflip-native login flags such as `--no-register` or `--restore-previous`
- auto-restarting provider CLIs after login
- Windows-specific Claude behavior beyond existing support boundaries
- replacing provider-specific verification with one universal rule

## Decision Summary

Approved design:

- one unified `caflip <provider> login` interface
- provider flags passed through only after `--`
- shared orchestration lifecycle
- provider-owned verification
- shared registration helper
- existing accounts are refreshed, not rejected
- newly logged-in account remains active
