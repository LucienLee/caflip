# Codex MVP Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Codex account switching MVP to `caflip`, supporting only Codex ChatGPT login mode (`~/.codex/auth.json`), using provider subcommands (`caflip claude ...` / `caflip codex ...`).

**Architecture:** Keep existing Claude flow unchanged, and add a provider abstraction layer with two providers: `claude` and `codex`. For MVP, Codex provider only reads/writes active auth from local `~/.codex/auth.json`, resolves current account from `id_token` email/account id, and uses provider-specific backup roots.

**Tech Stack:** Bun + TypeScript CLI, filesystem JSON backups, existing lock/write-json helpers, bun:test.

---

### Task 1: Add Provider Types and CLI Provider Selection

**Files:**
- Create: `src/providers/types.ts`
- Modify: `src/index.ts`
- Test: `tests/provider-selection.test.ts`

**Step 1: Write the failing test**

Add tests for:
- `caflip` (no args) enters provider picker flow
- `caflip claude ...` selects Claude provider
- `caflip codex ...` selects Codex provider
- invalid provider token errors clearly

**Step 2: Run test to verify it fails**

Run: `bun test tests/provider-selection.test.ts`
Expected: FAIL (missing provider parsing/exported resolver)

**Step 3: Write minimal implementation**

- Add `ProviderName = "claude" | "codex"` and parsing helpers in `src/providers/types.ts`.
- In `src/index.ts`, parse provider as the first positional token when it matches `claude|codex`.
- Keep backward compatibility with existing `caflip ...` behavior:
  - no args => provider picker
  - classic command forms still work during transition if needed

**Step 4: Run test to verify it passes**

Run: `bun test tests/provider-selection.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/types.ts src/index.ts tests/provider-selection.test.ts
git commit -m "feat: add provider selection flag and defaults"
```

### Task 2: Introduce Provider-Specific Paths and Backup Roots

**Files:**
- Modify: `src/config.ts`
- Modify: `src/index.ts`
- Test: `tests/config.test.ts`

**Step 1: Write the failing test**

Add tests for provider-specific roots, e.g.:
- `~/.caflip-backup/claude/...`
- `~/.caflip-backup/codex/...`

**Step 2: Run test to verify it fails**

Run: `bun test tests/config.test.ts`
Expected: FAIL (paths still global/non-provider-aware)

**Step 3: Write minimal implementation**

- Add path factories in `src/config.ts`:
  - `getBackupDir(provider)`
  - `getSequenceFile(provider)`
  - `getLockDir(provider)`
  - `getConfigsDir(provider)`
  - `getCredentialsDir(provider)`
- Thread selected provider through command handlers in `src/index.ts`.

**Step 4: Run test to verify it passes**

Run: `bun test tests/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts src/index.ts tests/config.test.ts
git commit -m "feat: add provider-specific backup path factories"
```

### Task 3: Add Codex Auth Store Module (MVP)

**Files:**
- Create: `src/providers/codex.ts`
- Test: `tests/codex-provider.test.ts`

**Step 1: Write the failing test**

Add tests for:
- reading current codex account email from `~/.codex/auth.json` `tokens.id_token`
- reading/writing active auth payload (`auth.json`)
- clear/logout behavior (remove/reset auth file for MVP-compatible behavior)
- malformed/absent auth.json handling

**Step 2: Run test to verify it fails**

Run: `bun test tests/codex-provider.test.ts`
Expected: FAIL (module does not exist)

**Step 3: Write minimal implementation**

- Implement:
  - `readCodexActiveAuth()`
  - `writeCodexActiveAuth(raw: string)`
  - `clearCodexActiveAuth()`
  - `getCodexCurrentAccount(): { email: string; accountId?: string } | null`
- Parse JWT payload safely (base64url decode only; no signature verification needed for local identity extraction).
- Keep strict file permissions (`600`) when writing.

**Step 4: Run test to verify it passes**

Run: `bun test tests/codex-provider.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/codex.ts tests/codex-provider.test.ts
git commit -m "feat: add codex auth storage module for chatgpt login mode"
```

### Task 4: Create Provider Interface and Claude Adapter

