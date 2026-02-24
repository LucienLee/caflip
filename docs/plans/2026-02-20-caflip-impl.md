# caflip Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Bun + TypeScript CLI tool for switching between multiple Claude Code accounts with interactive selection and alias support.

**Architecture:** Single-entry CLI (`src/index.ts`) routes to command handlers. Core logic is split into modules: config (paths/platform), accounts (sequence.json CRUD), credentials (platform-specific storage), and interactive (prompts). Data format is backward-compatible with the existing bash tool's `~/.claude-switch-backup/`.

**Tech Stack:** Bun, TypeScript, @inquirer/prompts

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Step 1: Initialize project**

Run:
```bash
cd /Users/lucien/Projects/caflip
bun init -y
```

**Step 2: Install dependencies**

Run:
```bash
cd /Users/lucien/Projects/caflip
bun add @inquirer/prompts
```

**Step 3: Replace tsconfig.json**

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

**Step 4: Update package.json**

Set the `bin` field and entry point in `package.json`:

```json
{
  "name": "caflip",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "caflip": "./src/index.ts"
  },
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test"
  }
}
```

Keep the existing `dependencies` and `devDependencies` that `bun init` and `bun add` created. Only add/update the fields shown above.

**Step 5: Update .gitignore**

Ensure `.gitignore` contains:

```
node_modules/
dist/
*.tgz
```

**Step 6: Create src directory and placeholder entry point**

Create `src/index.ts`:

```typescript
#!/usr/bin/env bun
// caflip - Multi-account switcher for Claude Code
console.log("caflip v0.1.0");
```

**Step 7: Verify it runs**

Run: `cd /Users/lucien/Projects/caflip && bun run src/index.ts`
Expected: `caflip v0.1.0`

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with Bun + TypeScript"
```

---

### Task 2: Config Module

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

**Step 1: Write tests for config**

Create `tests/config.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  BACKUP_DIR,
  SEQUENCE_FILE,
  LOCK_DIR,
  RESERVED_COMMANDS,
  detectPlatform,
  getClaudeConfigPath,
} from "../src/config";
import { homedir } from "os";
import { existsSync } from "fs";

describe("config constants", () => {
  test("BACKUP_DIR is under home directory", () => {
    expect(BACKUP_DIR).toBe(`${homedir()}/.claude-switch-backup`);
  });

  test("SEQUENCE_FILE is inside BACKUP_DIR", () => {
    expect(SEQUENCE_FILE).toStartWith(BACKUP_DIR);
    expect(SEQUENCE_FILE).toEndWith("sequence.json");
  });

  test("LOCK_DIR is inside BACKUP_DIR", () => {
    expect(LOCK_DIR).toStartWith(BACKUP_DIR);
  });

  test("RESERVED_COMMANDS includes all subcommands", () => {
    expect(RESERVED_COMMANDS).toContain("list");
    expect(RESERVED_COMMANDS).toContain("add");
    expect(RESERVED_COMMANDS).toContain("remove");
    expect(RESERVED_COMMANDS).toContain("next");
    expect(RESERVED_COMMANDS).toContain("status");
    expect(RESERVED_COMMANDS).toContain("alias");
    expect(RESERVED_COMMANDS).toContain("help");
  });
});

describe("detectPlatform", () => {
  test("returns a known platform string", () => {
    const platform = detectPlatform();
    expect(["macos", "linux", "wsl", "windows", "unknown"]).toContain(platform);
  });
});

