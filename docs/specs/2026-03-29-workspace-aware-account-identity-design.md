# Workspace-Aware Account Identity Design

**Problem**

`caflip` currently treats `email` as the identity key for managed accounts. That breaks down when the same human user can log into multiple teams, organizations, or workspaces under the same email. In that case, a later login can overwrite an earlier managed account entry even though the user expects both contexts to remain switchable.

**Goal**

Support multiple managed accounts that share the same email but belong to different Claude organizations or Codex organizations/workspaces, while keeping account switching, listing, aliasing, and status output understandable.

## Current Constraints

- The current `Account` shape in [src/accounts.ts](/Users/lucien/Projects/caflip/src/accounts.ts) stores `email`, `uuid`, `added`, and optional `alias`.
- Matching logic in the account registry is email-based.
- Provider adapters expose only `{ email, accountId? }` as the current active account identity.
- Backup filenames currently key off `accountNum` and `email`, not provider identity metadata.

## Observed Provider Identity Signals

### Claude

From local `~/.claude.json > oauthAccount` and existing provider code:

- `accountUuid`
- `organizationUuid`
- `organizationName`
- `organizationRole`
- `workspaceRole`
- `displayName`
- `emailAddress`

From `claude auth status --json`:

- `email`
- `orgId`
- `orgName`
- `subscriptionType`

Interpretation:

- `accountUuid` appears to identify the user/account layer.
- `organizationUuid` / `orgId` identifies the workspace or organization layer.
- Public evidence does not guarantee whether `accountUuid` is stable across orgs, so the safe key is `accountUuid + organizationUuid`.

### Codex

From `~/.codex/auth.json > tokens.id_token` payload:

- `email`
- `https://api.openai.com/auth.chatgpt_account_id`
- `https://api.openai.com/auth.chatgpt_plan_type`
- `https://api.openai.com/auth.organizations[]`
  - `id`
  - `title`
  - `role`
  - `is_default`

Interpretation:

- `chatgpt_account_id` appears to identify the account layer.
- `organizations[].id` identifies the organization/workspace layer.
- Public evidence does not guarantee whether `chatgpt_account_id` alone is unique across organizations, so the safe key is `chatgpt_account_id + organization.id`.

## Recommended Identity Model

Replace email-based managed account identity with a normalized provider-aware model.

```ts
type ManagedAccountIdentity = {
  provider: "claude" | "codex";
  accountId: string | null;
  organizationId: string | null;
  uniqueKey: string;
};

type ManagedAccountDisplay = {
  email: string;
  accountName: string | null;
  organizationName: string | null;
  planType: string | null;
  role: string | null;
  label: string;
};

type ManagedAccount = {
  added: string;
  alias?: string;
  identity?: ManagedAccountIdentity;
  display: ManagedAccountDisplay;
  providerMetadata?: Record<string, unknown>;
  legacyUuid?: string;
};
```

Identity is optional during migration so legacy records remain readable before they are refreshed into normalized form.

### Unique Key Rules

- Claude: `claude:${accountUuid}:${organizationUuid}`
- Codex: `codex:${chatgpt_account_id}:${organization.id}`

If one component is missing, the provider should refuse to silently collapse to email for login registration. Missing identity is acceptable only for legacy records during migration.

## Provider Extraction Rules

### Claude normalized extraction

Primary source:

- `oauthAccount.accountUuid`
- `oauthAccount.organizationUuid`
- `oauthAccount.organizationName`
- `oauthAccount.organizationRole`
- `oauthAccount.workspaceRole`
- `oauthAccount.displayName`
- `oauthAccount.emailAddress`

Secondary source:

- `claude auth status --json`
  - `orgId`
  - `orgName`
  - `subscriptionType`

Normalization rules:

- `identity.accountId = accountUuid`
- `identity.organizationId = organizationUuid ?? orgId ?? null`
- `display.email = emailAddress`
- `display.organizationName = organizationName ?? orgName ?? null`
- `display.planType = subscriptionType ?? null`
- `display.role = workspaceRole ?? organizationRole ?? null`

### Codex normalized extraction

Primary source:

- `tokens.id_token`
- payload `https://api.openai.com/auth`

Normalization rules:

- `identity.accountId = chatgpt_account_id ?? tokens.account_id ?? null`
- Choose one active organization:
  - first choice: `is_default === true`
  - second choice: single-item `organizations[]`
  - otherwise: treat as ambiguous and do not silently guess during registration
- `identity.organizationId = organization.id`
- `display.email = email`
- `display.organizationName = organization.title ?? null`
- `display.planType = chatgpt_plan_type ?? null`
- `display.role = organization.role ?? null`