**Files:**
- Create: `src/providers/index.ts`
- Create: `src/providers/claude.ts`
- Modify: `src/credentials.ts`
- Modify: `src/index.ts`
- Test: `tests/provider-adapter.test.ts`

**Step 1: Write the failing test**

Add tests for provider contract:
- both providers expose current-account read, active-auth read/write/clear, and backup read/write/delete behavior

**Step 2: Run test to verify it fails**

Run: `bun test tests/provider-adapter.test.ts`
Expected: FAIL (provider registry/interface absent)

**Step 3: Write minimal implementation**

- Define `AuthProvider` interface in `src/providers/index.ts`.
- Move Claude-specific account/auth operations behind `providers/claude.ts` using existing `credentials.ts`.
- Add Codex provider registration.
- Update `src/index.ts` flow to call provider methods instead of direct Claude-only helpers.

**Step 4: Run test to verify it passes**

Run: `bun test tests/provider-adapter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/index.ts src/providers/claude.ts src/credentials.ts src/index.ts tests/provider-adapter.test.ts
git commit -m "refactor: route account operations through provider adapters"
```

### Task 5: Implement Codex Command Flows (add/switch/remove/status/interactive)

**Files:**
- Modify: `src/index.ts`
- Modify: `src/interactive.ts`
- Modify: `src/accounts.ts`
- Test: `tests/switch.test.ts`
- Test: `tests/remove.test.ts`
- Test: `tests/interactive.test.ts`
- Test: `tests/codex-flow.test.ts` (new)

**Step 1: Write the failing test**

Add codex-specific integration tests for:
- `add` captures current codex account from auth.json
- `switch` restores selected codex auth backup
- `remove` on active account performs switch/logout logic correctly
- interactive picker includes unmanaged-current-account add action
- `status` returns codex current email (+alias if managed)

**Step 2: Run test to verify it fails**

Run: `bun test tests/codex-flow.test.ts tests/switch.test.ts tests/remove.test.ts tests/interactive.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

- Thread provider-aware sequence/config paths through all command handlers.
- Reuse existing sequence behavior (`active`, `next`, aliasing).
- For codex provider, backup/restore active auth file content per managed account.

**Step 4: Run test to verify it passes**

Run: `bun test tests/codex-flow.test.ts tests/switch.test.ts tests/remove.test.ts tests/interactive.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/index.ts src/interactive.ts src/accounts.ts tests/codex-flow.test.ts tests/switch.test.ts tests/remove.test.ts tests/interactive.test.ts
git commit -m "feat: implement codex mvp command flows"
```

### Task 6: UX, Docs, and Help Updates

**Files:**
- Modify: `README.md`
- Modify: `src/index.ts`
- Modify: `install.sh` (if needed for naming/examples only)

**Step 1: Write the failing test**

If help snapshot tests exist, add/update them; otherwise create lightweight output checks for:
- `--provider codex` usage examples
- MVP scope note: codex chatgpt login mode only

**Step 2: Run test to verify it fails**

Run: `bun test tests/provider-selection.test.ts`
Expected: FAIL for outdated text/usage

**Step 3: Write minimal implementation**

- Update README command examples:
  - `caflip codex list`
  - `caflip codex add`
  - `caflip codex`
  - `caflip` (provider picker first, then account picker)
- Document MVP limitation and known constraints.
- Update CLI help text accordingly.

**Step 4: Run test to verify it passes**

Run: `bun test tests/provider-selection.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add README.md src/index.ts install.sh tests/provider-selection.test.ts
git commit -m "docs: add codex provider usage and mvp scope notes"
```

### Task 7: Full Verification and Release Prep

**Files:**
- Modify: `package.json` (only if version bump requested)
- Optional: `CHANGELOG.md` (if present later)

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 2: Run build verification**

Run:
- `bun run buildjs`
- `bun run build`
Expected: build artifacts generated without errors

**Step 3: Smoke-test CLI**

Run example commands:
- `bun run src/index.ts --help`
- `bun run src/index.ts --provider claude status`
- `bun run src/index.ts --provider codex status`

Expected: clear output, no crashes.

**Step 4: Commit verification-only fixes (if any)**

```bash
git add -A
git commit -m "chore: finalize codex mvp integration verification"
```

---

**Plan complete and saved to `docs/plans/2026-02-24-codex-mvp-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
