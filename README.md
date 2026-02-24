# caflip

A super lightweight multi-account interactive switcher for Claude Code.

![caflip interactive account picker](./docs/demo.png)

caflip swaps authentication credentials between Claude Code accounts. Your skills, settings, themes, `CLAUDE.md`, MCP servers, keybindings, and all other configuration stay exactly the same. One shared environment, multiple accounts.

Say you have a personal Claude Max account and a work account with API access. caflip lets you flip between them while keeping your carefully set up Claude Code config intact.


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
# Add your first account (must be logged into Claude Code)
caflip add --alias personal

# Log out, log into second account, add it too
caflip add --alias work

# Switch accounts interactively
caflip

# Switch by alias
caflip work
caflip personal

# Rotate to next account
caflip next
```

After switching, restart Claude Code to pick up the new authentication.

## Commands

| Command | Description |
|---|---|
| `caflip` | Interactive account picker |
| `caflip <alias>` | Switch by alias |
| `caflip list` | List managed accounts |
| `caflip add [--alias name]` | Add current account |
| `caflip remove [email]` | Remove an account |
| `caflip next` | Rotate to next account |
| `caflip status` | Show current account |
| `caflip alias <name> [email]` | Set alias for current account, or for target account email |
| `caflip help` | Show help |

### Alias Usage

```bash
# Set alias for current active account
caflip alias work

# Set alias for a specific managed account
caflip alias work hi.lucienlee@gmail.com
```

`remove` target accepts email only. Omit it to choose from the interactive picker.

## Shell Prompt Integration

Show the current account in your prompt:

```bash
# .zshrc
PROMPT='$(caflip status) > '
```

Account data lives in `~/.claude-switch-backup/`.

## Credits

Inspired by [cc-account-switcher](https://github.com/ming86/cc-account-switcher).

## License

MIT