describe("getClaudeConfigPath", () => {
  test("returns a path ending in .claude.json", () => {
    const configPath = getClaudeConfigPath();
    expect(configPath).toEndWith(".claude.json");
  });

  test("returns primary path if it exists and has oauthAccount", () => {
    const primary = `${homedir()}/.claude/.claude.json`;
    const fallback = `${homedir()}/.claude.json`;
    const configPath = getClaudeConfigPath();
    // Should return one of the two known locations
    expect([primary, fallback]).toContain(configPath);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/lucien/Projects/caflip && bun test`
Expected: FAIL (module not found)

**Step 3: Implement config module**

Create `src/config.ts`:

```typescript
import { homedir } from "os";
import { existsSync } from "fs";
import { join } from "path";

export type Platform = "macos" | "linux" | "wsl" | "windows" | "unknown";

export const BACKUP_DIR = join(homedir(), ".claude-switch-backup");
export const SEQUENCE_FILE = join(BACKUP_DIR, "sequence.json");
export const LOCK_DIR = join(BACKUP_DIR, ".lock");
export const CONFIGS_DIR = join(BACKUP_DIR, "configs");
export const CREDENTIALS_DIR = join(BACKUP_DIR, "credentials");

export const RESERVED_COMMANDS = [
  "list",
  "add",
  "remove",
  "next",
  "status",
  "alias",
  "help",
] as const;

export function detectPlatform(): Platform {
  switch (process.platform) {
    case "darwin":
      return "macos";
    case "linux":
      return process.env.WSL_DISTRO_NAME ? "wsl" : "linux";
    case "win32":
      return "windows";
    default:
      return "unknown";
  }
}

export function getClaudeConfigPath(): string {
  const primary = join(homedir(), ".claude", ".claude.json");
  const fallback = join(homedir(), ".claude.json");

  if (existsSync(primary)) {
    try {
      const content = JSON.parse(
        require("fs").readFileSync(primary, "utf-8")
      );
      if (content.oauthAccount) {
        return primary;
      }
    } catch {
      // Fall through to fallback
    }
  }

  return fallback;
}
```

**Step 4: Run tests**

Run: `cd /Users/lucien/Projects/caflip && bun test`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: config module with paths, platform detection, constants"
```

---

### Task 3: Validation Utilities

**Files:**
- Create: `src/validation.ts`
- Create: `tests/validation.test.ts`

**Step 1: Write tests**

Create `tests/validation.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { validateEmail, sanitizeEmailForFilename, validateAlias } from "../src/validation";

describe("validateEmail", () => {
  test("accepts valid emails", () => {
    expect(validateEmail("user@example.com")).toBe(true);
    expect(validateEmail("user.name+tag@domain.co")).toBe(true);
    expect(validateEmail("a@b.cc")).toBe(true);
  });

  test("rejects invalid emails", () => {
    expect(validateEmail("")).toBe(false);
    expect(validateEmail("noat")).toBe(false);
    expect(validateEmail("@domain.com")).toBe(false);
    expect(validateEmail("user@")).toBe(false);
    expect(validateEmail("user@.com")).toBe(false);
  });
});

describe("sanitizeEmailForFilename", () => {
  test("accepts normal emails", () => {
    expect(sanitizeEmailForFilename("user@example.com")).toBe(true);
  });

  test("rejects path traversal", () => {
    expect(sanitizeEmailForFilename("../etc/passwd@x.com")).toBe(false);
    expect(sanitizeEmailForFilename("user/../../@x.com")).toBe(false);
  });

  test("rejects slashes", () => {
    expect(sanitizeEmailForFilename("user/name@x.com")).toBe(false);
  });

  test("rejects invalid email format", () => {
    expect(sanitizeEmailForFilename("notanemail")).toBe(false);
  });
});

describe("validateAlias", () => {
  test("accepts valid aliases", () => {
    expect(validateAlias("work").valid).toBe(true);
    expect(validateAlias("my-team").valid).toBe(true);
    expect(validateAlias("dev2").valid).toBe(true);
    expect(validateAlias("ab").valid).toBe(true);
  });

  test("rejects reserved command names", () => {
    const result = validateAlias("list");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("reserved");
  });

  test("rejects purely numeric aliases", () => {
    const result = validateAlias("42");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("numeric");
  });

  test("rejects too-short aliases", () => {
    const result = validateAlias("a");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("2 characters");
  });

  test("rejects invalid characters", () => {
    const result = validateAlias("Work");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("lowercase");

    const result2 = validateAlias("my_team");
    expect(result2.valid).toBe(false);

    const result3 = validateAlias("my team");
    expect(result3.valid).toBe(false);
  });

  test("rejects aliases starting with number or hyphen", () => {
    const result = validateAlias("2work");
    expect(result.valid).toBe(false);

    const result2 = validateAlias("-work");
    expect(result2.valid).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/lucien/Projects/caflip && bun test tests/validation.test.ts`
Expected: FAIL

**Step 3: Implement validation module**

Create `src/validation.ts`:

```typescript
import { RESERVED_COMMANDS } from "./config";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const ALIAS_REGEX = /^[a-z][a-z0-9-]*$/;

export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function sanitizeEmailForFilename(email: string): boolean {
  if (!validateEmail(email)) return false;
  if (email.includes("..") || email.includes("/") || email.includes("\0")) {
    return false;
  }
  return true;
}

export interface AliasValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateAlias(alias: string): AliasValidationResult {
  if (alias.length < 2) {
    return { valid: false, reason: "Alias must be at least 2 characters" };
  }

  if (!ALIAS_REGEX.test(alias)) {
    return {
      valid: false,
      reason: "Alias must contain only lowercase letters, numbers, and hyphens, and start with a letter",
    };
  }

  if (/^\d+$/.test(alias)) {
    return {
      valid: false,
      reason: "Alias cannot be purely numeric (would conflict with account numbers)",
    };
  }

  if ((RESERVED_COMMANDS as readonly string[]).includes(alias)) {
    return { valid: false, reason: `"${alias}" is a reserved command name` };
  }

  return { valid: true };
}
```

**Step 4: Run tests**

Run: `cd /Users/lucien/Projects/caflip && bun test tests/validation.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/validation.ts tests/validation.test.ts
git commit -m "feat: validation utilities for email, filename safety, and aliases"
```

---

### Task 4: File Utilities (Atomic Write + Lock)

**Files:**
- Create: `src/files.ts`
- Create: `tests/files.test.ts`

**Step 1: Write tests**

Create `tests/files.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { writeJsonAtomic, acquireLock, releaseLock } from "../src/files";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DIR = join(tmpdir(), "caflip-test-" + Date.now());

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("writeJsonAtomic", () => {
  test("writes valid JSON to file", async () => {
    const file = join(TEST_DIR, "test.json");
    const data = { hello: "world" };
    await writeJsonAtomic(file, data);
    const content = JSON.parse(readFileSync(file, "utf-8"));
    expect(content).toEqual(data);
  });

  test("sets file permissions to 600", async () => {
    const file = join(TEST_DIR, "test.json");
    await writeJsonAtomic(file, { a: 1 });
    const stat = Bun.file(file);
    // Verify file exists and is readable
    expect(existsSync(file)).toBe(true);
  });

  test("does not corrupt file on invalid JSON", async () => {
    const file = join(TEST_DIR, "test.json");
    await writeJsonAtomic(file, { original: true });

    // Circular reference will fail JSON.stringify
    const circular: any = {};
    circular.self = circular;
    await expect(writeJsonAtomic(file, circular)).rejects.toThrow();

    // Original file should still be intact
    const content = JSON.parse(readFileSync(file, "utf-8"));
    expect(content).toEqual({ original: true });
  });
});

describe("acquireLock / releaseLock", () => {
  test("acquires and releases lock", () => {
    const lockDir = join(TEST_DIR, ".lock");
    acquireLock(lockDir);
    expect(existsSync(lockDir)).toBe(true);
    releaseLock(lockDir);
    expect(existsSync(lockDir)).toBe(false);
  });

  test("throws if lock already held", () => {
    const lockDir = join(TEST_DIR, ".lock");
    acquireLock(lockDir);
    expect(() => acquireLock(lockDir)).toThrow(/another instance/i);
    releaseLock(lockDir);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/lucien/Projects/caflip && bun test tests/files.test.ts`
Expected: FAIL

**Step 3: Implement file utilities**

Create `src/files.ts`:

```typescript
import { existsSync, mkdirSync, rmSync, chmodSync, renameSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";

// Write JSON atomically: write to temp file, validate, then rename into place.
export async function writeJsonAtomic(
  filePath: string,
  data: unknown
): Promise<void> {
  const jsonStr = JSON.stringify(data, null, 2);

  // Validate by parsing back
  JSON.parse(jsonStr);

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const tempFile = `${filePath}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempFile, jsonStr, { mode: 0o600 });
    renameSync(tempFile, filePath);
    chmodSync(filePath, 0o600);
  } catch (err) {
    // Clean up temp file on failure
    try {
      rmSync(tempFile, { force: true });
    } catch {}
    throw err;
  }
}

// Acquire a cross-platform directory-based lock.
export function acquireLock(lockDir: string): void {
  try {
    mkdirSync(lockDir, { recursive: false });
  } catch {
    throw new Error(
      `Another instance is running. If this is wrong, remove ${lockDir}`
    );
  }
}

// Release directory-based lock.
export function releaseLock(lockDir: string): void {
  try {
    rmSync(lockDir, { recursive: true, force: true });
  } catch {}
}
```

**Step 4: Run tests**

Run: `cd /Users/lucien/Projects/caflip && bun test tests/files.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/files.ts tests/files.test.ts
git commit -m "feat: atomic JSON write and directory-based file locking"
```

---

### Task 5: Accounts Module

**Files:**
- Create: `src/accounts.ts`
- Create: `tests/accounts.test.ts`

This is the core module. It manages `sequence.json` and all account CRUD operations.

**Step 1: Write tests**

Create `tests/accounts.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  initSequenceFile,
  loadSequence,
  getNextAccountNumber,
  accountExists,
  addAccountToSequence,
  removeAccountFromSequence,
  getNextInSequence,
  resolveAccountIdentifier,
  setAlias,
  findAccountByAlias,
} from "../src/accounts";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DIR = join(tmpdir(), "caflip-accounts-test-" + Date.now());
const TEST_SEQUENCE = join(TEST_DIR, "sequence.json");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("initSequenceFile", () => {
  test("creates sequence.json if missing", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    expect(existsSync(TEST_SEQUENCE)).toBe(true);
    const data = await loadSequence(TEST_SEQUENCE);
    expect(data.activeAccountNumber).toBeNull();
    expect(data.sequence).toEqual([]);
    expect(data.accounts).toEqual({});
  });

  test("does not overwrite existing file", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const original = await loadSequence(TEST_SEQUENCE);
    original.accounts["1"] = {
      email: "test@test.com",
      uuid: "abc",
      added: new Date().toISOString(),
    };
    const { writeJsonAtomic } = await import("../src/files");
    await writeJsonAtomic(TEST_SEQUENCE, original);

    await initSequenceFile(TEST_SEQUENCE);
    const data = await loadSequence(TEST_SEQUENCE);
    expect(data.accounts["1"]).toBeDefined();
  });
});

