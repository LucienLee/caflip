// ABOUTME: Core accounts module managing sequence.json for multi-account CRUD operations.
// ABOUTME: Handles account addition, removal, sequence rotation, identifier resolution, and aliases.
import { existsSync, readFileSync } from "fs";
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

export type PostRemovalAction =
  | { type: "none" }
  | { type: "switch"; targetAccountNumber: string }
  | { type: "logout" };

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
  return JSON.parse(readFileSync(path, "utf-8")) as SequenceData;
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

  // Search by email
  for (const [num, account] of Object.entries(seq.accounts)) {
    if (account.email === identifier) return num;
  }

  return null;
}

export function resolveAliasTargetAccount(
  seq: SequenceData,
  options: { identifier?: string; currentEmail?: string }
): string | null {
  if (options.identifier) {
    if (/^\d+$/.test(options.identifier)) {
      return null;
    }
    for (const [num, account] of Object.entries(seq.accounts)) {
      if (account.email === options.identifier) return num;
    }
    return null;
  }
  if (!options.currentEmail || options.currentEmail === "none") {
    return null;
  }
  return resolveAccountIdentifier(seq, options.currentEmail);
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
