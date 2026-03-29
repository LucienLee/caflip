// ABOUTME: Core accounts module managing sequence.json for multi-account CRUD operations.
// ABOUTME: Handles account addition, removal, sequence rotation, identifier resolution, and aliases.
import { existsSync, readFileSync } from "fs";
import { writeJsonAtomic } from "./files";

export interface Account {
  email: string;
  uuid: string;
  added: string;
  alias?: string;
  display?: {
    email: string;
    accountName?: string | null;
    organizationName?: string | null;
    planType?: string | null;
    role?: string | null;
    label: string;
  };
  identity?: {
    provider: "claude" | "codex";
    accountId: string | null;
    organizationId: string | null;
    uniqueKey: string;
  };
  providerMetadata?: Record<string, unknown>;
  legacyUuid?: string;
}

export interface ManagedAccountLookup {
  provider?: "claude" | "codex";
  email: string;
  accountId?: string;
  organizationId?: string;
  uniqueKey?: string;
}

export type AccountTargetResolution =
  | { status: "resolved"; accountNum: string }
  | { status: "ambiguous"; matches: string[] }
  | { status: "missing" };

export interface SequenceData {
  activeAccountNumber: number | null;
  lastUpdated: string;
  sequence: number[];
  accounts: Record<string, Account>;
}

export type PostRemovalAction =
  | { type: "none" }
  | { type: "switch"; targetAccountNumber: string }
  | { type: "logout" };

function getShortOrganizationId(organizationId: string): string {
  return organizationId.slice(0, 10);
}

function normalizeClaudeOrganizationName(email: string, organizationName: string | null | undefined): string | null {
  if (!organizationName) {
    return null;
  }

  if (organizationName === `${email}'s Organization`) {
    return "Personal";
  }

  return organizationName;
}

export function getManagedAccountLabel(account: Pick<Account, "email" | "display" | "identity">): string {
  const provider = account.identity?.provider;
  const organizationId = account.identity?.organizationId;
  const organizationName =
    provider === "claude"
      ? normalizeClaudeOrganizationName(account.email, account.display?.organizationName)
      : account.display?.organizationName;
  const planType = account.display?.planType;

  if (provider === "codex") {
    if (planType === "free") {
      return `${account.email} · free`;
    }
    const orgShortId = organizationId ? getShortOrganizationId(organizationId) : null;
    if (planType && orgShortId) {
      return `${account.email} · ${planType}(${orgShortId})`;
    }
    if (orgShortId) {
      return `${account.email} · ${orgShortId}`;
    }
    if (planType) {
      return `${account.email} · ${planType}`;
    }
  }

  if (organizationName) {
    return `${account.email} · ${organizationName}`;
  }

  return account.email;
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
  const raw = JSON.parse(readFileSync(path, "utf-8")) as SequenceData;
  const accounts = Object.fromEntries(
    Object.entries(raw.accounts).map(([num, account]) => {
      const display = account.display ?? {
        email: account.email,
        accountName: null,
        organizationName: null,
        planType: null,
        role: null,
        label: account.email,
      };
      display.label = getManagedAccountLabel({
        email: account.email,
        display,
        identity: account.identity,
      });
      return [
        num,
        {
          ...account,
          display,
          legacyUuid: account.legacyUuid ?? (account.identity ? undefined : account.uuid),
        },
      ];
    })
  );
  return {
    ...raw,
    accounts,
  };
}

export function getNextAccountNumber(seq: SequenceData): number {
  const keys = Object.keys(seq.accounts).map(Number);
  if (keys.length === 0) return 1;
  return Math.max(...keys) + 1;
}

export function accountExists(
  seq: SequenceData,
  identifier: string | ManagedAccountLookup
): boolean {
  if (typeof identifier === "string") {
    return Object.values(seq.accounts).some((a) => a.email === identifier);
  }

  return resolveManagedAccount(seq, identifier) !== null;
}