describe("getNextAccountNumber", () => {
  test("returns 1 for empty accounts", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    expect(getNextAccountNumber(seq)).toBe(1);
  });

  test("returns max + 1", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    seq.accounts["3"] = { email: "a@b.com", uuid: "x", added: "" };
    seq.accounts["5"] = { email: "c@d.com", uuid: "y", added: "" };
    expect(getNextAccountNumber(seq)).toBe(6);
  });
});

describe("accountExists", () => {
  test("returns false for empty accounts", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    expect(accountExists(seq, "nope@x.com")).toBe(false);
  });

  test("returns true for existing email", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    seq.accounts["1"] = { email: "test@x.com", uuid: "a", added: "" };
    expect(accountExists(seq, "test@x.com")).toBe(true);
  });
});

describe("addAccountToSequence", () => {
  test("adds account and updates sequence", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    const updated = addAccountToSequence(seq, {
      email: "user@test.com",
      uuid: "abc-123",
    });
    expect(updated.accounts["1"].email).toBe("user@test.com");
    expect(updated.sequence).toContain(1);
    expect(updated.activeAccountNumber).toBe(1);
  });

  test("adds account with alias", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    const updated = addAccountToSequence(seq, {
      email: "user@test.com",
      uuid: "abc-123",
      alias: "work",
    });
    expect(updated.accounts["1"].alias).toBe("work");
  });
});

describe("removeAccountFromSequence", () => {
  test("removes account and updates sequence", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    const updated = removeAccountFromSequence(seq, "1");
    expect(updated.accounts["1"]).toBeUndefined();
    expect(updated.sequence).not.toContain(1);
    expect(updated.accounts["2"]).toBeDefined();
  });
});

describe("getNextInSequence", () => {
  test("rotates to next account", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    seq.activeAccountNumber = 1;
    expect(getNextInSequence(seq)).toBe(2);
  });

  test("wraps around to first", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    seq.activeAccountNumber = 2;
    expect(getNextInSequence(seq)).toBe(1);
  });
});

describe("resolveAccountIdentifier", () => {
  test("resolves number string", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    expect(resolveAccountIdentifier(seq, "1")).toBe("1");
  });

  test("resolves email", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    expect(resolveAccountIdentifier(seq, "a@b.com")).toBe("1");
  });

  test("returns null for unknown", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    expect(resolveAccountIdentifier(seq, "nope@x.com")).toBeNull();
  });
});

