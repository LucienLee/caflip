# Provider-First CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor caflip to a provider-first CLI where `caflip` opens a provider picker, non-interactive commands require explicit `claude|codex`, `all` is removed, and `status` supports `--json`.

**Architecture:** Add a first-stage provider selection flow and strict command parser gates. Keep provider adapters unchanged for account/auth logic, and layer new CLI semantics in `src/index.ts` plus small reusable prompt/meta helpers. Use TDD per behavior slice and commit in small batches.

**Tech Stack:** Bun, TypeScript, @inquirer/prompts, existing provider adapter modules, bun test.

---

### Task 1: Add CLI Metadata Store for Last Provider

**Files:**
- Create: `src/meta.ts`
- Test: `tests/meta.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readCliMeta, writeLastProvider } from "../src/meta";

describe("cli meta", () => {
  test("reads default provider when file is missing", () => {
    const home = mkdtempSync(join(tmpdir(), "caflip-meta-test-"));
    process.env.HOME = home;
    expect(readCliMeta().lastProvider).toBe("claude");
    rmSync(home, { recursive: true, force: true });
  });

  test("persists lastProvider", () => {
    const home = mkdtempSync(join(tmpdir(), "caflip-meta-test-"));
    process.env.HOME = home;
    writeLastProvider("codex");
    expect(readCliMeta().lastProvider).toBe("codex");
    rmSync(home, { recursive: true, force: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/meta.test.ts`
Expected: FAIL (`Cannot find module '../src/meta'`).

**Step 3: Write minimal implementation**

```ts
// src/meta.ts
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync } from "fs";
import { writeJsonAtomic } from "./files";
import type { ProviderName } from "./providers/types";

const META_FILE = join(homedir(), ".caflip-backup", ".meta.json");

export interface CliMeta { lastProvider: ProviderName }

export function readCliMeta(): CliMeta {
  if (!existsSync(META_FILE)) return { lastProvider: "claude" };
  try {
    const obj = JSON.parse(readFileSync(META_FILE, "utf-8"));
    return obj.lastProvider === "codex" ? { lastProvider: "codex" } : { lastProvider: "claude" };
  } catch {
    return { lastProvider: "claude" };
  }
}

export function writeLastProvider(provider: ProviderName): void {
  mkdirSync(join(homedir(), ".caflip-backup"), { recursive: true, mode: 0o700 });
  void writeJsonAtomic(META_FILE, { lastProvider: provider });
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/meta.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/meta.ts tests/meta.test.ts
git commit -m "feat: persist last selected provider metadata"
```

### Task 2: Add Provider Picker and Empty-State Actions

**Files:**
- Modify: `src/interactive.ts`
- Test: `tests/interactive.test.ts`

**Step 1: Write the failing test**

```ts
test("pickProvider supports default provider hint", async () => {
  const fakeSelect = async (args: { choices: Array<{name: string; value: string}> }) => {
    expect(args.choices.map((c) => c.value)).toEqual(["claude", "codex"]);
    return "codex";
  };
  await expect(pickProvider("claude", fakeSelect)).resolves.toBe("codex");
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/interactive.test.ts`
Expected: FAIL (`pickProvider is not defined`).

**Step 3: Write minimal implementation**

```ts
export async function pickProvider(
  defaultProvider: "claude" | "codex",
  promptSelect: SelectPrompt = select
): Promise<"claude" | "codex"> {
  const choices = [
    { name: defaultProvider === "claude" ? "Claude Code (last used)" : "Claude Code", value: "claude" },
    { name: defaultProvider === "codex" ? "Codex (last used)" : "Codex", value: "codex" },
  ];
  const selected = await pickChoice("Select provider", choices, promptSelect);
  return selected as "claude" | "codex";
}
```

Add empty-state choice coverage in existing tests via `pickChoice`.

**Step 4: Run test to verify it passes**

Run: `bun test tests/interactive.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/interactive.ts tests/interactive.test.ts
git commit -m "feat: add provider picker prompt helpers"
```

### Task 3: Enforce Provider-First Command Parsing

**Files:**
- Modify: `src/providers/types.ts`
- Modify: `src/config.ts`
- Modify: `tests/provider-selection.test.ts`
- Modify: `tests/validation.test.ts`
- Modify: `tests/config.test.ts`

**Step 1: Write the failing tests**

```ts
test("rejects non-interactive command without provider", () => {
  expect(() => parseProviderArgs(["list"]))
    .toThrow(/Provider is required for non-interactive commands/i);
});

test("allows top-level interactive entry with no args", () => {
  expect(parseProviderArgs([])).toEqual({ provider: null, commandArgs: [] });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/provider-selection.test.ts tests/validation.test.ts tests/config.test.ts`
Expected: FAIL with old parser behavior.

**Step 3: Write minimal implementation**

```ts
// parseProviderArgs return type
{ provider: ProviderName | null; commandArgs: string[]; isProviderQualified: boolean }

// rules
- [] => { provider: null, commandArgs: [], isProviderQualified: false }
- [claude|codex, ...rest] => provider set, isProviderQualified true
- otherwise => provider null, commandArgs args, isProviderQualified false
```

Update reserved commands to remove `all`; keep `claude` and `codex` reserved aliases.

**Step 4: Run tests to verify they pass**

Run: `bun test tests/provider-selection.test.ts tests/validation.test.ts tests/config.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/providers/types.ts src/config.ts tests/provider-selection.test.ts tests/validation.test.ts tests/config.test.ts
git commit -m "refactor: make parser provider-first and remove all command reservation"
```

