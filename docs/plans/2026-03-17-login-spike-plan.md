# Provider Login Spike Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove whether `caflip` can orchestrate the official `codex` and `claude` CLI login flows through one shared design, then automatically register the resulting session back into caflip without requiring the user to manually switch away and come back.

**Architecture:** Add a thin login orchestration layer inside `caflip` that shells out to the official provider CLI with inherited stdio, waits for completion, validates post-login state using caflip's existing credential readers plus optional provider status commands, and then reuses existing account registration/storage code. The design should be intentionally symmetric across `codex` and `claude`: same command shape, same orchestration lifecycle, same post-login registration path, with only provider-specific command arguments and verification details hidden behind adapters.

**Tech Stack:** Bun, TypeScript, existing `caflip` CLI entrypoint, Bun test, local `codex` and `claude` CLIs.

---

## File Map

- Create: `src/login/runner.ts`
  Responsibility: spawn provider CLI login commands, inherit stdio, return structured result.
- Create: `src/login/types.ts`
  Responsibility: shared login orchestration types and result shape.
- Create: `tests/login-runner.test.ts`
  Responsibility: command composition, subprocess exit handling, missing-binary errors.
- Create: `tests/login-command.test.ts`
  Responsibility: provider-qualified `login` command routing and post-login registration behavior using fakes.
- Modify: `src/index.ts`
  Responsibility: route new `caflip <provider> login` command and reuse existing add/register logic.
- Modify: `src/providers/claude.ts`
  Responsibility: expose provider-specific login/status command metadata if needed.
- Modify: `src/providers/codex.ts`
  Responsibility: expose provider-specific login/status command metadata if needed.
- Modify: `src/providers/index.ts`
  Responsibility: surface login-capable provider adapters if the abstraction belongs there.
- Modify: `README.md`
  Responsibility: document spike command behavior, caveats, and known limitations.
- Optional Create: `docs/spikes/2026-03-17-provider-login-findings.md`
  Responsibility: record manual findings and final go/no-go recommendation per provider.

## Success Criteria

- `caflip codex login` can launch official Codex login from inside caflip, wait for completion, detect logged-in identity, and store/update the account in caflip backup.
- `caflip claude login` can launch official Claude login from inside caflip, wait for completion, detect logged-in identity, and store/update the account in caflip backup, or the spike produces hard evidence for why this path should not ship.
- Both providers use the same top-level command contract and the same shared orchestration shape inside caflip.
- Failure cases are explicit: missing CLI binary, login cancelled, login exits zero but no account becomes readable, existing account collision/update behavior.
- The spike result ends with a written decision: ship `codex` only, ship both, or ship `codex` plus guided Claude fallback.

## Non-Goals

- Reimplement provider OAuth/browser flows inside caflip for v1.
- Add Windows support during the spike.
- Build a generalized plugin system for providers.
- Auto-restart Codex or Claude after login.

## Decision Gates

- Gate 1: shared subprocess orchestration works with inherited stdio in tests and in one manual local run.
- Gate 2: shared orchestration is good enough that both providers can use the same design without branching into separate auth architectures.
- Gate 3: `codex` post-login detection is reliable enough to register back into caflip.
- Gate 4: `claude` post-login detection is reliable enough to register back into caflip.
- Gate 5: if one provider fails under the shared design, stop and decide whether to ship single-provider support or guided fallback instead of introducing a second auth architecture by default.

## Chunk 1: Shared Orchestration Scaffold

### Task 1: Define the login runner contract

**Files:**
- Create: `src/login/types.ts`
- Create: `tests/login-runner.test.ts`

- [ ] **Step 1: Write the failing test for runner result shape**

```ts
import { describe, expect, test } from "bun:test";
import { buildLoginCommand } from "../src/login/runner";

describe("login runner command composition", () => {
  test("builds codex login command", () => {
    expect(buildLoginCommand("codex", {})).toEqual(["codex", "login"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/login-runner.test.ts`