## Matching and Active Account Resolution

All managed-account matching should move from `email` to `identity.uniqueKey`.

Affected flows:

- login registration
- add current account
- active account sync
- status managed/unmanaged detection
- interactive picker active marker
- switch short-circuit detection
- alias default-target resolution

Email remains a display field and a human-facing targeting convenience, but not the canonical identity.

## CLI and UI Display Rules

### `status`

`status` should continue to show the active account, but now include workspace context.

Example:

```text
lucien@aibor.io · Aibor [work]
managed accounts: 3
```

### `list`

Each managed row should include workspace context so same-email rows are distinguishable.

Example:

```text
1: lucien@aibor.io · Personal
2: lucien@aibor.io · Aibor [work] (active)
3: lucien@aibor.io · Sandbox
```

### Account labels

Preferred label order:

1. `email · organizationName`
2. `email · organizationId`
3. `email`

## Migration Strategy

Existing `sequence.json` files are email-based and must remain usable.

Migration approach is **lazy migration**, not eager full-file rewrite.

### Migration States

Managed accounts can exist in three states:

1. `legacy`
   - old record loaded from disk
   - has email and optional old `uuid`
   - lacks normalized `identity.uniqueKey`
2. `normalized`
   - has full provider-aware identity
   - participates in canonical matching
3. `ambiguous`
   - live provider data exists but organization/workspace cannot be uniquely selected
   - registration must fail explicitly instead of guessing

### Read Path

On load:

1. Load legacy records as-is.
2. Convert old entries into the new shape where possible:
   - move old `uuid` into `legacyUuid`
   - synthesize `display.email`
3. Mark legacy entries as lacking normalized identity if provider metadata is unavailable.
4. Do not immediately rewrite the file just because it was read.

### Write Path

Only these flows should upgrade records on disk:

- `login`
- `add`
- successful switch when the active provider identity can be read confidently

On next successful `add` or `login`, refresh that entry into the normalized provider-aware form.

Migration should not delete or reorder existing accounts.

### Matching During Migration

Matching rules during the transition:

1. First try `identity.uniqueKey`
2. If no normalized match exists, allow legacy fallback only when:
   - provider matches
   - email matches
   - there is exactly one candidate
3. If multiple candidates share the same email and normalized identity is unavailable, treat the result as ambiguous
4. When ambiguous, do not auto-merge or auto-refresh the wrong record

### Conflict Policy

If a new login has the same email as an existing legacy record but a different workspace/org cannot be ruled out:

- create a new managed slot
- preserve the old legacy slot
- upgrade each slot only when its live identity becomes known

When unsure, prefer duplicate records over destructive merges.

## Backup Storage Compatibility

Current auth/config backup filenames can remain `accountNum + email` for the first version. The primary problem is managed identity, not filesystem naming.

This keeps migration smaller:

- no immediate mass-rename of backup files
- no provider-specific path churn
- account selection still resolves to the correct numeric slot

If backup filenames ever need to become identity-based, that should be a second migration.

Keeping backup filenames stable is intentional so migration scope stays focused on registry identity and CLI behavior.

## Error Handling

### Claude

- If `accountUuid` or organization identity is missing after successful login, fail registration with a clear error.
- Do not silently fold the entry into an email-based slot.

### Codex

- If multiple organizations exist and no active/default organization can be determined, fail registration with a clear error describing the ambiguity.
- Do not silently pick the first organization in a multi-org list.

## Testing Scope

Required regression coverage:

- same email, different workspace/org creates two managed accounts
- same email, same workspace/org refreshes the existing managed account
- status marks the correct active account using normalized identity
- list differentiates same-email rows by organization name
- alias resolution still works when multiple rows share the same email
- legacy `sequence.json` loads without data loss
- legacy account refresh upgrades to normalized identity
- same-email login does not overwrite a legacy record when workspace identity is uncertain
- migration fallback only merges when there is exactly one legacy candidate
- Codex ambiguous organizations path fails explicitly

## Recommended Execution Order

1. Extend provider contracts to expose normalized identity/display metadata.
2. Introduce the new account schema plus legacy migration loader.
3. Replace email-based matching with identity-based matching.
4. Update status/list/interactive display to surface workspace context.
5. Add provider-specific regression tests for same-email multi-workspace scenarios.

## Recommendation

Do not attempt a narrow patch that only swaps the comparison key. The requirement changes the account model itself. The correct smallest durable change is:

- add normalized provider identity
- migrate matching to `uniqueKey`
- keep backup file naming unchanged for now
- expose workspace/org names in CLI output so users can actually tell accounts apart
