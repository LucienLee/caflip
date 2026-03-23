# Provider Login Implementation Plan

Date: 2026-03-22
Status: Ready for implementation
Depends on: `docs/superpowers/specs/2026-03-22-provider-login-design.md`

## Goal

Implement a unified `caflip <provider> login` interface for `claude` and `codex`, using the official provider CLIs for authentication and reusing caflip's storage model to register or refresh the resulting active session.

## Constraints

- do not reimplement provider login flows
- do not parse provider login flags natively
- preserve existing non-login behavior
- keep provider verification logic provider-specific
- do not mutate caflip state when login or verification fails

## Implementation Sequence

### Task 1: Introduce login orchestration types and runner

Files:

- create `src/login/types.ts`
- create `src/login/runner.ts`
- create `tests/login-runner.test.ts`

Work:

- define a provider login adapter contract
- support command construction from provider name plus passthrough args
- run subprocess with inherited stdio
- return structured exit status

Acceptance:

- command build tests for Claude and Codex pass
- subprocess failure path is represented without provider-specific branching in the runner

### Task 2: Add provider login adapter metadata

Files:

- modify `src/providers/claude.ts`
- modify `src/providers/codex.ts`
- modify provider typing if needed
- create or update `tests/provider-adapter.test.ts`

Work:

- expose provider login metadata:
  - command builder
  - verifier
- Claude verifier runs `claude auth status --json`
- Codex verifier runs `codex login status` and checks current account readability

Acceptance:

- providers expose enough metadata for `cmdLogin()` without hardcoding provider logic inside `src/index.ts`

### Task 3: Extract shared registration helper from `cmdAdd()`

Files:

- modify `src/index.ts`
- create `tests/login-registration.test.ts`
- update any affected existing tests

Work:

- extract `registerCurrentActiveAccount()`
- preserve current `cmdAdd()` behavior for new accounts
- add `updateIfExists` support
- ensure existing-account refresh updates backups instead of returning early when requested

Acceptance:

- `cmdAdd()` still behaves as before
- login-oriented registration can refresh an existing account

### Task 4: Add `login` command routing

Files:

- modify `src/index.ts`
- create `tests/login-command.test.ts`

Work:

- add `login` command to help output
- parse passthrough args using `--`
- route provider-qualified `login`
- keep lock behavior consistent with other state-mutating commands

Acceptance:

- `caflip claude login -- ...` routes correctly
- `caflip codex login -- ...` routes correctly
- commands without `--` still work when no passthrough args are needed

### Task 5: Implement Claude login flow

Files:

- modify `src/index.ts`
- modify `src/providers/claude.ts`
- update tests in `tests/login-command.test.ts` and `tests/login-registration.test.ts`

Work:

- run `claude auth login`
- verify with `claude auth status --json`
- require `loggedIn: true` and `email`
- register current active session with `updateIfExists: true`

Acceptance:

- successful Claude login adds or updates managed account data
- failed verification leaves caflip state unchanged

### Task 6: Implement Codex login flow

Files:

- modify `src/index.ts`
- modify `src/providers/codex.ts`
- update tests in `tests/login-command.test.ts` and `tests/login-registration.test.ts`

Work:

- run `codex login`
- verify with `codex login status`
- require caflip's Codex current-account reader to resolve an email
- register current active session with `updateIfExists: true`

Acceptance:

- successful Codex login adds or updates managed account data
- failed verification leaves caflip state unchanged

### Task 7: Documentation and regression sweep

Files:

- modify `README.md`
- update or add targeted docs if needed

Work:

- document the unified `login` interface
- explain passthrough via `--`
- note that successful login refreshes existing accounts
- note that newly logged-in account remains active

Acceptance:

- README examples match actual CLI behavior
- focused regression tests still pass

## Test Plan

Run at minimum:

```bash
bun test tests/login-runner.test.ts
bun test tests/login-command.test.ts
bun test tests/login-registration.test.ts
bun test tests/provider-adapter.test.ts
bun test tests/status-json.test.ts
bun test
```

Where real provider login is not suitable for automated tests, use fakes or injected command runners instead of invoking live interactive auth.

## Notes for Implementation

- keep login verification out of `cmdAdd()`
- keep provider verification logic close to provider adapters
- avoid making `src/index.ts` responsible for provider-specific status parsing
- preserve alias behavior for existing commands
- if login lands on an existing managed account, refresh auth/config backup without changing its alias unless explicitly designed later

## Deliverables

- unified `login` command for both providers
- shared registration helper reused by `add` and `login`
- provider-specific login verification
- tests covering success, refresh, and failure behavior
- README updates
