# ccflip Design Document

Date: 2026-02-20

## Goal

Rewrite cc-account-switcher as a Bun + TypeScript CLI tool with better UX: interactive account selection, short subcommands, and cross-platform support (macOS, Linux, Windows).

## Background

The original `ccswitch.sh` is a Bash script that manages multiple Claude Code accounts. It works but has UX problems: long `--flag` commands, no interactive selection, requires remembering account numbers, and no way to see the current account at a glance. It also requires Bash 4.4+ (not default on macOS) and jq as dependencies.

## Tech Stack

- **Runtime**: Bun (development via `bun run`, distribution via `bun build --compile`)
- **Language**: TypeScript
- **External dependency**: `@inquirer/prompts` (interactive selection UI)
- **Everything else**: Bun built-in APIs (file I/O, JSON, subprocess)

## CLI Design

```
ccflip              # No args → interactive account picker + switch
ccflip list         # List accounts, highlight active
ccflip add          # Register the currently logged-in account
ccflip remove       # Interactive picker to remove (or: ccflip remove 2)
ccflip next         # Rotate to next account in sequence
ccflip status       # Print current account email (for shell prompt integration)
```

`ccflip` with no arguments is the primary interaction: pick an account from an interactive list, switch to it. One command for the most common operation.

## Project Structure

```
ccflip/
├── src/
│   ├── index.ts           # CLI entry point (command routing)
│   ├── accounts.ts        # Account CRUD (add, remove, list, read sequence)
│   ├── credentials.ts     # Platform credential storage (Keychain / file)
│   ├── interactive.ts     # Interactive selection menu
│   └── config.ts          # Paths, constants, platform detection
├── package.json
├── tsconfig.json
└── README.md
```

## Platform Credential Handling

Each platform has a different mechanism for storing OAuth credentials:

- **macOS**: `security` CLI for Keychain access (same approach as the Bash version)
- **Linux/WSL**: JSON files with 600 permissions under `~/.claude-switch-backup/credentials/`
- **Windows**: Deferred. The credential module will expose a platform adapter interface so Windows support can be added later without restructuring.

## Data Storage

Reuse the existing data directory and format from the Bash version (`~/.claude-switch-backup/`). This allows existing users to migrate without re-adding accounts.

Key files:
- `~/.claude-switch-backup/sequence.json` — account registry, active account, switch order
- `~/.claude-switch-backup/configs/*.json` — per-account OAuth config backups
- `~/.claude-switch-backup/credentials/*.json` — per-account credential backups (Linux/WSL only)

## Interactive Selection

Uses `@inquirer/prompts` `select` component. Provides arrow-key navigation and type-to-filter without requiring fzf or any system-level dependency.

Example interaction:

```
? Switch to account: (Use arrow keys)
❯ 1: hi.lucienlee@gmail.com
  2: lucien@aibor.io (active)
```

## Shell Prompt Integration

`ccflip status` outputs just the email address (one line, no decoration) so users can embed it in their shell prompt:

```bash
# .zshrc example
PROMPT='$(ccflip status) > '
```

## Security

Carry forward all security fixes from the Bash version:
- Atomic writes with temp file + rename
- File permissions 600 for all credential/config files
- Email validation to prevent path traversal
- File locking to prevent concurrent execution corruption

## Distribution

Phase 1 (development): `bun run src/index.ts` or `bun link` for local use.

Phase 2 (npm): Publish as `ccflip` on npm. Install via `bun install -g ccflip`.

Phase 3 (binary): `bun build --compile` to produce standalone executables for macOS (ARM64, x64), Linux (x64), and Windows (x64). Zero runtime dependencies for end users.

## Out of Scope (for now)

- Windows Credential Manager integration
- Auto-switching based on project directory
- Token expiry detection
- Install script (separate design later)
