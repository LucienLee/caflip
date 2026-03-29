# Workspace-Aware Account Identity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support managing and switching accounts by provider identity plus workspace/team context instead of email alone.

**Architecture:** Introduce normalized provider-aware identity metadata for managed accounts, migrate matching logic from email-based lookup to `uniqueKey`, and update CLI output so same-email accounts are distinguishable by workspace/organization. Keep backup file naming stable in the first iteration to reduce migration risk.

**Tech Stack:** Bun, TypeScript, CLI integration tests, provider-specific auth/config readers

---

## File Structure

- Modify: `src/accounts.ts`
  - Replace email-based matching helpers with provider-aware identity helpers.
- Modify: `src/providers/types.ts`
  - Extend provider contract to return normalized identity/display metadata.
- Modify: `src/providers/codex.ts`
  - Decode and normalize Codex organization/workspace identity.
- Modify: `src/providers/claude.ts`
  - Normalize Claude account and organization identity from config and status sources.
- Modify: `src/index.ts`
  - Register, sync, status, list, alias, and switch flows use normalized identity.
- Modify: `tests/accounts.test.ts`
  - Cover new identity lookup and migration helpers.
- Modify: `tests/codex-flow.test.ts`
  - Cover same-email multi-workspace Codex behavior.
- Modify: `tests/provider-first-flow.test.ts`
  - Cover list/status display with workspace labels.
- Modify: `tests/status-json.test.ts`
  - Decide whether JSON remains backward-compatible or grows new fields.
- Create: `tests/claude-workspace-identity.test.ts`
  - Cover same-email multi-organization Claude behavior.
- Create: `tests/migration.test.ts`
  - Cover legacy `sequence.json` upgrade behavior.

## Chunk 1: Normalize Provider Identity

### Task 1: Define normalized provider identity types

**Files:**
- Modify: `src/providers/types.ts`
- Test: `tests/provider-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions that provider adapters can expose normalized current-account identity with provider-specific organization metadata.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/provider-adapter.test.ts`
Expected: FAIL because normalized identity fields are not in the provider contract yet.

- [ ] **Step 3: Write minimal implementation**

Add a normalized current-account return type to the provider contract, including:

- `email`
- `accountId`
- `organizationId`
- `organizationName`
- `planType`
- `role`
- `uniqueKey`

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/provider-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/types.ts tests/provider-adapter.test.ts
git commit -m "feat: define normalized provider account identity"
```

### Task 2: Normalize Codex identity extraction

**Files:**
- Modify: `src/providers/codex.ts`
- Test: `tests/provider-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Add a Codex test fixture with the same email plus organization metadata and assert normalized output picks the default organization and builds the expected `uniqueKey`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/provider-adapter.test.ts`
Expected: FAIL because the Codex provider only returns `email` and `accountId`.

- [ ] **Step 3: Write minimal implementation**

Parse `organizations[]`, select the active/default organization, and expose normalized identity/display data.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/provider-adapter.test.ts tests/codex-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/codex.ts tests/provider-adapter.test.ts tests/codex-provider.test.ts
git commit -m "feat: normalize codex workspace identity"
```

### Task 3: Normalize Claude identity extraction

**Files:**
- Modify: `src/providers/claude.ts`
- Test: `tests/provider-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Add a Claude test fixture asserting normalized identity uses `accountUuid + organizationUuid` and surfaces organization name and role.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/provider-adapter.test.ts`
Expected: FAIL because the Claude provider only returns `email` and `accountId`.

- [ ] **Step 3: Write minimal implementation**

Read normalized identity from `oauthAccount`, enrich with status metadata where available, and build the Claude `uniqueKey`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/provider-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/claude.ts tests/provider-adapter.test.ts
git commit -m "feat: normalize claude organization identity"
```

## Chunk 2: Migrate Account Registry to Identity Keys

### Task 4: Add normalized account schema and legacy loader

**Files:**
- Modify: `src/accounts.ts`
- Test: `tests/accounts.test.ts`
- Create: `tests/migration.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests for:

- loading legacy email/uuid records without data loss
- creating a new normalized account record
- preserving `alias` and sequence order
- leaving legacy records readable without immediately rewriting the file

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/accounts.test.ts tests/migration.test.ts`
Expected: FAIL because no migration path exists yet.

- [ ] **Step 3: Write minimal implementation**

Update the account types and load path so legacy records are upgraded in memory into the new shape with fallback `legacyUuid`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/accounts.test.ts tests/migration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/accounts.ts tests/accounts.test.ts tests/migration.test.ts
git commit -m "feat: add normalized managed account schema"
```

### Task 5: Replace email-based lookup helpers with identity-based lookup

**Files:**
- Modify: `src/accounts.ts`
- Test: `tests/accounts.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests showing:

- same email + different organization produces distinct managed accounts
- same identity refreshes the existing account
- legacy fallback only works when a single provider/email candidate exists
- ambiguous same-email legacy matches do not auto-merge

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/accounts.test.ts`
Expected: FAIL because lookup still collapses on email.

- [ ] **Step 3: Write minimal implementation**

Replace:

- `accountExists`
- `resolveManagedAccountNumberForEmail`
- `resolveAccountIdentifier`

with identity-aware variants, keeping email lookup only as an explicit human-target convenience.

Migration rule:

