# ccflip

Multi-account switcher for Claude Code. Switch between Claude Code accounts with a single command.

## Install

Requires [Bun](https://bun.sh/):

```bash
curl -fsSL https://bun.sh/install | bash
```

Then install ccflip:

```bash
bun install -g ccflip
```

## Quick Start

```bash
# Add your first account (must be logged into Claude Code)
ccflip add --alias personal

# Log out, log into second account, add it too
ccflip add --alias work

# Switch accounts interactively
ccflip

# Switch by alias
ccflip work
ccflip personal

# Rotate to next account
ccflip next
```

After switching, restart Claude Code to use the new authentication.

## Commands

| Command | Description |
|---|---|
| `ccflip` | Interactive account picker |
| `ccflip <alias>` | Switch by alias |
| `ccflip list` | List managed accounts |
| `ccflip add [--alias name]` | Add current account |
| `ccflip remove [num\|email]` | Remove an account |
| `ccflip next` | Rotate to next account |
| `ccflip status` | Show current account |
| `ccflip alias <name> <num\|email>` | Set alias for account |
| `ccflip help` | Show help |

## Shell Prompt Integration

Show current account in your prompt:

```bash
# .zshrc
PROMPT='$(ccflip status) > '
```

## Data Storage

Account data is stored in `~/.claude-switch-backup/`. Compatible with the original bash version (cc-account-switcher).

## License

MIT