Expected: FAIL with missing module or missing export.

- [ ] **Step 3: Write minimal shared types**

```ts
export interface LoginOptions {
  email?: string;
  sso?: boolean;
}

export interface LoginRunResult {
  exitCode: number;
  signalCode: number | null;
}
```

- [ ] **Step 4: Run test again**

Run: `bun test tests/login-runner.test.ts`
Expected: still FAIL because `buildLoginCommand` is not implemented.

- [ ] **Step 5: Commit**

```bash
git add src/login/types.ts tests/login-runner.test.ts
git commit -m "test: add login runner contract coverage"
```

### Task 2: Implement command composition and subprocess wrapper

**Files:**
- Create: `src/login/runner.ts`
- Modify: `tests/login-runner.test.ts`

- [ ] **Step 1: Extend the failing test to cover both providers**

```ts
test("builds claude login command with flags", () => {
  expect(buildLoginCommand("claude", { email: "me@example.com", sso: true })).toEqual([
    "claude",
    "auth",
    "login",
    "--email",
    "me@example.com",
    "--sso",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/login-runner.test.ts`
Expected: FAIL because the builder does not yet handle provider-specific commands.

- [ ] **Step 3: Implement minimal command builder and runner**

```ts
export function buildLoginCommand(provider: "claude" | "codex", options: LoginOptions): string[] {
  if (provider === "codex") return ["codex", "login"];

  const command = ["claude", "auth", "login"];
  if (options.email) command.push("--email", options.email);
  if (options.sso) command.push("--sso");
  return command;
}
```

- [ ] **Step 4: Add a subprocess wrapper test using a fake executable**

```ts
test("runLoginCommand returns child exit code", async () => {
  const result = await runLoginCommand(["/tmp/fake-login"]);
  expect(result.exitCode).toBe(0);
});
```

- [ ] **Step 5: Run tests**

Run: `bun test tests/login-runner.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/login/runner.ts tests/login-runner.test.ts
git commit -m "feat: add login subprocess runner"
```

### Task 2.5: Lock the shared provider-adapter contract before provider spikes

**Files:**
- Modify: `src/providers/index.ts`
- Modify: `src/providers/codex.ts`
- Modify: `src/providers/claude.ts`
- Test: `tests/provider-adapter.test.ts`

- [ ] **Step 1: Write the failing adapter contract test**

```ts
test("providers expose symmetric login metadata", () => {
  expect(getProvider("codex").login.buildCommand({})).toEqual(["codex", "login"]);
  expect(getProvider("claude").login.buildCommand({})).toEqual(["claude", "auth", "login"]);
});
```

- [ ] **Step 2: Run the test**

Run: `bun test tests/provider-adapter.test.ts`
Expected: FAIL because provider adapters do not yet expose login metadata.

- [ ] **Step 3: Implement the minimal provider login adapter shape**

Implementation note: expose a narrow provider-owned contract such as:

```ts
login: {
  buildCommand(options: LoginOptions): string[];
  verifyCurrentAccount(): { email: string; accountId?: string } | null;
}
```

- [ ] **Step 4: Run the adapter tests**

Run: `bun test tests/provider-adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/index.ts src/providers/codex.ts src/providers/claude.ts tests/provider-adapter.test.ts
git commit -m "refactor: add symmetric provider login adapters"
```

## Chunk 2: CLI Routing and Shared Post-Login Registration

### Task 3: Add provider-qualified `login` command routing

**Files:**
- Modify: `src/index.ts`
- Create: `tests/login-command.test.ts`
- Test: `tests/provider-selection.test.ts`

- [ ] **Step 1: Write the failing routing test**

```ts
test("routes provider-qualified login command", async () => {
  const proc = Bun.spawn(["bun", "run", "src/index.ts", "codex", "login"], {
    cwd: process.cwd(),
    env: { ...process.env, HOME: testHome, PATH: fakeBinPath },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(await proc.exited).toBe(0);
});
```

