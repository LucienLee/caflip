#!/usr/bin/env bun
// ABOUTME: Entry point for caflip CLI. Parses arguments and routes to command handlers.
// ABOUTME: Supports subcommands (list, add, remove, next, status, alias, help) and alias-based switching.

import { existsSync, readFileSync, mkdirSync } from "fs";
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
  getClaudeConfigPath,
} from "./config";
import {
  initSequenceFile,
  loadSequence,
  addAccountToSequence,
  removeAccountFromSequence,
  getNextInSequence,
  resolveAccountIdentifier,
  resolveManagedAccountNumberForEmail,
  resolveAliasTargetAccount,
  getDisplayAccountLabel,
  getPostRemovalAction,
  accountExists,
  setAlias,
  findAccountByAlias,
  type SequenceData,
} from "./accounts";
import { writeJsonAtomic, acquireLock, releaseLock } from "./files";
import { sanitizeEmailForFilename, validateAlias } from "./validation";
import pkg from "../package.json";
import {
  pickAccount,
  pickAccountForRemoval,
  confirmAction,
  PromptCancelledError,
} from "./interactive";
import { parseProviderArgs } from "./providers/types";
import { getProvider, type AccountProvider } from "./providers";

const ADD_CURRENT_ACCOUNT_CHOICE = "__add_current_account__";
let activeBackupDir = BACKUP_DIR;
let activeSequenceFile = SEQUENCE_FILE;
let activeLockDir = LOCK_DIR;
let activeConfigsDir = CONFIGS_DIR;
let activeCredentialsDir = CREDENTIALS_DIR;
let activeProvider: AccountProvider = getProvider("claude");

// Ensure backup directories exist.
function setupDirectories(): void {
  for (const dir of [activeBackupDir, activeConfigsDir, activeCredentialsDir]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

// Read current account email from Claude config.
function getCurrentAccount(): string {
  return activeProvider.getCurrentAccountEmail();
}

function getProviderLabel(): string {
  return activeProvider.name === "codex" ? "Codex" : "Claude Code";
}

async function clearActiveOAuthAccount(): Promise<void> {
  const configPath = getClaudeConfigPath();
  let configObj: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      configObj = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      configObj = {};
    }
  }

  delete configObj.oauthAccount;
  await writeJsonAtomic(configPath, configObj);
}

async function syncSequenceActiveAccount(seq: SequenceData): Promise<SequenceData> {
  const currentEmail = getCurrentAccount();
  const resolvedActive = resolveManagedAccountNumberForEmail(seq, currentEmail);
  if (seq.activeAccountNumber !== resolvedActive) {
    seq.activeAccountNumber = resolvedActive;
    seq.lastUpdated = new Date().toISOString();
    await writeJsonAtomic(activeSequenceFile, seq);
  }
  return seq;
}

// Perform the actual account switch.
export async function performSwitch(
  seq: SequenceData,
  targetAccount: string,
  options?: { currentEmail?: string }
): Promise<void> {
  const targetEmail = seq.accounts[targetAccount].email;
  const currentEmail = options?.currentEmail ?? getCurrentAccount();
  const currentAccount = currentEmail === "none"
    ? null
    : resolveAccountIdentifier(seq, currentEmail);

  // Skip only when the real current logged-in account already matches target.
  if (currentEmail === targetEmail) {
    const account = seq.accounts[targetAccount];
    const aliasStr = account.alias ? ` [${account.alias}]` : "";
    const displayLabel = getDisplayAccountLabel(seq, targetAccount);
    if (seq.activeAccountNumber !== Number(targetAccount)) {
      seq.activeAccountNumber = Number(targetAccount);
      seq.lastUpdated = new Date().toISOString();
      await writeJsonAtomic(activeSequenceFile, seq);
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
        activeCredentialsDir
      );
    }
    if (activeProvider.name === "claude") {
      const configPath = getClaudeConfigPath();
      const currentConfig = existsSync(configPath)
        ? readFileSync(configPath, "utf-8")
        : "";
      if (currentConfig) {
      await activeProvider.writeAccountConfig(
        currentAccount,
        currentEmail,
        currentConfig,
        activeConfigsDir
      );
      }
    }
  }

  // Step 2: Restore target account
  const targetCreds = await activeProvider.readAccountAuth(
    targetAccount,
    targetEmail,
    activeCredentialsDir
  );
  const targetConfig = activeProvider.readAccountConfig(
    targetAccount,
    targetEmail,
    activeConfigsDir
  );

  if (!targetCreds) {
    throw new Error(
      `Missing backup data for ${getDisplayAccountLabel(seq, targetAccount)}`
    );
  }
  if (activeProvider.name === "claude" && !targetConfig) {
    throw new Error(
      `Missing backup data for ${getDisplayAccountLabel(seq, targetAccount)}`
    );
  }

  // Step 3: Write target credentials
  await activeProvider.writeActiveAuth(targetCreds);

  // Step 4: Provider-specific config restore
  if (activeProvider.name === "claude") {
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
  }

  // Step 5: Update sequence
  seq.activeAccountNumber = Number(targetAccount);
  seq.lastUpdated = new Date().toISOString();
  await writeJsonAtomic(activeSequenceFile, seq);

  const alias = seq.accounts[targetAccount].alias;
  const aliasStr = alias ? ` [${alias}]` : "";
  const displayLabel = getDisplayAccountLabel(seq, targetAccount);
  console.log(`Switched to ${displayLabel} (${targetEmail})${aliasStr}`);
  console.log(`\nPlease restart ${getProviderLabel()} to use the new authentication.\n`);
}