export function addAccountToSequence(
  seq: SequenceData,
  info: {
    email: string;
    uuid: string;
    alias?: string;
    display?: Account["display"];
    identity?: Account["identity"];
    providerMetadata?: Account["providerMetadata"];
  }
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
  if (info.display) {
    account.display = info.display;
  }
  if (info.identity) {
    account.identity = info.identity;
  }
  if (info.providerMetadata) {
    account.providerMetadata = info.providerMetadata;
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
  const remainingSequence = seq.sequence.filter((n) => n !== numValue);
  let nextActive = seq.activeAccountNumber;
  if (remainingSequence.length === 0) {
    nextActive = null;
  } else if (seq.activeAccountNumber === numValue) {
    nextActive = remainingSequence[0];
  }
  return {
    ...seq,
    accounts: remainingAccounts,
    sequence: remainingSequence,
    activeAccountNumber: nextActive,
    lastUpdated: new Date().toISOString(),
  };
}

export function getPostRemovalAction(
  original: SequenceData,
  updated: SequenceData,
  removedAccountNum: string
): PostRemovalAction {
  const removedNum = Number(removedAccountNum);
  if (original.activeAccountNumber !== removedNum) {
    return { type: "none" };
  }

  if (updated.activeAccountNumber === null) {
    return { type: "logout" };
  }

  return {
    type: "switch",
    targetAccountNumber: String(updated.activeAccountNumber),
  };
}

export function resolveManagedAccountNumberForEmail(
  seq: SequenceData,
  currentEmail: string
): number | null {
  if (!currentEmail || currentEmail === "none") {
    return null;
  }
  const accountNum = resolveAccountIdentifier(seq, currentEmail);
  if (!accountNum) {
    return null;
  }
  return Number(accountNum);
}

export function resolveManagedAccountNumber(
  seq: SequenceData,
  currentAccount: ManagedAccountLookup | null
): number | null {
  const resolved = resolveManagedAccount(seq, currentAccount);
  return resolved === null ? null : Number(resolved);
}

export function resolveManagedAccount(
  seq: SequenceData,
  currentAccount: ManagedAccountLookup | null
): string | null {
  if (!currentAccount?.email || currentAccount.email === "none") {
    return null;
  }

  if (currentAccount.uniqueKey) {
    for (const [accountNum, account] of Object.entries(seq.accounts)) {
      if (account.identity?.uniqueKey === currentAccount.uniqueKey) {
        return accountNum;
      }
    }
  }

  const emailMatches = Object.entries(seq.accounts).filter(([, account]) => {
    if (account.email !== currentAccount.email) {
      return false;
    }
    if (!currentAccount.provider) {
      return true;
    }
    return !account.identity || account.identity.provider === currentAccount.provider;
  });
  if (emailMatches.length !== 1) {
    return null;
  }

  const [accountNum, account] = emailMatches[0];
  return account.identity ? null : accountNum;
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
    if (seq.accounts[identifier]) {
      return identifier;
    }
    const uiIndex = Number(identifier) - 1;
    if (uiIndex >= 0 && uiIndex < seq.sequence.length) {
      return String(seq.sequence[uiIndex]);
    }
    return null;
  }

  const emailMatches = Object.entries(seq.accounts).filter(
    ([, account]) => account.email === identifier
  );
  if (emailMatches.length === 1) {
    return emailMatches[0][0];
  }

  return null;
}

export function resolveAliasTargetAccount(
  seq: SequenceData,
  options: { identifier?: string; currentEmail?: string }
): string | null {
  if (options.identifier) {
    const target = resolveAccountTarget(seq, options.identifier);
    return target.status === "resolved" ? target.accountNum : null;
  }
  if (!options.currentEmail || options.currentEmail === "none") {
    return null;
  }
  return resolveAccountIdentifier(seq, options.currentEmail);
}

export function resolveAccountTarget(
  seq: SequenceData,
  identifier: string
): AccountTargetResolution {
  if (/^\d+$/.test(identifier)) {
    const resolved = resolveAccountIdentifier(seq, identifier);
    return resolved ? { status: "resolved", accountNum: resolved } : { status: "missing" };
  }

  const aliasMatch = findAccountByAlias(seq, identifier);
  if (aliasMatch) {
    return { status: "resolved", accountNum: aliasMatch };
  }

  const emailMatches = Object.entries(seq.accounts)
    .filter(([, account]) => account.email === identifier)
    .map(([accountNum]) => accountNum);
  if (emailMatches.length === 1) {
    return { status: "resolved", accountNum: emailMatches[0] };
  }
  if (emailMatches.length > 1) {
    return { status: "ambiguous", matches: emailMatches };
  }

  return { status: "missing" };
}

export function getDisplayAccountNumber(
  seq: SequenceData,
  accountNum: string | number
): number | null {
  const idx = seq.sequence.indexOf(Number(accountNum));
  return idx === -1 ? null : idx + 1;
}

export function getDisplayAccountLabel(
  seq: SequenceData,
  accountNum: string | number
): string {
  const displayNum = getDisplayAccountNumber(seq, accountNum);
  if (displayNum === null) {
    return `Account-${String(accountNum)}`;
  }
  return `Account-${displayNum}`;
}

export function setAlias(
  seq: SequenceData,
  accountNum: string,
  alias: string
): SequenceData {
  // Check for duplicate alias
  for (const [num, account] of Object.entries(seq.accounts)) {
    if (num !== accountNum && account.alias === alias) {
      const displayLabel = getDisplayAccountLabel(seq, num);
      throw new Error(
        `Alias "${alias}" is already in use by ${displayLabel} (${account.email})`
      );
    }
  }

  const account = seq.accounts[accountNum];
  if (!account) {
    throw new Error(`${getDisplayAccountLabel(seq, accountNum)} does not exist`);
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