- [ ] **Step 2: Run the routing test**

Run: `bun test tests/login-command.test.ts`
Expected: FAIL because `login` is not a recognized command.

- [ ] **Step 3: Implement `cmdLogin()` in `src/index.ts`**

```ts
async function cmdLogin(options?: { alias?: string; email?: string; sso?: boolean }): Promise<void> {
  const result = await runProviderLogin(activeProvider.name, options ?? {});
  if (result.exitCode !== 0) throw new Error(`${getProviderLabel()} login failed`);
  await registerCurrentAccountAfterLogin(options?.alias);
}
```

- [ ] **Step 4: Reuse existing `cmdAdd()` semantics instead of duplicating storage logic**

Implementation note: factor the account registration portion of `cmdAdd()` into a shared helper such as `registerCurrentActiveAccount(alias?: string, options?: { updateIfExists?: boolean })`.

- [ ] **Step 5: Run targeted tests**

Run: `bun test tests/login-command.test.ts tests/provider-selection.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts tests/login-command.test.ts tests/provider-selection.test.ts
git commit -m "feat: add provider login command routing"
```

### Task 4: Define existing-account update semantics

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/login-command.test.ts`
- Test: `tests/codex-flow.test.ts`

- [ ] **Step 1: Write the failing test for already-managed account refresh**

```ts
test("login refreshes backup when account already exists", async () => {
  expect(sequence.accounts["1"].email).toBe("codex-a@test.com");
  expect(refreshedAuth).toBe(newAuth);
});
```

- [ ] **Step 2: Run the test**

Run: `bun test tests/login-command.test.ts`
Expected: FAIL because current add flow exits early for existing accounts.

- [ ] **Step 3: Implement refresh behavior**

Implementation note: when login completes into an already-managed account, update its saved auth/config backup instead of printing "already managed" and returning.

- [ ] **Step 4: Run targeted tests**

Run: `bun test tests/login-command.test.ts tests/codex-flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/login-command.test.ts tests/codex-flow.test.ts
git commit -m "feat: refresh managed account data after login"
```

## Chunk 3: Codex Spike

### Task 5: Prove Codex login orchestration with the shared CLI path

**Files:**
- Modify: `src/providers/codex.ts`
- Modify: `tests/login-command.test.ts`
- Test: `tests/codex-provider.test.ts`

- [ ] **Step 1: Write the failing test for Codex post-login detection**

```ts
test("codex login registers current account after child process succeeds", async () => {
  const seq = JSON.parse(readFileSync(sequenceFile, "utf-8"));
  expect(seq.accounts["1"].email).toBe("codex-login@test.com");
});
```

- [ ] **Step 2: Run the test**

Run: `bun test tests/login-command.test.ts`
Expected: FAIL because the login route does not yet verify readable post-login credentials after the shared CLI runner exits.

- [ ] **Step 3: Implement provider-specific post-login verification**

Implementation note: after the shared runner finishes `codex login`, call existing `getCodexCurrentAccount()` and `readCodexActiveAuth()`; treat missing or unreadable auth as a login failure even if the child exits zero.

- [ ] **Step 4: Run targeted tests**

Run: `bun test tests/login-command.test.ts tests/codex-provider.test.ts tests/codex-flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Perform a manual local spike**

Run: `bun run src/index.ts codex login`
Expected: official Codex login starts, browser/device flow completes, account becomes visible to `caflip codex status`, and backup files appear under `~/.caflip-backup/codex/`.

- [ ] **Step 6: Record findings**

Write down:
- whether inherited stdio was sufficient
- whether Codex opened the browser automatically
- whether `codex login status` and caflip's credential readers agreed on the active account
- whether the process needs any extra UX messaging
- whether Codex required any provider-specific handling that would break the shared design

- [ ] **Step 7: Commit**