// --- Command handlers ---

async function cmdList(): Promise<void> {
  if (!existsSync(activeSequenceFile)) {
    console.log("No accounts managed yet. Run: caflip add");
    return;
  }

  const seq = await loadSequence(activeSequenceFile);
  await syncSequenceActiveAccount(seq);
  const currentEmail = getCurrentAccount();

  console.log("Accounts:");
  seq.sequence.forEach((num, index) => {
    const numStr = String(num);
    const account = seq.accounts[numStr];
    if (!account) {
      throw new Error(`Corrupt sequence data: missing account entry for id ${numStr}`);
    }
    const isActive = account.email === currentEmail;
    let line = `  ${index + 1}: ${account.email}`;
    if (account.alias) line += ` [${account.alias}]`;
    if (isActive) line += " (active)";
    console.log(line);
  });
}

async function cmdAdd(alias?: string): Promise<void> {
  setupDirectories();
  await initSequenceFile(activeSequenceFile);

  const currentAccount = activeProvider.getCurrentAccount();
  const currentEmail = currentAccount?.email ?? "none";
  if (currentEmail === "none") {
    throw new Error(`No active ${getProviderLabel()} account found. Please log in first.`);
  }

  if (!sanitizeEmailForFilename(currentEmail)) {
    throw new Error("Current account email is not safe for storage");
  }

  const seq = await loadSequence(activeSequenceFile);
  await syncSequenceActiveAccount(seq);

  if (accountExists(seq, currentEmail)) {
    console.log(`Account ${currentEmail} is already managed.`);
    return;
  }

  // Validate alias if provided
  if (alias) {
    const result = validateAlias(alias);
    if (!result.valid) {
      throw new Error(result.reason);
    }
    if (findAccountByAlias(seq, alias)) {
      throw new Error(`Alias "${alias}" is already in use`);
    }
  }

  // Read current credentials and config
  const creds = await activeProvider.readActiveAuth();
  if (!creds) {
    throw new Error("No credentials found for current account");
  }

  let config = "";
  let uuid = currentAccount?.accountId ?? "";
  if (activeProvider.name === "claude") {
    const configPath = getClaudeConfigPath();
    config = readFileSync(configPath, "utf-8");
    const configObj = JSON.parse(config);
    uuid = configObj.oauthAccount?.accountUuid ?? "";
  }

  // Add to sequence
  const updated = addAccountToSequence(seq, {
    email: currentEmail,
    uuid,
    alias,
  });

  const accountNum = String(updated.activeAccountNumber);
  const displayLabel = getDisplayAccountLabel(updated, accountNum);

  // Store backups
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

  const aliasStr = alias ? ` [${alias}]` : "";
  console.log(`Added ${displayLabel}: ${currentEmail}${aliasStr}`);
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
    if (activeProvider.name === "claude") {
      await clearActiveOAuthAccount();
    }
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

async function cmdStatus(): Promise<void> {
  const email = getCurrentAccount();
  if (email === "none") {
    console.log("none");
  } else {
    // Check if account has alias
    if (existsSync(activeSequenceFile)) {
      const seq = await loadSequence(activeSequenceFile);
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

async function cmdAlias(alias: string, identifier?: string): Promise<void> {
  if (!existsSync(activeSequenceFile)) {
    throw new Error("No accounts managed yet");
  }

  const result = validateAlias(alias);
  if (!result.valid) {
    throw new Error(result.reason);
  }

  const seq = await loadSequence(activeSequenceFile);
  if (identifier && /^\d+$/.test(identifier)) {
    throw new Error("Alias target must be an email, not a number");
  }
  const currentEmail = getCurrentAccount();
  const accountNum = resolveAliasTargetAccount(seq, { identifier, currentEmail });
  if (!accountNum) {
    if (identifier) {
      throw new Error(`Account not found: ${identifier}`);
    } else if (currentEmail === "none") {
      throw new Error(`No active ${getProviderLabel()} account found. Please log in first.`);
    } else {
      throw new Error(`Current account is not managed: ${currentEmail}`);
    }
  }

  const updated = setAlias(seq, accountNum, alias);
  await writeJsonAtomic(activeSequenceFile, updated);

  const account = updated.accounts[accountNum];
  console.log(
    `Alias "${alias}" set for ${getDisplayAccountLabel(updated, accountNum)} (${account.email})`
  );
}

async function cmdInteractiveSwitch(): Promise<void> {
  if (!existsSync(activeSequenceFile)) {
    throw new Error("No accounts managed yet. Run: caflip add");
  }

  const seq = await loadSequence(activeSequenceFile);
  await syncSequenceActiveAccount(seq);
  const currentEmail = getCurrentAccount();
  const shouldOfferAddCurrent =
    currentEmail !== "none" && !accountExists(seq, currentEmail);
  const extraChoices = shouldOfferAddCurrent
    ? [
        {
          name: `+ Add current logged-in account (${currentEmail})`,
          value: ADD_CURRENT_ACCOUNT_CHOICE,
        },
      ]
    : [];

  if (seq.sequence.length === 0 && !shouldOfferAddCurrent) {
    throw new Error("No accounts managed yet. Run: caflip add");
  }

  const selected = await pickAccount(
    seq,
    `caflip v${pkg.version} — Switch to account:`,
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
  caflip [command]
  caflip <claude|codex> [command]

Commands:
  (no args)                            Interactive account picker
  <alias>                              Switch to account by alias
  list                                 List all managed accounts
  add [--alias <name>]                 Add current account
  remove [<email>]                     Remove an account
  next                                 Rotate to next account
  status                               Show current account
  alias <name> [<email>]               Set alias for current or target account
  help                                 Show this help

Examples:
  caflip                               Pick Claude account interactively (default provider)
  caflip work                          Switch Claude account by alias
  caflip add --alias personal          Add current Claude account with alias
  caflip codex list                    List managed Codex accounts
  caflip codex add --alias work        Add current Codex account with alias
  caflip codex alias work user@company.com
                                       Set Codex alias for target email`);
}

// --- Main ---

async function main(): Promise<void> {
  const parsed = parseProviderArgs(process.argv.slice(2));
  const provider = parsed.provider;
  const args = parsed.commandArgs;

  activeBackupDir = getBackupDir(provider);
  activeSequenceFile = getSequenceFile(provider);
  activeLockDir = getLockDir(provider);
  activeConfigsDir = getConfigsDir(provider);
  activeCredentialsDir = getCredentialsDir(provider);
  activeProvider = getProvider(provider);
  const command = args[0];
  let lockHeld = false;

  const runWithLock = async (fn: () => Promise<void>): Promise<void> => {
    setupDirectories();
    acquireLock(activeLockDir);
    lockHeld = true;
    try {
      await fn();
    } finally {
      if (lockHeld) {
        releaseLock(activeLockDir);
        lockHeld = false;
      }
    }
  };

  // No args: interactive picker
  if (!command) {
    await runWithLock(async () => {
      await cmdInteractiveSwitch();
    });
    return;
  }

  switch (command) {
    case "list":
      await cmdList();
      break;

    case "add": {
      await runWithLock(async () => {
        // Parse --alias flag
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

    case "status":
      await cmdStatus();
      break;

    case "alias": {
      if (!args[1]) {
        console.error("Usage: caflip alias <name> [<email>]");
        process.exit(1);
      }
      await runWithLock(async () => {
        await cmdAlias(args[1], args[2]);
      });
      break;
    }

    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;

    default: {
      // Check if it's an alias
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