### Task 4: Refactor `src/index.ts` Main Flow to Provider Picker First

**Files:**
- Modify: `src/index.ts`
- Test: `tests/provider-first-flow.test.ts` (new)

**Step 1: Write failing integration tests**

```ts
test("caflip with no args opens provider picker path", async () => {
  // spawn help-like run with mocked prompt helpers or exported handler
  // expect provider chooser flow invoked
});

test("caflip list without provider exits 2 with guidance", async () => {
  const proc = Bun.spawn(["bun", "run", "src/index.ts", "list"], { stdout: "pipe", stderr: "pipe" });
  const stderr = await new Response(proc.stderr).text();
  expect(await proc.exited).toBe(2);
  expect(stderr).toContain("Provider is required for non-interactive commands");
});

test("caflip work without provider exits 2", async () => {
  // expect alias requires provider prefix
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/provider-first-flow.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Key code changes in `src/index.ts`:
- Remove `all` route and global picker usage.
- Add top-level no-args handler:
  - read `lastProvider` from `src/meta.ts`
  - call `pickProvider(...)`
  - persist selected provider
  - dispatch provider interactive switch
- When args exist and parser says `isProviderQualified === false`, return usage error with exit code `2`.
- Keep provider-specific commands behavior unchanged once provider is selected.
- Ensure `caflip <alias>` without provider returns usage error (`2`).

**Step 4: Run tests to verify they pass**

Run: `bun test tests/provider-first-flow.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/index.ts src/meta.ts tests/provider-first-flow.test.ts
git commit -m "feat: switch top-level cli to provider picker and strict provider-qualified commands"
```

### Task 5: Implement Provider Empty-State `Add` / `Back`

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/provider-first-flow.test.ts`

**Step 1: Write failing tests**

```ts
test("provider interactive with no managed accounts shows add/back flow", async () => {
  // with isolated HOME and no sequence file
  // mock choice returns add => expects cmdAdd path attempted
});

test("empty-state back returns to provider picker", async () => {
  // verify back does not error and exits 0 on cancel/back
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/provider-first-flow.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

In `src/index.ts` provider interactive handler:
- if provider sequence missing/empty, call `pickChoice("No managed <Provider> accounts yet", [...])`
- choices:
  - `Add current logged-in account`
  - `Back`
- `Add` calls `cmdAdd()` under lock.
- `Back` returns to provider picker loop.

**Step 4: Run tests to verify they pass**

Run: `bun test tests/provider-first-flow.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/index.ts tests/provider-first-flow.test.ts
git commit -m "feat: add provider empty-state actions for add and back"
```

### Task 6: Add `status --json` and Preserve Text Mode

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/codex-flow.test.ts`
- Create: `tests/status-json.test.ts`

**Step 1: Write failing tests**

```ts
test("claude status --json prints structured payload", async () => {
  // expect provider/email/alias/managed keys
});

test("codex status --json prints null email when logged out", async () => {
  // expect email null alias null managed false
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/status-json.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

In `cmdStatus`:
- parse optional `--json`
- build payload:

```ts
{
  provider: activeProvider.name,
  email: email === "none" ? null : email,
  alias: resolvedAliasOrNull,
  managed: resolvedManagedBool,
}
```

- print `JSON.stringify(payload)` for json mode.
- keep existing text output behavior unchanged.

**Step 4: Run tests to verify they pass**

Run: `bun test tests/status-json.test.ts tests/codex-flow.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/index.ts tests/status-json.test.ts tests/codex-flow.test.ts
git commit -m "feat: add structured status output via --json"
```

### Task 7: Update Help/README and Remove `all` Artifacts

**Files:**
- Modify: `README.md`
- Modify: `src/index.ts`
- Remove/Modify: `src/global.ts`
- Remove/Modify: `tests/global.test.ts`

**Step 1: Write failing tests/doc assertions**

```ts
test("help no longer advertises all command", async () => {
  // spawn help, assert not contains "all"
  // assert contains provider-required examples
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/provider-selection.test.ts`
Expected: FAIL if stale help text remains.

**Step 3: Write minimal implementation**

- Remove `all` docs and examples.
- Update help usage to emphasize:
  - `caflip` interactive provider picker
  - `caflip <provider> [command]`
- If `src/global.ts` becomes unused, delete it and replace with provider picker logic only.

**Step 4: Run tests to verify they pass**

Run: `bun test tests/provider-selection.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add README.md src/index.ts src/global.ts tests/global.test.ts tests/provider-selection.test.ts
git commit -m "docs: align cli help with provider-first interaction model"
```

### Task 8: Full Verification and Release Readiness

**Files:**
- Modify if needed: any touched files from prior tasks

**Step 1: Run full test suite**

Run: `bun test`
Expected: all tests PASS.

**Step 2: Run smoke commands locally**

Run:
- `bun run src/index.ts help`
- `bun run src/index.ts` (manual provider picker smoke)
- `bun run src/index.ts claude status`
- `bun run src/index.ts codex status --json`

Expected:
- provider-first help text
- provider picker shown for no-args
- status outputs match spec

**Step 3: Build artifact check**

Run: `bun run buildjs`
Expected: `dist/cli.js` generated with no errors.

**Step 4: Commit final fixes (if any)**

```bash
git add -A
git commit -m "test: finalize provider-first cli behavior and docs"
```

**Step 5: Final branch status check**

Run: `git status`
Expected: clean working tree.