describe("alias operations", () => {
  test("setAlias assigns alias to account", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    const updated = setAlias(seq, "1", "work");
    expect(updated.accounts["1"].alias).toBe("work");
  });

  test("setAlias rejects duplicate alias", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    seq = setAlias(seq, "1", "work");
    expect(() => setAlias(seq, "2", "work")).toThrow(/already in use/i);
  });

  test("findAccountByAlias returns account number", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = setAlias(seq, "1", "work");
    expect(findAccountByAlias(seq, "work")).toBe("1");
  });

  test("findAccountByAlias returns null if not found", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    expect(findAccountByAlias(seq, "nope")).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/lucien/Projects/caflip && bun test tests/accounts.test.ts`
Expected: FAIL

**Step 3: Implement accounts module**

Create `src/accounts.ts`:

```typescript
import { existsSync } from "fs";
import { writeJsonAtomic } from "./files";

export interface Account {
  email: string;
  uuid: string;
  added: string;
  alias?: string;
}

export interface SequenceData {
  activeAccountNumber: number | null;
  lastUpdated: string;
  sequence: number[];
  accounts: Record<string, Account>;
}

export async function initSequenceFile(path: string): Promise<void> {
  if (existsSync(path)) return;
  const data: SequenceData = {
    activeAccountNumber: null,
    lastUpdated: new Date().toISOString(),
    sequence: [],
    accounts: {},
  };
  await writeJsonAtomic(path, data);
}

export async function loadSequence(path: string): Promise<SequenceData> {
  const file = Bun.file(path);
  return (await file.json()) as SequenceData;
}

export function getNextAccountNumber(seq: SequenceData): number {
  const keys = Object.keys(seq.accounts).map(Number);
  if (keys.length === 0) return 1;
  return Math.max(...keys) + 1;
}

export function accountExists(seq: SequenceData, email: string): boolean {
  return Object.values(seq.accounts).some((a) => a.email === email);
}

export function addAccountToSequence(
  seq: SequenceData,
  info: { email: string; uuid: string; alias?: string }
): SequenceData {
  const num = getNextAccountNumber(seq);
  const numStr = String(num);
  const account: Account = {
    email: info.email,
    uuid: info.uuid,
    added: new Date().toISOString(),
  };
  if (info.alias) {
    account.alias = info.alias;
  }
  return {
    ...seq,
    accounts: { ...seq.accounts, [numStr]: account },
    sequence: [...seq.sequence, num],
    activeAccountNumber: num,
    lastUpdated: new Date().toISOString(),
  };
}

export function removeAccountFromSequence(
  seq: SequenceData,
  accountNum: string
): SequenceData {
  const numValue = Number(accountNum);
  const { [accountNum]: _, ...remainingAccounts } = seq.accounts;
  return {
    ...seq,
    accounts: remainingAccounts,
    sequence: seq.sequence.filter((n) => n !== numValue),
    lastUpdated: new Date().toISOString(),
  };
}

export function getNextInSequence(seq: SequenceData): number {
  const currentIndex = seq.sequence.indexOf(seq.activeAccountNumber!);
  const nextIndex = (currentIndex + 1) % seq.sequence.length;
  return seq.sequence[nextIndex];
}

export function resolveAccountIdentifier(
  seq: SequenceData,
  identifier: string
): string | null {
  // Check if it's a number
  if (/^\d+$/.test(identifier)) {
    return seq.accounts[identifier] ? identifier : null;
  }

  // Search by email
  for (const [num, account] of Object.entries(seq.accounts)) {
    if (account.email === identifier) return num;
  }

  return null;
}

export function setAlias(
  seq: SequenceData,
  accountNum: string,
  alias: string
): SequenceData {
  // Check for duplicate alias
  for (const [num, account] of Object.entries(seq.accounts)) {
    if (num !== accountNum && account.alias === alias) {
      throw new Error(
        `Alias "${alias}" is already in use by account ${num} (${account.email})`
      );
    }
  }

  const account = seq.accounts[accountNum];
  if (!account) {
    throw new Error(`Account ${accountNum} does not exist`);
  }

  return {
    ...seq,
    accounts: {
      ...seq.accounts,
      [accountNum]: { ...account, alias },
    },
    lastUpdated: new Date().toISOString(),
  };
}

export function findAccountByAlias(
  seq: SequenceData,
  alias: string
): string | null {
  for (const [num, account] of Object.entries(seq.accounts)) {
    if (account.alias === alias) return num;
  }
  return null;
}
```

**Step 4: Run tests**

Run: `cd /Users/lucien/Projects/caflip && bun test tests/accounts.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/accounts.ts tests/accounts.test.ts
git commit -m "feat: accounts module with CRUD, sequence rotation, and alias support"
```

---

### Task 6: Credentials Module

**Files:**
- Create: `src/credentials.ts`

This module handles platform-specific credential storage. It calls out to the `security` CLI on macOS and uses file storage on Linux/WSL. Hard to unit test due to platform-specific side effects, so we test it manually.

**Step 1: Implement credentials module**

Create `src/credentials.ts`:

```typescript
import { existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { detectPlatform, CREDENTIALS_DIR } from "./config";
import { writeJsonAtomic } from "./files";
import { sanitizeEmailForFilename } from "./validation";

// Run a shell command and return stdout, or empty string on failure.
async function exec(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return output.trim();
}

// Read the active Claude Code credentials.
export async function readCredentials(): Promise<string> {
  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      return exec([
        "security",
        "find-generic-password",
        "-s",
        "Claude Code-credentials",
        "-w",
      ]);
    }
    case "linux":
    case "wsl": {
      const credPath = join(homedir(), ".claude", ".credentials.json");
      if (existsSync(credPath)) {
        return readFileSync(credPath, "utf-8");
      }
      return "";
    }
    default:
      return "";
  }
}