```bash
git add src/providers/codex.ts tests/login-command.test.ts
git commit -m "feat: spike codex login orchestration"
```

## Chunk 4: Claude Spike

### Task 6: Prove Claude login orchestration with the shared CLI path

**Files:**
- Modify: `src/providers/claude.ts`
- Modify: `tests/login-command.test.ts`
- Test: `tests/provider-adapter.test.ts`

- [ ] **Step 1: Write the failing test for Claude command composition and verification**

```ts
test("claude login uses auth login and stores current account after success", async () => {
  expect(stdout).toContain("Added");
  expect(savedEmail).toBe("claude-login@test.com");
});
```

- [ ] **Step 2: Run the test**

Run: `bun test tests/login-command.test.ts`
Expected: FAIL because Claude-specific login flow is not implemented.

- [ ] **Step 3: Implement Claude verification**

Implementation note: after the shared runner finishes `claude auth login`, verify via existing Claude current-account reader plus readable credentials/config. If `claude auth status` is available and cheap, use it only for diagnostics; do not make it the source of truth if local config is enough.

- [ ] **Step 4: Run targeted tests**

Run: `bun test tests/login-command.test.ts tests/provider-adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Perform a manual local spike**

Run: `bun run src/index.ts claude login`
Expected: official Claude login starts, user can complete auth from the same terminal, and caflip can read the resulting active account.

- [ ] **Step 6: Evaluate reliability**

Record:
- whether the login subprocess cleanly returns control to caflip
- whether `claude auth login` can be safely wrapped under inherited stdio
- whether account detection after login is deterministic
- whether SSO/email flags are worth exposing in caflip v1
- whether Claude required any provider-specific handling that would break the shared design

- [ ] **Step 7: Commit**

```bash
git add src/providers/claude.ts tests/login-command.test.ts
git commit -m "feat: spike claude login orchestration"
```

## Chunk 5: Product Decision and Documentation

### Task 7: Decide ship scope from spike evidence

**Files:**
- Optional Create: `docs/spikes/2026-03-17-provider-login-findings.md`
- Modify: `README.md`

- [ ] **Step 1: Write the decision record**

Use this template:

```md
## Recommendation
- Ship: codex only | codex + claude | codex + claude guided fallback

## Evidence
- Codex:
- Claude:

## Risks
- ...
```

- [ ] **Step 2: Update README command docs**

Document only what the spike proves. If one provider is not reliable under the shared CLI-orchestration design, do not present it as generally supported.

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: PASS.

- [ ] **Step 4: Manual regression checks**

Run:
- `bun run src/index.ts codex help`
- `bun run src/index.ts claude help`
- `bun run src/index.ts codex status`
- `bun run src/index.ts claude status`

Expected: existing commands still behave normally and help output includes `login` only if implemented.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/spikes/2026-03-17-provider-login-findings.md
git commit -m "docs: record provider login spike findings"
```

## Notes for the Worker

- Treat `codex` and `claude` as separate ship decisions, but keep the implementation architecture shared unless the spike proves that impossible.
- Reuse existing credential readers and writers. The point of this spike is orchestration, not a second auth store.
- Prefer fake binaries in tests over invoking real login in automated runs.
- Manual runs are required evidence for this spike. Tests alone are not sufficient.
- If subprocess orchestration requires pty-specific behavior that Bun cannot supply cleanly, stop and record that as a major design constraint instead of layering hacks into the CLI.
- Do not introduce a custom Codex OAuth implementation during this spike unless the shared CLI path is conclusively blocked and that fallback is explicitly re-approved.

## Expected Outcome

At the end of this plan, `caflip` should have either:

- a validated shared CLI-orchestration path for both providers, or
- a validated shared path for one provider plus explicit evidence that the other should stay on a guided handoff flow.

Plan complete and saved to `docs/superpowers/plans/2026-03-17-login-spike-plan.md`. Ready to execute?
