#!/usr/bin/env bun
// ABOUTME: Entry point for caflip CLI. Parses arguments and routes to command handlers.
// ABOUTME: Supports subcommands (list, add, remove, next, status, alias, help) and alias-based switching.

import { existsSync, mkdirSync } from "fs";
import {
  BACKUP_DIR,
  SEQUENCE_FILE,
  LOCK_DIR,
  CONFIGS_DIR,
  CREDENTIALS_DIR,
  getBackupDir,
  getSequenceFile,
  getLockDir,
  getConfigsDir,
  getCredentialsDir,
  RESERVED_COMMANDS,
} from "./config";
import {
  initSequenceFile,
  loadSequence,
  addAccountToSequence,
  removeAccountFromSequence,
  getNextInSequence,
  resolveAccountIdentifier,
  resolveAccountTarget,
  getDisplayAccountLabel,
  getPostRemovalAction,
  accountExists,
  resolveManagedAccount,
  resolveManagedAccountNumber,
  setAlias,
  findAccountByAlias,
  getManagedAccountLabel,
  type SequenceData,
} from "./accounts";
import { writeJsonAtomic, acquireLock, releaseLock } from "./files";
import { sanitizeEmailForFilename, validateAlias } from "./validation";
import pkg from "../package.json";
import {
  pickAccount,
  pickChoice,
  pickProvider,
  pickAccountForRemoval,
  confirmAction,
  PromptCancelledError,
} from "./interactive";
import { runLoginCommand } from "./login/runner";
import { parseProviderArgs, type ProviderName } from "./providers/types";
import { getProvider, type AccountProvider } from "./providers";
import type { ProviderCurrentAccount } from "./providers/types";
import { readCliMeta, writeLastProvider } from "./meta";
import { SUPPORTED_PROVIDERS } from "./providers/types";

const ADD_CURRENT_ACCOUNT_CHOICE = "__add_current_account__";
const INTERACTIVE_PROVIDER_COMMANDS = ["add", "remove", "login"] as const;
let activeBackupDir = BACKUP_DIR;
let activeSequenceFile = SEQUENCE_FILE;
let activeLockDir = LOCK_DIR;
let activeConfigsDir = CONFIGS_DIR;
let activeCredentialsDir = CREDENTIALS_DIR;
let activeProvider: AccountProvider = getProvider("claude");

type ProviderSelectionDeps = {
  readCliMeta: typeof readCliMeta;
  pickProvider: typeof pickProvider;
  writeLastProvider: typeof writeLastProvider;
};

type CliContext =
  | {
      mode: "interactive-switch";
      provider: ProviderName | null;
      args: string[];
      command: undefined;
    }
  | {
      mode: "all-providers";
      provider: null;
      args: string[];
      command: "list" | "status";
    }
  | {
      mode: "provider-command";
      provider: ProviderName;
      args: string[];
      command: string;
    };

type CliContextDeps = {
  resolveProviderForCommand: typeof resolveProviderForCommand;
};

function setActiveProvider(provider: ProviderName): void {
  activeBackupDir = getBackupDir(provider);
  activeSequenceFile = getSequenceFile(provider);
  activeLockDir = getLockDir(provider);
  activeConfigsDir = getConfigsDir(provider);
  activeCredentialsDir = getCredentialsDir(provider);
  activeProvider = getProvider(provider);
}