// Write the active Claude Code credentials.
export async function writeCredentials(credentials: string): Promise<void> {
  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      const proc = Bun.spawn(
        [
          "security",
          "add-generic-password",
          "-U",
          "-s",
          "Claude Code-credentials",
          "-a",
          process.env.USER ?? "unknown",
          "-w",
          credentials,
        ],
        { stdout: "pipe", stderr: "pipe" }
      );
      await proc.exited;
      break;
    }
    case "linux":
    case "wsl": {
      const claudeDir = join(homedir(), ".claude");
      mkdirSync(claudeDir, { recursive: true });
      const credPath = join(claudeDir, ".credentials.json");
      await Bun.write(credPath, credentials, { mode: 0o600 } as any);
      break;
    }
  }
}

// Read backed-up credentials for a specific account.
export async function readAccountCredentials(
  accountNum: string,
  email: string
): Promise<string> {
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }

  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      return exec([
        "security",
        "find-generic-password",
        "-s",
        `Claude Code-Account-${accountNum}-${email}`,
        "-w",
      ]);
    }
    case "linux":
    case "wsl": {
      const credFile = join(
        CREDENTIALS_DIR,
        `.claude-credentials-${accountNum}-${email}.json`
      );
      if (existsSync(credFile)) {
        return readFileSync(credFile, "utf-8");
      }
      return "";
    }
    default:
      return "";
  }
}

// Write backed-up credentials for a specific account.
export async function writeAccountCredentials(
  accountNum: string,
  email: string,
  credentials: string
): Promise<void> {
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }

  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      const proc = Bun.spawn(
        [
          "security",
          "add-generic-password",
          "-U",
          "-s",
          `Claude Code-Account-${accountNum}-${email}`,
          "-a",
          process.env.USER ?? "unknown",
          "-w",
          credentials,
        ],
        { stdout: "pipe", stderr: "pipe" }
      );
      await proc.exited;
      break;
    }
    case "linux":
    case "wsl": {
      const credFile = join(
        CREDENTIALS_DIR,
        `.claude-credentials-${accountNum}-${email}.json`
      );
      mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
      // Credentials are JSON, use atomic write
      const parsed = JSON.parse(credentials);
      await writeJsonAtomic(credFile, parsed);
      break;
    }
  }
}

// Delete backed-up credentials for a specific account.
export async function deleteAccountCredentials(
  accountNum: string,
  email: string
): Promise<void> {
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }

  const platform = detectPlatform();

  switch (platform) {
    case "macos": {
      const proc = Bun.spawn(
        [
          "security",
          "delete-generic-password",
          "-s",
          `Claude Code-Account-${accountNum}-${email}`,
        ],
        { stdout: "pipe", stderr: "pipe" }
      );
      await proc.exited;
      break;
    }
    case "linux":
    case "wsl": {
      const { rmSync } = await import("fs");
      const credFile = join(
        CREDENTIALS_DIR,
        `.claude-credentials-${accountNum}-${email}.json`
      );
      rmSync(credFile, { force: true });
      break;
    }
  }
}

// Read backed-up config for a specific account.
export function readAccountConfig(
  accountNum: string,
  email: string,
  configsDir: string
): string {
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }
  const configFile = join(
    configsDir,
    `.claude-config-${accountNum}-${email}.json`
  );
  if (existsSync(configFile)) {
    return readFileSync(configFile, "utf-8");
  }
  return "";
}

// Write backed-up config for a specific account.
export async function writeAccountConfig(
  accountNum: string,
  email: string,
  config: string,
  configsDir: string
): Promise<void> {
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }
  const configFile = join(
    configsDir,
    `.claude-config-${accountNum}-${email}.json`
  );
  mkdirSync(configsDir, { recursive: true, mode: 0o700 });
  const parsed = JSON.parse(config);
  await writeJsonAtomic(configFile, parsed);
}

// Delete backed-up config for a specific account.
export function deleteAccountConfig(
  accountNum: string,
  email: string,
  configsDir: string
): void {
  if (!sanitizeEmailForFilename(email)) {
    throw new Error(`Unsafe email for filename: ${email}`);
  }
  const { rmSync } = require("fs");
  const configFile = join(
    configsDir,
    `.claude-config-${accountNum}-${email}.json`
  );
  rmSync(configFile, { force: true });
}
```

**Step 2: Verify syntax**

Run: `cd /Users/lucien/Projects/caflip && bun build src/credentials.ts --no-bundle 2>&1 | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add src/credentials.ts
git commit -m "feat: platform-specific credential storage (macOS Keychain + Linux files)"
```

---

### Task 7: Interactive Module

**Files:**
- Create: `src/interactive.ts`

**Step 1: Implement interactive module**

Create `src/interactive.ts`:

```typescript
import { select, confirm } from "@inquirer/prompts";
import type { SequenceData } from "./accounts";

// Format an account entry for display.
function formatAccount(
  num: string,
  email: string,
  alias?: string,
  isActive?: boolean
): string {
  let label = `${num}: ${email}`;
  if (alias) label += ` [${alias}]`;
  if (isActive) label += " (active)";
  return label;
}

// Show interactive account picker, returns selected account number.
export async function pickAccount(
  seq: SequenceData,
  message: string = "Switch to account:"
): Promise<string> {
  const choices = seq.sequence.map((num) => {
    const numStr = String(num);
    const account = seq.accounts[numStr];
    const isActive = num === seq.activeAccountNumber;
    return {
      name: formatAccount(numStr, account.email, account.alias, isActive),
      value: numStr,
    };
  });

  return select({ message, choices });
}

