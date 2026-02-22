# ccflip

A super lightweight multi-account interactive switcher for Claude Code.

![ccflip interactive account picker](./docs/demo.png)

ccflip swaps authentication credentials between Claude Code accounts. Your skills, settings, themes, `CLAUDE.md`, MCP servers, keybindings, and all other configuration stay exactly the same. One shared environment, multiple accounts.

Say you have a personal Claude Max account and a work account with API access. ccflip lets you flip between them while keeping your carefully set up Claude Code config intact.


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
curl -fsSL https://raw.githubusercontent.com/LucienLee/ccflip/main/install.sh | bash
```

### Via Bun

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

After switching, restart Claude Code to pick up the new authentication.

## Commands

| Command | Description |
|---|---|
| `ccflip` | Interactive account picker |
| `ccflip <alias>` | Switch by alias |
| `ccflip list` | List managed accounts |
| `ccflip add [--alias name]` | Add current account |
| `ccflip remove [email]` | Remove an account |
| `ccflip next` | Rotate to next account |
| `ccflip status` | Show current account |
| `ccflip alias <name> [email]` | Set alias for current account, or for target account email |
| `ccflip help` | Show help |

### Alias Usage

```bash
# Set alias for current active account
ccflip alias work

# Set alias for a specific managed account
ccflip alias work hi.lucienlee@gmail.com
```

`remove` target accepts email only. Omit it to choose from the interactive picker.

## Shell Prompt Integration

Show the current account in your prompt:

```bash
# .zshrc
PROMPT='$(ccflip status) > '
```

Account data lives in `~/.claude-switch-backup/`.

## Credits

Inspired by [cc-account-switcher](https://github.com/ming86/cc-account-switcher).

## License

MIT