// Ensure backup directories exist.
function setupDirectories(): void {
  for (const dir of [activeBackupDir, activeConfigsDir, activeCredentialsDir]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function getCurrentAccountIdentity() {
  return activeProvider.getCurrentAccount();
}

// Read current account email from provider identity.
function getCurrentAccount(): string {
  return getCurrentAccountIdentity()?.email ?? "none";
}

function getProviderLabel(): string {
  return activeProvider.name === "codex" ? "Codex" : "Claude Code";
}

function hasMultipleProviderEmailMatches(
  seq: SequenceData,
  email: string,
  provider: ProviderName
): boolean {
  return Object.values(seq.accounts).filter((account) => {
    if (account.email !== email) {
      return false;
    }
    return !account.identity || account.identity.provider === provider;
  }).length > 1;
}

function resolveCurrentManagedAccountForSwitch(
  seq: SequenceData,
  currentIdentity: ProviderCurrentAccount | null,
  currentEmail: string
): string | null {
  if (currentIdentity) {
    const resolved = resolveManagedAccount(seq, currentIdentity);
    if (resolved) {
      return resolved;
    }
    const providerEmailMatchCount = Object.values(seq.accounts).filter((account) => {
      if (account.email !== currentIdentity.email) {
        return false;
      }
      return !account.identity || account.identity.provider === activeProvider.name;
    }).length;
    if (currentIdentity.identityStatus === "ambiguous") {
      throw new Error(
        `Cannot determine which managed account is currently active for ${currentIdentity.email}.`
      );
    }
    if (
      currentIdentity.email !== "none"
      && providerEmailMatchCount > 0
    ) {
      throw new Error(
        `Cannot determine which managed account is currently active for ${currentIdentity.email}.`
      );
    }
    return null;
  }

  if (currentEmail === "none") {
    return null;
  }

  return resolveAccountIdentifier(seq, currentEmail);
}

function getAccountDisplayLabel(account: {
  email: string;
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
}): string {
  return getManagedAccountLabel(account);
}

function getCurrentAccountDisplayLabel(currentAccount: ProviderCurrentAccount | null): string {
  if (!currentAccount) {
    return "none";
  }
  return getManagedAccountLabel({
    email: currentAccount.email,
    display: {
      email: currentAccount.email,
      accountName: currentAccount.accountName ?? null,
      organizationName: currentAccount.organizationName ?? null,
      planType: currentAccount.planType ?? null,
      role: currentAccount.role ?? null,
      label: "",
    },
    identity: {
      provider: activeProvider.name,
      accountId: currentAccount.accountId ?? null,
      organizationId: currentAccount.organizationId ?? null,
      uniqueKey: "",
    },
  });
}

function buildManagedAccountDetails(currentAccount: ProviderCurrentAccount | null) {
  if (!currentAccount) {
    return {
      email: "none",
      uuid: "",
      display: {
        email: "none",
        accountName: null,
        organizationName: null,
        planType: null,
        role: null,
        label: "none",
      },
      identity: undefined,
      providerMetadata: undefined,
    };
  }

  return {
    email: currentAccount.email,
    uuid: currentAccount.accountId ?? currentAccount.uniqueKey ?? "",
    display: {
      email: currentAccount.email,
      accountName: currentAccount.accountName ?? null,
      organizationName: currentAccount.organizationName ?? null,
      planType: currentAccount.planType ?? null,
      role: currentAccount.role ?? null,
      label: getCurrentAccountDisplayLabel(currentAccount),
    },
    identity: currentAccount.uniqueKey
      ? {
          provider: activeProvider.name,
          accountId: currentAccount.accountId ?? null,
          organizationId: currentAccount.organizationId ?? null,
          uniqueKey: currentAccount.uniqueKey,
        }
      : undefined,
    providerMetadata: {
      organizationName: currentAccount.organizationName ?? null,
      planType: currentAccount.planType ?? null,
      role: currentAccount.role ?? null,
      accountName: currentAccount.accountName ?? null,
    },
  };
}

function showProviderRequiredError(command: string): never {
  console.error(`Error: ${command} requires provider prefix.`);
  console.error(`Try: caflip claude ${command} or caflip codex ${command}`);
  process.exit(2);
}

export function supportsInteractiveProviderSelection(command?: string): boolean {
  return (INTERACTIVE_PROVIDER_COMMANDS as readonly string[]).includes(command ?? "");
}

export async function resolveProviderForCommand(
  provider: ProviderName | null,
  command: string | undefined,
  deps: ProviderSelectionDeps = {
    readCliMeta,
    pickProvider,
    writeLastProvider,
  }
): Promise<ProviderName | null> {
  if (provider || !supportsInteractiveProviderSelection(command)) {
    return provider;
  }

  const defaultProvider = deps.readCliMeta().lastProvider;
  const selectedProvider = await deps.pickProvider(defaultProvider);
  await deps.writeLastProvider(selectedProvider);
  return selectedProvider;
}

export async function resolveCliContext(
  parsed: ReturnType<typeof parseProviderArgs>,
  deps: CliContextDeps = { resolveProviderForCommand }
): Promise<CliContext> {
  let provider = parsed.provider;
  const args = parsed.commandArgs;
  const command = args[0];
  const isHelpCommand = command === "help" || command === "--help" || command === "-h";
  const isProviderOptionalReadOnlyCommand = command === "list" || command === "status";
  const supportsInteractiveProvider = supportsInteractiveProviderSelection(command);

  if (!parsed.isProviderQualified && command && !isHelpCommand && !isProviderOptionalReadOnlyCommand) {
    const isReservedCommand = (RESERVED_COMMANDS as readonly string[]).includes(command);
    if (!isReservedCommand) {
      console.error("Error: Alias requires provider prefix.");
      console.error("Try: caflip claude <alias> or caflip codex <alias>");
      process.exit(2);
    }
    if (!supportsInteractiveProvider) {
      showProviderRequiredError(command);
    }
  }

  if (!command) {
    return {
      mode: "interactive-switch",
      provider,
      args,
      command: undefined,
    };
  }

  if (isHelpCommand) {
    showHelp();
    process.exit(0);
  }

  if (!provider) {
    if (command === "list" || command === "status") {
      return {
        mode: "all-providers",
        provider: null,
        args,
        command,
      };
    }

    provider = await deps.resolveProviderForCommand(provider, command);
    if (!provider) {
      showProviderRequiredError(command);
    }
  }

  if (!provider) {
    throw new Error("Provider resolution failed");
  }

  return {
    mode: "provider-command",
    provider,
    args,
    command,
  };
}

type RegisterCurrentActiveAccountResult = {
  action: "added" | "updated" | "unchanged";
  accountNum: string;
  email: string;
};

async function syncSequenceActiveAccount(seq: SequenceData): Promise<SequenceData> {
  const resolvedActive = resolveManagedAccountNumber(seq, getCurrentAccountIdentity());
  if (seq.activeAccountNumber !== resolvedActive) {
    seq.activeAccountNumber = resolvedActive;
    seq.lastUpdated = new Date().toISOString();
    await writeJsonAtomic(activeSequenceFile, seq);
  }
  return seq;
}

async function registerCurrentActiveAccount(options?: {
  alias?: string;
  updateIfExists?: boolean;
  expectedEmail?: string;
}): Promise<RegisterCurrentActiveAccountResult> {
  const currentAccount = activeProvider.getCurrentAccount();
  const currentEmail = currentAccount?.email ?? "none";
  if (currentEmail === "none") {
    throw new Error(`No active ${getProviderLabel()} account found. Please log in first.`);
  }

  if (!sanitizeEmailForFilename(currentEmail)) {
    throw new Error("Current account email is not safe for storage");
  }
  if (options?.expectedEmail && currentEmail !== options.expectedEmail) {
    throw new Error(
      `Active ${getProviderLabel()} account changed during login verification: expected ${options.expectedEmail}, got ${currentEmail}`
    );
  }
  if (currentAccount?.identityStatus === "ambiguous") {
    throw new Error(
      `${getProviderLabel()} current account is in an ambiguous workspace context. Please pick a single workspace first, then retry.`
    );
  }

  setupDirectories();
  await initSequenceFile(activeSequenceFile);

  const seq = await loadSequence(activeSequenceFile);
  await syncSequenceActiveAccount(seq);
  const currentAccountNum = resolveManagedAccount(seq, currentAccount);
  const currentDetails = buildManagedAccountDetails(currentAccount);

  if (options?.alias) {
    const result = validateAlias(options.alias);
    if (!result.valid) {
      throw new Error(result.reason);
    }
    const existingAliasTarget = findAccountByAlias(seq, options.alias);
    if (existingAliasTarget && existingAliasTarget !== currentAccountNum) {
      throw new Error(`Alias "${options.alias}" is already in use`);
    }
  }

  const existingAccountNum = currentAccountNum;
  if (existingAccountNum) {
    if (!options?.updateIfExists) {
      console.log(`Account ${currentEmail} is already managed.`);
      return {
        action: "unchanged",
        accountNum: existingAccountNum,
        email: currentEmail,
      };
    }
  }

  const creds = await activeProvider.readActiveAuth();
  if (!creds) {
    throw new Error("No credentials found for current account");
  }

  const config = await activeProvider.readActiveConfig();
  let uuid = currentAccount?.accountId ?? "";
  if (activeProvider.usesAccountConfig && !config) {
    throw new Error("No config found for current account");
  }

  if (existingAccountNum) {
    const updatedSeq: SequenceData = {
      ...seq,
      activeAccountNumber: Number(existingAccountNum),
      lastUpdated: new Date().toISOString(),
      accounts: {
        ...seq.accounts,
        [existingAccountNum]: {
          ...seq.accounts[existingAccountNum],
          email: currentEmail,
          uuid,
          identity: currentDetails.identity ?? seq.accounts[existingAccountNum].identity,
          display: currentDetails.display,
          providerMetadata: currentDetails.providerMetadata ?? seq.accounts[existingAccountNum].providerMetadata,
          ...(options?.alias ? { alias: options.alias } : {}),
        },
      },
    };

    await activeProvider.writeAccountAuth(
      existingAccountNum,
      currentEmail,
      creds,
      activeCredentialsDir
    );
    if (config) {
      await activeProvider.writeAccountConfig(
        existingAccountNum,
        currentEmail,
        config,
        activeConfigsDir
      );
    }
    await writeJsonAtomic(activeSequenceFile, updatedSeq);

    return {
      action: "updated",
      accountNum: existingAccountNum,
      email: currentEmail,
    };
  }

  const updated = addAccountToSequence(seq, {
    email: currentEmail,
    uuid,
    alias: options?.alias,
    identity: currentDetails.identity,
    display: currentDetails.display,
    providerMetadata: currentDetails.providerMetadata,
  });

  const accountNum = String(updated.activeAccountNumber);
  await activeProvider.writeAccountAuth(
    accountNum,
    currentEmail,
    creds,
    activeCredentialsDir
  );
  if (config) {
    await activeProvider.writeAccountConfig(accountNum, currentEmail, config, activeConfigsDir);
  }
  await writeJsonAtomic(activeSequenceFile, updated);

  return {
    action: "added",
    accountNum,
    email: currentEmail,
  };
}

function getLoginPassthroughArgs(args: string[]): string[] {
  const passthroughIdx = args.indexOf("--");
  if (passthroughIdx === -1) {
    if (args.length > 0) {
      throw new Error("Provider login arguments must be passed after --");
    }
    return [];
  }
  if (passthroughIdx !== 0) {
    throw new Error("Provider login arguments must be passed after --");
  }
  return args.slice(passthroughIdx + 1);
}

// Perform the actual account switch.
export async function performSwitch(
  seq: SequenceData,
  targetAccount: string,
  options?: { currentEmail?: string }
): Promise<void> {
  const targetProvider = seq.accounts[targetAccount].identity?.provider;
  if (targetProvider) {
    setActiveProvider(targetProvider);
  }
  const providerName = targetProvider ?? activeProvider.name;
  const sequenceFile = getSequenceFile(providerName);
  const credentialsDir = getCredentialsDir(providerName);
  const configsDir = getConfigsDir(providerName);
  const targetEmail = seq.accounts[targetAccount].email;
  const observedCurrentIdentity = getCurrentAccountIdentity();
  const currentIdentity = options?.currentEmail
    && observedCurrentIdentity
    && observedCurrentIdentity.email !== options.currentEmail
      ? null
      : observedCurrentIdentity;
  const currentEmail = options?.currentEmail ?? currentIdentity?.email ?? "none";
  const currentAccount = resolveCurrentManagedAccountForSwitch(
    seq,
    currentIdentity,
    currentEmail
  );

  // Skip only when the real current logged-in account already matches target.
  if (currentAccount === targetAccount) {
    const account = seq.accounts[targetAccount];
    const aliasStr = account.alias ? ` [${account.alias}]` : "";
    const displayLabel = getDisplayAccountLabel(seq, targetAccount);
    if (seq.activeAccountNumber !== Number(targetAccount)) {
      seq.activeAccountNumber = Number(targetAccount);
      seq.lastUpdated = new Date().toISOString();
      await writeJsonAtomic(sequenceFile, seq);
    }
    console.log(`Already using ${displayLabel} (${account.email})${aliasStr}`);
    return;
  }

  if (!sanitizeEmailForFilename(targetEmail)) {
    throw new Error("Target account email is not safe for storage");
  }
  if (currentEmail !== "none" && !sanitizeEmailForFilename(currentEmail)) {
    throw new Error("Current account email is not safe for storage");
  }

  // Step 1: Backup current account
  if (currentEmail !== "none" && currentAccount) {
    const currentCreds = await activeProvider.readActiveAuth();

    if (currentCreds) {
      await activeProvider.writeAccountAuth(
        currentAccount,
        currentEmail,
        currentCreds,
        credentialsDir
      );
    }
    if (activeProvider.usesAccountConfig) {
      const currentConfig = await activeProvider.readActiveConfig();
      if (currentConfig) {
        await activeProvider.writeAccountConfig(
          currentAccount,
          currentEmail,
          currentConfig,
          configsDir
        );
      }
    }
  }

  // Step 2: Restore target account
  const targetCreds = await activeProvider.readAccountAuth(
    targetAccount,
    targetEmail,
    credentialsDir
  );
  const targetConfig = activeProvider.readAccountConfig(
    targetAccount,
    targetEmail,
    configsDir
  );

  if (!targetCreds) {
    throw new Error(
      `Missing backup data for ${getDisplayAccountLabel(seq, targetAccount)}`
    );
  }
  if (activeProvider.usesAccountConfig && !targetConfig) {
    throw new Error(
      `Missing backup data for ${getDisplayAccountLabel(seq, targetAccount)}`
    );
  }

  // Step 3: Write target credentials
  await activeProvider.writeActiveAuth(targetCreds);

  // Step 4: Provider-specific config restore
  if (targetConfig) {
    await activeProvider.writeActiveConfig(targetConfig);
  }

  // Step 5: Update sequence
  seq.activeAccountNumber = Number(targetAccount);
  seq.lastUpdated = new Date().toISOString();
  await writeJsonAtomic(sequenceFile, seq);

  const alias = seq.accounts[targetAccount].alias;
  const aliasStr = alias ? ` [${alias}]` : "";
  const displayLabel = getDisplayAccountLabel(seq, targetAccount);
  const refreshedAccount = activeProvider.getCurrentAccount();
  if (refreshedAccount) {
    const refreshedDetails = buildManagedAccountDetails(refreshedAccount);
    seq.accounts[targetAccount] = {
      ...seq.accounts[targetAccount],
      email: refreshedDetails.email,
      uuid: refreshedDetails.uuid,
      display: refreshedDetails.display,
      identity: refreshedDetails.identity ?? seq.accounts[targetAccount].identity,
      providerMetadata:
        refreshedDetails.providerMetadata ?? seq.accounts[targetAccount].providerMetadata,
    };
    await writeJsonAtomic(sequenceFile, seq);
  }
  console.log(`Switched to ${displayLabel} (${targetEmail})${aliasStr}`);
  console.log(`\nPlease restart ${getProviderLabel()} to use the new authentication.\n`);
}

// --- Command handlers ---

async function cmdList(): Promise<void> {
  const lines = await getManagedAccountLinesForActiveProvider();
  if (!lines) {
    const providerCmd = activeProvider.name === "codex" ? "caflip codex add" : "caflip claude add";
    console.log(`No accounts managed yet. Run: ${providerCmd}`);
    return;
  }

  console.log("Accounts:");
  for (const line of lines) {
    console.log(line);
  }
}

async function getManagedAccountLinesForActiveProvider(): Promise<string[] | null> {
  if (!existsSync(activeSequenceFile)) {
    return null;
  }

  const seq = await loadSequence(activeSequenceFile);
  await syncSequenceActiveAccount(seq);
  const currentAccount = getCurrentAccountIdentity();
  const activeAccountNum = resolveManagedAccount(seq, currentAccount);

  return seq.sequence.map((num, index) => {
    const numStr = String(num);
    const account = seq.accounts[numStr];
    if (!account) {
      throw new Error(`Corrupt sequence data: missing account entry for id ${numStr}`);
    }
    const isActive = activeAccountNum === numStr;
    let line = `  ${index + 1}: ${getAccountDisplayLabel(account)}`;
    if (account.alias) line += ` [${account.alias}]`;
    if (isActive) line += " (active)";
    return line;
  });
}

async function cmdAdd(alias?: string): Promise<void> {
  const result = await registerCurrentActiveAccount({ alias, updateIfExists: false });
  if (result.action === "unchanged") {
    return;
  }

  const seq = await loadSequence(activeSequenceFile);
  const displayLabel = getDisplayAccountLabel(seq, result.accountNum);
  const aliasStr = alias ? ` [${alias}]` : "";
  console.log(`Added ${displayLabel}: ${result.email}${aliasStr}`);
}

async function cmdLogin(args: string[]): Promise<void> {
  const passthroughArgs = getLoginPassthroughArgs(args);
  const loginCommand = activeProvider.login.buildCommand(passthroughArgs);
  const execution = await runLoginCommand(loginCommand);
  if (execution.exitCode !== 0) {
    throw new Error(`${getProviderLabel()} login failed`);
  }

  const verification = await activeProvider.login.verifyLogin();
  if (!verification.ok) {
    throw new Error(verification.reason);
  }

  const result = await registerCurrentActiveAccount({
    updateIfExists: true,
    expectedEmail: verification.email,
  });
  const seq = await loadSequence(activeSequenceFile);
  const displayLabel = getDisplayAccountLabel(seq, result.accountNum);
  const verb = result.action === "added" ? "Added" : "Updated";
  console.log(`${verb} ${displayLabel}: ${result.email}`);
}

function validateLoginArgs(args: string[]): void {
  getLoginPassthroughArgs(args);
}

async function cmdRemove(identifier?: string): Promise<void> {
  if (!existsSync(activeSequenceFile)) {
    throw new Error("No accounts managed yet");
  }

  const seq = await loadSequence(activeSequenceFile);
  await syncSequenceActiveAccount(seq);

  // If no identifier given, use interactive picker
  let accountNum: string;
  if (!identifier) {
    accountNum = await pickAccountForRemoval(seq);
  } else {
    if (/^\d+$/.test(identifier)) {
      throw new Error("Remove target must be an email, not a number");
    }
    const resolved = resolveAccountIdentifier(seq, identifier);
    if (!resolved) {
      throw new Error(`Account not found: ${identifier}`);
    }
    accountNum = resolved;
  }

  const account = seq.accounts[accountNum];
  if (!account) {
    throw new Error(`${getDisplayAccountLabel(seq, accountNum)} does not exist`);
  }

  if (seq.activeAccountNumber === Number(accountNum)) {
    console.log(
      `Warning: ${getDisplayAccountLabel(seq, accountNum)} (${account.email}) is currently active`
    );
  }

  const confirmed = await confirmAction(
    `Permanently remove ${getDisplayAccountLabel(seq, accountNum)} (${account.email})?`
  );
  if (!confirmed) {
    console.log("Cancelled");
    return;
  }

  const updated = removeAccountFromSequence(seq, accountNum);
  const action = getPostRemovalAction(seq, updated, accountNum);

  if (action.type === "switch") {
    await performSwitch(seq, action.targetAccountNumber);
  } else if (action.type === "logout") {
    await activeProvider.clearActiveAuth();
    await activeProvider.clearActiveConfig();
  }

  // Delete backup files
  await activeProvider.deleteAccountAuth(accountNum, account.email, activeCredentialsDir);
  activeProvider.deleteAccountConfig(accountNum, account.email, activeConfigsDir);

  // Update sequence
  await writeJsonAtomic(activeSequenceFile, updated);

  console.log(
    `${getDisplayAccountLabel(seq, accountNum)} (${account.email}) has been removed`
  );
}

async function cmdNext(): Promise<void> {
  if (!existsSync(activeSequenceFile)) {
    throw new Error("No accounts managed yet");
  }

  const seq = await loadSequence(activeSequenceFile);
  await syncSequenceActiveAccount(seq);

  if (seq.sequence.length < 2) {
    throw new Error("Need at least 2 accounts to rotate");
  }

  const nextNum = getNextInSequence(seq);
  await performSwitch(seq, String(nextNum));
}

async function cmdStatus(options?: { json?: boolean }): Promise<void> {
  const summary = await getStatusSummaryForActiveProvider();
  const jsonMode = options?.json ?? false;

  if (jsonMode) {
    console.log(
      JSON.stringify({
        provider: activeProvider.name,
        email: summary.email === "none" ? null : summary.email,
        label: summary.email === "none" ? null : summary.label,
        organizationName: summary.organizationName,
        alias: summary.alias,
        managed: summary.managed,
      })
    );
    return;
  }

  if (summary.email === "none") {
    console.log("none");
  } else if (summary.alias) {
    console.log(`${summary.label} [${summary.alias}]`);
  } else {
    console.log(summary.label);
  }
  console.log(`managed accounts: ${summary.managedCount}`);
}

async function getStatusSummaryForActiveProvider(): Promise<{
  email: string;
  alias: string | null;
  managed: boolean;
  managedCount: number;
  label: string;
  organizationName: string | null;
}> {
  const currentAccount = getCurrentAccountIdentity();
  const email = currentAccount?.email ?? "none";
  let alias: string | null = null;
  let managed = false;
  let managedCount = 0;
  let label = getCurrentAccountDisplayLabel(currentAccount);
  let organizationName = currentAccount?.organizationName ?? null;
  if (email !== "none" && existsSync(activeSequenceFile)) {
    const seq = await loadSequence(activeSequenceFile);
    managedCount = Object.keys(seq.accounts).length;
    const matchedAccountNum = resolveManagedAccount(seq, currentAccount);
    if (matchedAccountNum) {
      const account = seq.accounts[matchedAccountNum];
      managed = true;
      alias = account.alias ?? null;
      label = getAccountDisplayLabel(account);
      organizationName = account.display?.organizationName ?? organizationName;
    }
  } else if (existsSync(activeSequenceFile)) {
    const seq = await loadSequence(activeSequenceFile);
    managedCount = Object.keys(seq.accounts).length;
  }

  return { email, alias, managed, managedCount, label, organizationName };
}

async function withActiveProvider<T>(
  provider: ProviderName,
  fn: () => Promise<T>
): Promise<T> {
  const previousProvider = activeProvider.name;
  setActiveProvider(provider);
  try {
    return await fn();
  } finally {
    setActiveProvider(previousProvider);
  }
}

async function cmdListAllProviders(): Promise<void> {
  for (const [index, provider] of SUPPORTED_PROVIDERS.entries()) {
    const output = await withActiveProvider(provider, async () => {
      const heading = getProviderLabel();
      const lines = await getManagedAccountLinesForActiveProvider();
      if (!lines) {
        return {
          heading,
          lines: [`No accounts managed yet. Run: caflip ${provider} add`],
        };
      }
      return {
        heading,
        lines: ["Accounts:", ...lines.map((line) => line.slice(2))],
      };
    });

    if (index > 0) {
      console.log("");
    }
    console.log(output.heading);
    for (const line of output.lines) {
      console.log(`  ${line}`);
    }
  }
}

async function cmdStatusAllProviders(): Promise<void> {
  for (const [index, provider] of SUPPORTED_PROVIDERS.entries()) {
    const summary = await withActiveProvider(provider, async () => {
      return {
        heading: getProviderLabel(),
        ...(await getStatusSummaryForActiveProvider()),
      };
    });

    if (index > 0) {
      console.log("");
    }
    console.log(summary.heading);
    if (summary.email === "none") {
      console.log("  none");
    } else if (summary.alias) {
      console.log(`  ${summary.label} [${summary.alias}]`);
    } else {
      console.log(`  ${summary.label}`);
    }
    console.log(`  managed accounts: ${summary.managedCount}`);
  }
}

async function cmdAlias(alias: string, identifier?: string): Promise<void> {
  if (!existsSync(activeSequenceFile)) {
    throw new Error("No accounts managed yet");
  }

  const result = validateAlias(alias);
  if (!result.valid) {
    throw new Error(result.reason);
  }

  const seq = await loadSequence(activeSequenceFile);
  const currentEmail = getCurrentAccount();
  const currentIdentity = getCurrentAccountIdentity();
  let accountNum: string | null = null;

  if (identifier) {
    const target = resolveAccountTarget(seq, identifier);
    if (target.status === "ambiguous") {
      throw new Error(`Multiple managed accounts match ${identifier}. Use account number or alias.`);
    }
    if (target.status === "missing") {
      throw new Error(`Account not found: ${identifier}`);
    }
    accountNum = target.accountNum;
  } else {
    accountNum = resolveManagedAccount(seq, currentIdentity);
    if (!accountNum && currentIdentity?.email && currentIdentity.email !== "none") {
      if (hasMultipleProviderEmailMatches(seq, currentIdentity.email, activeProvider.name)) {
        throw new Error(
          `Multiple managed accounts match ${currentIdentity.email}. Use account number or alias.`
        );
      }
    }
  }

  if (!accountNum) {
    if (currentEmail === "none") {
      throw new Error(`No active ${getProviderLabel()} account found. Please log in first.`);
    }
    throw new Error(`Current account is not managed: ${currentEmail}`);
  }

  const updated = setAlias(seq, accountNum, alias);
  await writeJsonAtomic(activeSequenceFile, updated);

  const account = updated.accounts[accountNum];
  console.log(
    `Alias "${alias}" set for ${getDisplayAccountLabel(updated, accountNum)} (${account.email})`
  );
}

async function cmdInteractiveSwitch(): Promise<void> {
  const currentIdentity = getCurrentAccountIdentity();
  const currentEmail = currentIdentity?.email ?? "none";
  const currentLabel = getCurrentAccountDisplayLabel(currentIdentity);
  const hasSequence = existsSync(activeSequenceFile);
  const seq = hasSequence ? await loadSequence(activeSequenceFile) : null;
  if (seq) {
    await syncSequenceActiveAccount(seq);
  }

  if (!seq || seq.sequence.length === 0) {
    const emptyStateChoices = [
      {
        name: `+ Add current logged-in account${currentEmail === "none" ? "" : ` (${currentLabel})`}`,
        value: ADD_CURRENT_ACCOUNT_CHOICE,
      },
      { name: "Back", value: "__back__" },
    ];
    const selected = await pickChoice(
      `No managed ${getProviderLabel()} accounts yet`,
      emptyStateChoices
    );
    if (selected === "__back__") {
      return;
    }
    await cmdAdd();
    return;
  }

  const shouldOfferAddCurrent = currentEmail !== "none"
    && currentIdentity?.identityStatus !== "ambiguous"
    && !accountExists(
      seq,
      currentIdentity ?? currentEmail
    );
  const extraChoices = shouldOfferAddCurrent
    ? [{ name: `+ Add current logged-in account (${currentLabel})`, value: ADD_CURRENT_ACCOUNT_CHOICE }]
    : [];

  const selected = await pickAccount(
    seq,
    `caflip v${pkg.version} — Switch ${getProviderLabel()} account:`,
    undefined,
    extraChoices
  );
  if (selected === ADD_CURRENT_ACCOUNT_CHOICE) {
    await cmdAdd();
    return;
  }
  await performSwitch(seq, selected, { currentEmail });
}

function showHelp(): void {
  console.log(`caflip - Coding Agent Account Switch (Claude Code + Codex)

Usage:
  caflip
  caflip <claude|codex> [command]

Commands:
  (no args)                            Interactive provider picker
  list                                 List managed accounts for all providers
  status                               Show current active account for all providers
  add [--alias <name>]                 Pick provider, then add current account
  login [-- <args...>]                 Pick provider, then run provider login
  remove [<email>]                     Pick provider, then remove an account
  <provider>                           Interactive account picker for provider
  <provider> <alias>                   Switch by alias for provider
  <provider> list                      List all managed accounts
  <provider> add [--alias <name>]      Add current account
  <provider> login [-- <args...>]      Run provider login and register session
  <provider> remove [<email>]          Remove an account
  <provider> next                      Rotate to next account
  <provider> status [--json]           Show current active account
  <provider> alias <name> [<account>]  Set alias for current or target account
  help                                 Show this help

Examples:
  caflip                               Pick provider interactively
  caflip list                          List managed accounts for Claude and Codex
  caflip status                        Show current active account for Claude and Codex
  caflip add                           Pick provider, then add current account
  caflip login                         Pick provider, then run provider login
  caflip remove                        Pick provider, then remove an account interactively
  caflip claude                        Pick Claude account interactively
  caflip claude work                   Switch Claude account by alias
  caflip claude add --alias personal   Add current Claude account with alias
  caflip claude alias work             Alias the current Claude account as "work"
  caflip claude alias work 2           Alias Claude Account-2 as "work"
  caflip claude login                  Run Claude login and register session
  caflip claude login -- --email me@example.com --sso
                                       Pass provider-specific flags after --
  caflip claude status --json          Show Claude status as JSON
  caflip codex list                    List managed Codex accounts
  caflip codex login -- --device-auth  Run Codex login and register session
  caflip codex add --alias work        Add current Codex account with alias
  caflip codex alias work 2
                                       Set Codex alias for target account

Alias targets:
  <account> can be a list number, an existing alias, or an email when it matches exactly one managed account.
  Codex labels show workspace plans as email · plan(orgShortId); free shows email · free.`);
}

async function executeProviderCommand(
  command: string,
  args: string[],
  provider: ProviderName,
  runWithLock: <T>(fn: () => Promise<T>) => Promise<T>
): Promise<void> {
  switch (command) {
    case "list":
      await cmdList();
      break;

    case "add": {
      await runWithLock(async () => {
        let alias: string | undefined;
        const aliasIdx = args.indexOf("--alias");
        if (aliasIdx !== -1 && args[aliasIdx + 1]) {
          alias = args[aliasIdx + 1];
        }
        await cmdAdd(alias);
      });
      break;
    }

    case "remove": {
      await runWithLock(async () => {
        await cmdRemove(args[1]);
      });
      break;
    }

    case "next": {
      await runWithLock(async () => {
        await cmdNext();
      });
      break;
    }

    case "login": {
      validateLoginArgs(args.slice(1));
      await runWithLock(async () => {
        await cmdLogin(args.slice(1));
      });
      break;
    }

    case "status":
      await cmdStatus({ json: args.includes("--json") });
      break;

    case "alias": {
      if (!args[1]) {
        console.error(`Usage: caflip ${provider} alias <name> [<account>]`);
        process.exit(1);
      }
      await runWithLock(async () => {
        await cmdAlias(args[1], args[2]);
      });
      break;
    }

    default: {
      if (existsSync(activeSequenceFile)) {
        const seq = await loadSequence(activeSequenceFile);
        const accountNum = findAccountByAlias(seq, command);
        if (accountNum) {
          await runWithLock(async () => {
            await performSwitch(seq, accountNum);
          });
          return;
        }
      }

      console.error(`Error: Unknown command "${command}"`);
      showHelp();
      process.exit(1);
    }
  }
}

// --- Main ---

async function main(): Promise<void> {
  const context = await resolveCliContext(parseProviderArgs(process.argv.slice(2)));
  let lockHeld = false;

  const runWithLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    setupDirectories();
    acquireLock(activeLockDir);
    lockHeld = true;
    try {
      return await fn();
    } finally {
      if (lockHeld) {
        releaseLock(activeLockDir);
        lockHeld = false;
      }
    }
  };
  const runWithProviderLock = async <T>(
    targetProvider: ProviderName,
    fn: () => Promise<T>
  ): Promise<T> => {
    setActiveProvider(targetProvider);
    return await runWithLock(fn);
  };

  if (context.mode === "interactive-switch") {
    if (!context.provider) {
      const defaultProvider = readCliMeta().lastProvider;
      const selectedProvider = await pickProvider(defaultProvider);
      await writeLastProvider(selectedProvider);
      await runWithProviderLock(selectedProvider, async () => {
        await cmdInteractiveSwitch();
      });
      return;
    }
    await runWithProviderLock(context.provider, async () => {
      await cmdInteractiveSwitch();
    });
    return;
  }

  if (context.mode === "all-providers") {
    if (context.command === "list") {
      await cmdListAllProviders();
      return;
    }
    if (context.command === "status") {
      if (context.args.includes("--json")) {
        console.error("Error: Provider is required for status --json.");
        console.error("Try: caflip claude status --json");
        process.exit(2);
      }
      await cmdStatusAllProviders();
      return;
    }
  }
  const provider = context.provider;
  const args = context.args;
  const command = context.command;
  setActiveProvider(provider);
  await executeProviderCommand(command, args, provider, runWithLock);
}

if (import.meta.main) {
  main().catch((err) => {
    if (err instanceof PromptCancelledError) {
      console.log("Cancelled");
      process.exit(0);
    }
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