// Show interactive account picker for removal.
export async function pickAccountForRemoval(
  seq: SequenceData
): Promise<string> {
  return pickAccount(seq, "Remove which account?");
}

// Confirm a destructive action.
export async function confirmAction(message: string): Promise<boolean> {
  return confirm({ message, default: false });
}
```

**Step 2: Verify syntax**

Run: `cd /Users/lucien/Projects/caflip && bun build src/interactive.ts --no-bundle 2>&1 | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add src/interactive.ts
git commit -m "feat: interactive account picker using @inquirer/prompts"
```

---

### Task 8: CLI Entry Point + Command Routing

**Files:**
- Create: `src/index.ts` (replace placeholder)

This is the main entry point that ties everything together. It parses arguments, routes to commands, and handles the alias-as-command shortcut.

**Step 1: Implement CLI entry point**

Replace `src/index.ts`:

```typescript
#!/usr/bin/env bun

import { existsSync, readFileSync, mkdirSync } from "fs";
import {
  BACKUP_DIR,
  SEQUENCE_FILE,
  LOCK_DIR,
  CONFIGS_DIR,
  CREDENTIALS_DIR,
  RESERVED_COMMANDS,
  getClaudeConfigPath,
} from "./config";
import {
  initSequenceFile,
  loadSequence,
  addAccountToSequence,
  removeAccountFromSequence,
  getNextInSequence,
  resolveAccountIdentifier,
  accountExists,
  setAlias,
  findAccountByAlias,
  type SequenceData,
} from "./accounts";
import {
  readCredentials,
  writeCredentials,
  readAccountCredentials,
  writeAccountCredentials,
  deleteAccountCredentials,
  readAccountConfig,
  writeAccountConfig,
  deleteAccountConfig,
} from "./credentials";
import { writeJsonAtomic, acquireLock, releaseLock } from "./files";
import { sanitizeEmailForFilename, validateAlias } from "./validation";
import { pickAccount, pickAccountForRemoval, confirmAction } from "./interactive";