- `uniqueKey` match first
- email fallback only for a single legacy candidate
- ambiguity must stop auto-merge

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/accounts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/accounts.ts tests/accounts.test.ts
git commit -m "feat: resolve managed accounts by identity key"
```

## Chunk 3: Update CLI Registration and Switching

### Task 6: Register login/add flows with normalized identity

**Files:**
- Modify: `src/index.ts`
- Test: `tests/login-command.test.ts`
- Test: `tests/login-registration.test.ts`
- Test: `tests/codex-flow.test.ts`
- Create: `tests/claude-workspace-identity.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests for:

- Codex same-email different-organization login creates two managed accounts
- Claude same-email different-organization login creates two managed accounts
- same identity login refreshes existing backup instead of duplicating
- same-email login does not overwrite a legacy record when workspace identity is still uncertain

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/login-command.test.ts tests/login-registration.test.ts tests/codex-flow.test.ts tests/claude-workspace-identity.test.ts`
Expected: FAIL because registration still matches by email.

- [ ] **Step 3: Write minimal implementation**

Update registration flow to:

- use normalized provider identity
- persist display metadata
- fall back to legacy records only when necessary
- prefer creating a new slot over merging when the legacy target is ambiguous

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/login-command.test.ts tests/login-registration.test.ts tests/codex-flow.test.ts tests/claude-workspace-identity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/login-command.test.ts tests/login-registration.test.ts tests/codex-flow.test.ts tests/claude-workspace-identity.test.ts
git commit -m "feat: register workspace-aware managed accounts"
```

### Task 7: Update switch and active sync logic

**Files:**
- Modify: `src/index.ts`
- Test: `tests/switch.test.ts`
- Test: `tests/provider-first-flow.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests asserting:

- active marker resolves by normalized identity, not just email
- switch short-circuit only triggers when the active identity matches the target identity
- successful switch can opportunistically refresh a legacy slot into normalized identity when provider identity is fully known

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/switch.test.ts tests/provider-first-flow.test.ts`
Expected: FAIL because active-state logic still uses email.

- [ ] **Step 3: Write minimal implementation**

Use normalized current account identity in:

- active sequence sync
- switch early exit
- interactive active marker

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/switch.test.ts tests/provider-first-flow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/switch.test.ts tests/provider-first-flow.test.ts
git commit -m "fix: track active account by workspace-aware identity"
```

## Chunk 4: Surface Workspace Context in CLI Output

### Task 8: Update list and status display labels

**Files:**
- Modify: `src/index.ts`
- Test: `tests/provider-first-flow.test.ts`
- Test: `tests/status-output.test.ts`
- Test: `tests/status-json.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the failing test**

Add display expectations for:

- same email rows showing different organization names
- `status` showing active workspace context
- `status --json` policy decision, either unchanged or expanded

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/provider-first-flow.test.ts tests/status-output.test.ts tests/status-json.test.ts`
Expected: FAIL because display labels do not include workspace context.

- [ ] **Step 3: Write minimal implementation**

Update list/status rendering to use normalized display labels and clarify README examples.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/provider-first-flow.test.ts tests/status-output.test.ts tests/status-json.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts README.md tests/provider-first-flow.test.ts tests/status-output.test.ts tests/status-json.test.ts
git commit -m "feat: show workspace context in account output"
```

### Task 9: Preserve alias UX with same-email accounts

**Files:**
- Modify: `src/index.ts`
- Modify: `src/accounts.ts`
- Test: `tests/accounts.test.ts`
- Test: `tests/provider-first-flow.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests for:

- alias assignment to a same-email, different-workspace target
- helpful error messages when email alone is ambiguous

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/accounts.test.ts tests/provider-first-flow.test.ts`
Expected: FAIL because email-only targeting cannot disambiguate same-email rows.

- [ ] **Step 3: Write minimal implementation**

Require identity-aware or alias-based disambiguation whenever multiple managed accounts share the same email.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/accounts.test.ts tests/provider-first-flow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/accounts.ts src/index.ts tests/accounts.test.ts tests/provider-first-flow.test.ts
git commit -m "fix: disambiguate same-email accounts with aliases"
```

## Chunk 5: Full Verification

### Task 10: Run focused regression suites

**Files:**
- No code changes required unless failures appear

- [ ] **Step 1: Run focused suites**

Run:

```bash
bun test tests/accounts.test.ts tests/migration.test.ts tests/provider-adapter.test.ts tests/login-command.test.ts tests/login-registration.test.ts tests/codex-flow.test.ts tests/claude-workspace-identity.test.ts tests/switch.test.ts tests/provider-first-flow.test.ts tests/status-output.test.ts tests/status-json.test.ts
```

Expected: PASS

- [ ] **Step 2: Fix any failures**

If any suite fails, fix the smallest root cause and re-run the affected subset before repeating the full focused suite.

- [ ] **Step 3: Commit final stabilization changes**

```bash
git add src tests README.md
git commit -m "test: verify workspace-aware account identity flow"
```

### Task 11: Run full test suite

**Files:**
- No code changes required unless failures appear

- [ ] **Step 1: Run full suite**

Run: `bun test`
Expected: PASS

- [ ] **Step 2: Commit any final fixes**

```bash
git add src tests README.md
git commit -m "chore: finalize workspace-aware account identity"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-29-workspace-aware-account-identity.md`. Ready to execute?
