# caflip

A super lightweight multi-account switcher for coding agent CLIs.

![caflip interactive account picker](./docs/demo.png)

caflip swaps authentication credentials between multiple accounts for:
- Claude Code
- Codex (`chatgpt-login` auth mode)

Use case: you have personal/work Claude or Codex accounts and want to switch quickly without re-login flows every time.


## Platform Support

| Platform | Credential Storage |
|---|---|
| macOS | System Keychain |
| Linux | `secret-tool` keyring (preferred), file-based fallback (owner-only access) |
| WSL | Same as Linux |
| Windows | Not yet supported |

## Install

### Binary (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/LucienLee/caflip/main/install.sh | bash
```

### Via npm (Node.js)

```bash
npm install -g caflip
```

### Via Bun

```bash
bun install -g caflip
```

### Local Development

```bash
bun run dev -- help
```

## Quick Start

```bash
# Claude provider is default if omitted
# Add your first Claude account (must already be logged in)
caflip add --alias personal

# Add another Claude account
caflip add --alias work

# Switch Claude accounts interactively
caflip

# Switch across Claude + Codex in one interactive list
caflip all

# Switch Claude by alias
caflip work
caflip personal

# Rotate Claude accounts
caflip next

# Use Codex provider explicitly
caflip codex add --alias codex-work
caflip codex list
caflip codex next
```

After switching, restart the target CLI (Claude Code or Codex) to pick up new authentication.

## Commands

| Command | Description |
|---|---|
| `caflip [command]` | Run command for Claude provider (default) |
| `caflip all` | Interactive picker across Claude + Codex |
| `caflip claude [command]` | Run command for Claude provider explicitly |
| `caflip codex [command]` | Run command for Codex provider explicitly |
| `caflip [provider]` | Interactive account picker for that provider |
| `caflip [provider] <alias>` | Switch by alias for that provider |
| `caflip [provider] list` | List managed accounts |
| `caflip [provider] add [--alias name]` | Add current account |
| `caflip [provider] remove [email]` | Remove an account |
| `caflip [provider] next` | Rotate to next account |
| `caflip [provider] status` | Show current account |
| `caflip [provider] alias <name> [email]` | Set alias for current or target account |
| `caflip help` | Show help |

### Alias Usage

```bash
# Set alias for current active account
caflip alias work

# Set alias for a specific managed account
caflip alias work hi.lucienlee@gmail.com

# Codex alias
caflip codex alias work me@company.com
```

`remove` target accepts email only. Omit it to choose from the interactive picker.

## Shell Prompt Integration

Show the current account in your prompt:

```bash
# .zshrc
PROMPT='$(caflip status) > '
PROMPT='$(caflip codex status) > '
```

Account data lives in:
- `~/.caflip-backup/claude/`
- `~/.caflip-backup/codex/`

## Credits

Inspired by [cc-account-switcher](https://github.com/ming86/cc-account-switcher).

## License

MIT