// Ensure backup directories exist.
function setupDirectories(): void {
  for (const dir of [BACKUP_DIR, CONFIGS_DIR, CREDENTIALS_DIR]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

// Read current account email from Claude config.
function getCurrentAccount(): string {
  const configPath = getClaudeConfigPath();
  if (!existsSync(configPath)) return "none";
  try {
    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    return content?.oauthAccount?.emailAddress ?? "none";
  } catch {
    return "none";
  }
}

// Perform the actual account switch.
async function performSwitch(
  seq: SequenceData,
  targetAccount: string
): Promise<void> {
  const currentAccount = String(seq.activeAccountNumber);
  const targetEmail = seq.accounts[targetAccount].email;
  const currentEmail = getCurrentAccount();

  if (!sanitizeEmailForFilename(targetEmail)) {
    throw new Error("Target account email is not safe for storage");
  }
  if (currentEmail !== "none" && !sanitizeEmailForFilename(currentEmail)) {
    throw new Error("Current account email is not safe for storage");
  }

  // Step 1: Backup current account
  if (currentEmail !== "none" && currentAccount !== "null") {
    const currentCreds = await readCredentials();
    const configPath = getClaudeConfigPath();
    const currentConfig = existsSync(configPath)
      ? readFileSync(configPath, "utf-8")
      : "";

    if (currentCreds) {
      await writeAccountCredentials(currentAccount, currentEmail, currentCreds);
    }
    if (currentConfig) {
      await writeAccountConfig(currentAccount, currentEmail, currentConfig, CONFIGS_DIR);
    }
  }

  // Step 2: Restore target account
  const targetCreds = await readAccountCredentials(targetAccount, targetEmail);
  const targetConfig = readAccountConfig(targetAccount, targetEmail, CONFIGS_DIR);

  if (!targetCreds || !targetConfig) {
    throw new Error(`Missing backup data for Account-${targetAccount}`);
  }

  // Step 3: Write target credentials
  await writeCredentials(targetCreds);

  // Step 4: Merge oauthAccount into current config
  const targetConfigObj = JSON.parse(targetConfig);
  const oauthAccount = targetConfigObj.oauthAccount;
  if (!oauthAccount) {
    throw new Error("Invalid oauthAccount in backup");
  }

  const configPath = getClaudeConfigPath();
  let currentConfigObj: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    currentConfigObj = JSON.parse(readFileSync(configPath, "utf-8"));
  }
  currentConfigObj.oauthAccount = oauthAccount;
  await writeJsonAtomic(configPath, currentConfigObj);

  // Step 5: Update sequence
  seq.activeAccountNumber = Number(targetAccount);
  seq.lastUpdated = new Date().toISOString();
  await writeJsonAtomic(SEQUENCE_FILE, seq);

  const alias = seq.accounts[targetAccount].alias;
  const aliasStr = alias ? ` [${alias}]` : "";
  console.log(`Switched to Account-${targetAccount} (${targetEmail})${aliasStr}`);
  console.log("\nPlease restart Claude Code to use the new authentication.\n");
}

// --- Command handlers ---

async function cmdList(): Promise<void> {
  if (!existsSync(SEQUENCE_FILE)) {
    console.log("No accounts managed yet. Run: caflip add");
    return;
  }

  const seq = await loadSequence(SEQUENCE_FILE);
  const currentEmail = getCurrentAccount();

  console.log("Accounts:");
  for (const num of seq.sequence) {
    const numStr = String(num);
    const account = seq.accounts[numStr];
    const isActive = account.email === currentEmail;
    let line = `  ${numStr}: ${account.email}`;
    if (account.alias) line += ` [${account.alias}]`;
    if (isActive) line += " (active)";
    console.log(line);
  }
}

async function cmdAdd(alias?: string): Promise<void> {
  setupDirectories();
  await initSequenceFile(SEQUENCE_FILE);

  const currentEmail = getCurrentAccount();
  if (currentEmail === "none") {
    console.error("Error: No active Claude account found. Please log in first.");
    process.exit(1);
  }

  if (!sanitizeEmailForFilename(currentEmail)) {
    console.error("Error: Current account email is not safe for storage");
    process.exit(1);
  }

  const seq = await loadSequence(SEQUENCE_FILE);

  if (accountExists(seq, currentEmail)) {
    console.log(`Account ${currentEmail} is already managed.`);
    return;
  }

  // Validate alias if provided
  if (alias) {
    const result = validateAlias(alias);
    if (!result.valid) {
      console.error(`Error: ${result.reason}`);
      process.exit(1);
    }
    if (findAccountByAlias(seq, alias)) {
      console.error(`Error: Alias "${alias}" is already in use`);
      process.exit(1);
    }
  }

  // Read current credentials and config
  const creds = await readCredentials();
  if (!creds) {
    console.error("Error: No credentials found for current account");
    process.exit(1);
  }

  const configPath = getClaudeConfigPath();
  const config = readFileSync(configPath, "utf-8");
  const configObj = JSON.parse(config);
  const uuid = configObj.oauthAccount?.accountUuid ?? "";

  // Add to sequence
  const updated = addAccountToSequence(seq, {
    email: currentEmail,
    uuid,
    alias,
  });

  const accountNum = String(updated.activeAccountNumber);

  // Store backups
  await writeAccountCredentials(accountNum, currentEmail, creds);
  await writeAccountConfig(accountNum, currentEmail, config, CONFIGS_DIR);
  await writeJsonAtomic(SEQUENCE_FILE, updated);

  const aliasStr = alias ? ` [${alias}]` : "";
  console.log(`Added Account ${accountNum}: ${currentEmail}${aliasStr}`);
}

async function cmdRemove(identifier?: string): Promise<void> {
  if (!existsSync(SEQUENCE_FILE)) {
    console.error("Error: No accounts managed yet");
    process.exit(1);
  }

  const seq = await loadSequence(SEQUENCE_FILE);

  // If no identifier given, use interactive picker
  let accountNum: string;
  if (!identifier) {
    accountNum = await pickAccountForRemoval(seq);
  } else {
    const resolved = resolveAccountIdentifier(seq, identifier);
    if (!resolved) {
      console.error(`Error: Account not found: ${identifier}`);
      process.exit(1);
    }
    accountNum = resolved;
  }

  const account = seq.accounts[accountNum];
  if (!account) {
    console.error(`Error: Account-${accountNum} does not exist`);
    process.exit(1);
  }

  if (seq.activeAccountNumber === Number(accountNum)) {
    console.log(`Warning: Account-${accountNum} (${account.email}) is currently active`);
  }

  const confirmed = await confirmAction(
    `Permanently remove Account-${accountNum} (${account.email})?`
  );
  if (!confirmed) {
    console.log("Cancelled");
    return;
  }

  // Delete backup files
  await deleteAccountCredentials(accountNum, account.email);
  deleteAccountConfig(accountNum, account.email, CONFIGS_DIR);

  // Update sequence
  const updated = removeAccountFromSequence(seq, accountNum);
  await writeJsonAtomic(SEQUENCE_FILE, updated);

  console.log(`Account-${accountNum} (${account.email}) has been removed`);
}

async function cmdNext(): Promise<void> {
  if (!existsSync(SEQUENCE_FILE)) {
    console.error("Error: No accounts managed yet");
    process.exit(1);
  }

  const seq = await loadSequence(SEQUENCE_FILE);

  if (seq.sequence.length < 2) {
    console.error("Error: Need at least 2 accounts to rotate");
    process.exit(1);
  }

  const nextNum = getNextInSequence(seq);
  await performSwitch(seq, String(nextNum));
}

async function cmdStatus(): Promise<void> {
  const email = getCurrentAccount();
  if (email === "none") {
    console.log("none");
  } else {
    // Check if account has alias
    if (existsSync(SEQUENCE_FILE)) {
      const seq = await loadSequence(SEQUENCE_FILE);
      for (const account of Object.values(seq.accounts)) {
        if (account.email === email && account.alias) {
          console.log(`${email} [${account.alias}]`);
          return;
        }
      }
    }
    console.log(email);
  }
}

async function cmdAlias(alias: string, identifier: string): Promise<void> {
  if (!existsSync(SEQUENCE_FILE)) {
    console.error("Error: No accounts managed yet");
    process.exit(1);
  }

  const result = validateAlias(alias);
  if (!result.valid) {
    console.error(`Error: ${result.reason}`);
    process.exit(1);
  }

  const seq = await loadSequence(SEQUENCE_FILE);

  const accountNum = resolveAccountIdentifier(seq, identifier);
  if (!accountNum) {
    console.error(`Error: Account not found: ${identifier}`);
    process.exit(1);
  }

  const updated = setAlias(seq, accountNum, alias);
  await writeJsonAtomic(SEQUENCE_FILE, updated);

  const account = updated.accounts[accountNum];
  console.log(`Alias "${alias}" set for Account-${accountNum} (${account.email})`);
}

async function cmdInteractiveSwitch(): Promise<void> {
  if (!existsSync(SEQUENCE_FILE)) {
    console.error("Error: No accounts managed yet. Run: caflip add");
    process.exit(1);
  }

  const seq = await loadSequence(SEQUENCE_FILE);

  if (seq.sequence.length === 0) {
    console.error("Error: No accounts managed yet. Run: caflip add");
    process.exit(1);
  }

  const targetAccount = await pickAccount(seq);
  await performSwitch(seq, targetAccount);
}

function showHelp(): void {
  console.log(`caflip - Multi-account switcher for Claude Code

Usage: caflip [command]

Commands:
  (no args)                   Interactive account picker
  <alias>                     Switch to account by alias
  list                        List all managed accounts
  add [--alias <name>]        Add current account
  remove [<num|email>]        Remove an account
  next                        Rotate to next account
  status                      Show current account
  alias <name> <num|email>    Set alias for an account
  help                        Show this help

Examples:
  caflip                      Pick account interactively
  caflip work                 Switch to "work" alias
  caflip add --alias personal Add current account with alias
  caflip alias work 2         Set alias "work" for account 2`);
}

// --- Main ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // No args: interactive picker
  if (!command) {
    acquireLock(LOCK_DIR);
    try {
      await cmdInteractiveSwitch();
    } finally {
      releaseLock(LOCK_DIR);
    }
    return;
  }

  switch (command) {
    case "list":
      await cmdList();
      break;

    case "add": {
      acquireLock(LOCK_DIR);
      try {
        // Parse --alias flag
        let alias: string | undefined;
        const aliasIdx = args.indexOf("--alias");
        if (aliasIdx !== -1 && args[aliasIdx + 1]) {
          alias = args[aliasIdx + 1];
        }
        await cmdAdd(alias);
      } finally {
        releaseLock(LOCK_DIR);
      }
      break;
    }

    case "remove": {
      acquireLock(LOCK_DIR);
      try {
        await cmdRemove(args[1]);
      } finally {
        releaseLock(LOCK_DIR);
      }
      break;
    }

    case "next": {
      acquireLock(LOCK_DIR);
      try {
        await cmdNext();
      } finally {
        releaseLock(LOCK_DIR);
      }
      break;
    }

    case "status":
      await cmdStatus();
      break;

    case "alias": {
      if (!args[1] || !args[2]) {
        console.error("Usage: caflip alias <name> <account_number|email>");
        process.exit(1);
      }
      acquireLock(LOCK_DIR);
      try {
        await cmdAlias(args[1], args[2]);
      } finally {
        releaseLock(LOCK_DIR);
      }
      break;
    }

    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;

    default: {
      // Check if it's an alias
      if (existsSync(SEQUENCE_FILE)) {
        const seq = await loadSequence(SEQUENCE_FILE);
        const accountNum = findAccountByAlias(seq, command);
        if (accountNum) {
          acquireLock(LOCK_DIR);
          try {
            await performSwitch(seq, accountNum);
          } finally {
            releaseLock(LOCK_DIR);
          }
          return;
        }
      }

      console.error(`Error: Unknown command "${command}"`);
      showHelp();
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  // Clean up lock on crash
  releaseLock(LOCK_DIR);
  process.exit(1);
});
```

**Step 2: Verify it compiles and runs help**

Run: `cd /Users/lucien/Projects/caflip && bun run src/index.ts help`
Expected: Help text displayed

**Step 3: Verify list command**

Run: `cd /Users/lucien/Projects/caflip && bun run src/index.ts list`
Expected: Account list (reading from existing `~/.claude-switch-backup/sequence.json`)

**Step 4: Verify status command**

Run: `cd /Users/lucien/Projects/caflip && bun run src/index.ts status`
Expected: Current account email

**Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: CLI entry point with all commands, alias routing, and interactive picker"
```

---

### Task 9: Run All Tests + End-to-End Verification

**Step 1: Run full test suite**

Run: `cd /Users/lucien/Projects/caflip && bun test`
Expected: All tests pass

**Step 2: Verify help**

Run: `cd /Users/lucien/Projects/caflip && bun run src/index.ts help`
Expected: Full help output

**Step 3: Verify list**

Run: `cd /Users/lucien/Projects/caflip && bun run src/index.ts list`
Expected: Shows existing accounts from `~/.claude-switch-backup/`

**Step 4: Verify status**

Run: `cd /Users/lucien/Projects/caflip && bun run src/index.ts status`
Expected: Current account email

**Step 5: Test bun link for local CLI**

Run: `cd /Users/lucien/Projects/caflip && bun link`
Then: `caflip help`
Expected: Help output from the linked binary

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve any issues found during e2e verification"
```

Only commit this if changes were needed. Skip if everything passed clean.

---

### Task 10: README

**Files:**
- Create: `README.md`

**Step 1: Write README**

Create `README.md`:

```markdown
# caflip

Multi-account switcher for Claude Code. Switch between Claude Code accounts with a single command.

## Install

Requires [Bun](https://bun.sh/):

```bash
curl -fsSL https://bun.sh/install | bash
```

Then install caflip:

```bash
bun install -g caflip
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

After switching, restart Claude Code to use the new authentication.

## Commands

| Command | Description |
|---|---|
| `caflip` | Interactive account picker |
| `caflip <alias>` | Switch by alias |
| `caflip list` | List managed accounts |
| `caflip add [--alias name]` | Add current account |
| `caflip remove [num\|email]` | Remove an account |
| `caflip next` | Rotate to next account |
| `caflip status` | Show current account |
| `caflip alias <name> <num\|email>` | Set alias for account |
| `caflip help` | Show help |

## Shell Prompt Integration

Show current account in your prompt:

```bash
# .zshrc
PROMPT='$(caflip status) > '
```

## Data Storage

Account data is stored in `~/.claude-switch-backup/`. Compatible with the original bash version (cc-account-switcher).

## License

MIT
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with install, usage, and command reference"
```
