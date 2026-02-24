# Provider-First CLI Design (caflip)

Date: 2026-02-24
Status: Approved
Branch: codex-mvp

## Context
caflip currently supports Claude and Codex account switching, but command behavior is mixed between provider-default and cross-provider entry points. We are standardizing behavior so users always think in explicit provider scope for non-interactive commands, while still keeping an interactive top-level entry.

## Goals
- Make command behavior predictable with explicit provider scope.
- Keep `caflip` as a short interactive entry point.
- Remove ambiguous shortcuts that conflict with provider-first mental model.
- Preserve prompt-friendly status output while adding machine-readable output.

## Non-Goals
- No backward-compatibility transition mode in this phase.
- No legacy fallback for `caflip list` / `caflip add` without provider.
- No cross-provider alias resolution command.

## Final Behavior Specification

### 1) Top-Level Entry
- `caflip` opens an interactive provider picker first.
- Provider choices: `Claude`, `Codex`.
- Default cursor remembers last selected provider.

### 2) Provider Interactive Entry
- `caflip claude` opens Claude account picker.
- `caflip codex` opens Codex account picker.
- If no managed accounts exist for selected provider, show empty-state actions:
  - `Add current logged-in account`
  - `Back` (returns to provider picker)

### 3) Non-Interactive Commands Must Be Provider-Qualified
Allowed examples:
- `caflip claude list`
- `caflip codex add --alias work`
- `caflip claude status`
- `caflip codex work`

Rejected examples:
- `caflip list`
- `caflip add`
- `caflip <alias>`

### 4) Remove `all`
- `caflip all` command is removed.
- Cross-provider list mode is not exposed as a command.

### 5) Alias Rules
- Alias uniqueness is provider-scoped (not global).
- `caflip <alias>` is invalid.
- Alias switch requires provider prefix:
  - `caflip claude <alias>`
  - `caflip codex <alias>`

### 6) `status` Output
- Command form: `caflip <provider> status [--json]`.
- Default output:
  - Logged in: `email [alias]` (omit alias if none)
  - Logged out: `none`
- JSON output:

```json
{"provider":"claude|codex","email":"string|null","alias":"string|null","managed":true}
```

### 7) Error Messaging
- Missing provider for non-interactive:
  - `Error: Provider is required for non-interactive commands.`
  - `Try: caflip claude list`
- Alias without provider:
  - `Error: Alias requires provider prefix.`
  - `Try: caflip claude <alias> or caflip codex <alias>`
- Add without active login:
  - `Error: No active Claude Code account found. Please log in first.`
  - `Error: No active Codex account found. Please log in first.`

### 8) Exit Codes
- `0`: success, including interactive cancel (`Cancelled`).
- `1`: runtime/system failure (IO, corrupt data, missing backup payload).
- `2`: usage errors (missing provider, unknown command, alias without provider).

## Data and State
- Continue provider-scoped storage:
  - `~/.caflip-backup/claude/...`
  - `~/.caflip-backup/codex/...`
- Add shared CLI metadata file for UX state:
  - `~/.caflip-backup/.meta.json`
  - initial field: `lastProvider: "claude" | "codex"`

## UX Notes
- Provider picker title: `Select provider`.
- Account picker title: `Switch <Provider> account`.
- Empty state title: `No managed <Provider> accounts yet`.
- Escape/cancel behavior remains uniform (`Cancelled`, exit `0`).

## Risks and Mitigations
- Risk: Existing users of `caflip list` may fail immediately.
  - Mitigation: clear, copy-pasteable error hints.
- Risk: One extra interactive step (`caflip` => provider picker).
  - Mitigation: remember `lastProvider` to reduce friction.
- Risk: Script consumers parsing status may break if format changes.
  - Mitigation: keep default concise text and add `--json` mode.

## Test Plan (Design-Level)
- Parser tests for provider-required non-interactive commands.
- Interactive tests for provider picker and empty-state add/back flow.
- Status tests for plain and `--json` output.
- Exit code tests for usage errors (`2`) vs runtime errors (`1`).
- Help/README tests or snapshots to enforce provider-first docs.

