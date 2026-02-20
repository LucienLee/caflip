#!/usr/bin/env bun
// ABOUTME: Entry point for ccflip CLI. Parses arguments and routes to command handlers.
// ABOUTME: Supports subcommands (list, add, remove, next, status, alias, help) and alias-based switching.

import { existsSync, readFileSync, mkdirSync } from "fs";
import {
  BACKUP_DIR,
  SEQUENCE_FILE,
  LOCK_DIR,
  CONFIGS_DIR,
  CREDENTIALS_DIR,
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
  accountExists,
  setAlias,
  findAccountByAlias,
  type SequenceData,
} from "./accounts";
import {
  readCredentials,
  writeCredentials,
  readAccountCredentials,
  writeAccountCredentials,
  deleteAccountCredentials,
  readAccountConfig,
  writeAccountConfig,
  deleteAccountConfig,
} from "./credentials";
import { writeJsonAtomic, acquireLock, releaseLock } from "./files";
import { sanitizeEmailForFilename, validateAlias } from "./validation";
import { pickAccount, pickAccountForRemoval, confirmAction } from "./interactive";

// Ensure backup directories exist.
function setupDirectories(): void {
  for (const dir of [BACKUP_DIR, CONFIGS_DIR, CREDENTIALS_DIR]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

// Read current account email from Claude config.
function getCurrentAccount(): string {
  const configPath = getClaudeConfigPath();
  if (!existsSync(configPath)) return "none";
  try {
    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    return content?.oauthAccount?.emailAddress ?? "none";
  } catch {
    return "none";
  }
}

// Perform the actual account switch.
export async function performSwitch(
  seq: SequenceData,
  targetAccount: string
): Promise<void> {
  // Skip if already on the target account.
  if (String(seq.activeAccountNumber) === targetAccount) {
    const account = seq.accounts[targetAccount];
    const aliasStr = account.alias ? ` [${account.alias}]` : "";
    console.log(`Already using Account-${targetAccount} (${account.email})${aliasStr}`);
    return;
  }

  const currentAccount = String(seq.activeAccountNumber);
  const targetEmail = seq.accounts[targetAccount].email;
  const currentEmail = getCurrentAccount();

  if (!sanitizeEmailForFilename(targetEmail)) {
    throw new Error("Target account email is not safe for storage");
  }
  if (currentEmail !== "none" && !sanitizeEmailForFilename(currentEmail)) {
    throw new Error("Current account email is not safe for storage");
  }

  // Step 1: Backup current account
  if (currentEmail !== "none" && currentAccount !== "null") {
    const currentCreds = await readCredentials();
    const configPath = getClaudeConfigPath();
    const currentConfig = existsSync(configPath)
      ? readFileSync(configPath, "utf-8")
      : "";

    if (currentCreds) {
      await writeAccountCredentials(currentAccount, currentEmail, currentCreds);
    }
    if (currentConfig) {
      await writeAccountConfig(currentAccount, currentEmail, currentConfig, CONFIGS_DIR);
    }
  }

  // Step 2: Restore target account
  const targetCreds = await readAccountCredentials(targetAccount, targetEmail);
  const targetConfig = readAccountConfig(targetAccount, targetEmail, CONFIGS_DIR);

  if (!targetCreds || !targetConfig) {
    throw new Error(`Missing backup data for Account-${targetAccount}`);
  }

  // Step 3: Write target credentials
  await writeCredentials(targetCreds);

  // Step 4: Merge oauthAccount into current config
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

  // Step 5: Update sequence
  seq.activeAccountNumber = Number(targetAccount);
  seq.lastUpdated = new Date().toISOString();
  await writeJsonAtomic(SEQUENCE_FILE, seq);

  const alias = seq.accounts[targetAccount].alias;
  const aliasStr = alias ? ` [${alias}]` : "";
  console.log(`Switched to Account-${targetAccount} (${targetEmail})${aliasStr}`);
  console.log("\nPlease restart Claude Code to use the new authentication.\n");
}

// --- Command handlers ---

async function cmdList(): Promise<void> {
  if (!existsSync(SEQUENCE_FILE)) {
    console.log("No accounts managed yet. Run: ccflip add");
    return;
  }

  const seq = await loadSequence(SEQUENCE_FILE);
  const currentEmail = getCurrentAccount();

  console.log("Accounts:");
  for (const num of seq.sequence) {
    const numStr = String(num);
    const account = seq.accounts[numStr];
    const isActive = account.email === currentEmail;
    let line = `  ${numStr}: ${account.email}`;
    if (account.alias) line += ` [${account.alias}]`;
    if (isActive) line += " (active)";
    console.log(line);
  }
}

async function cmdAdd(alias?: string): Promise<void> {
  setupDirectories();
  await initSequenceFile(SEQUENCE_FILE);

  const currentEmail = getCurrentAccount();
  if (currentEmail === "none") {
    console.error("Error: No active Claude account found. Please log in first.");
    process.exit(1);
  }

  if (!sanitizeEmailForFilename(currentEmail)) {
    console.error("Error: Current account email is not safe for storage");
    process.exit(1);
  }

  const seq = await loadSequence(SEQUENCE_FILE);

  if (accountExists(seq, currentEmail)) {
    console.log(`Account ${currentEmail} is already managed.`);
    return;
  }

  // Validate alias if provided
  if (alias) {
    const result = validateAlias(alias);
    if (!result.valid) {
      console.error(`Error: ${result.reason}`);
      process.exit(1);
    }
    if (findAccountByAlias(seq, alias)) {
      console.error(`Error: Alias "${alias}" is already in use`);
      process.exit(1);
    }
  }

  // Read current credentials and config
  const creds = await readCredentials();
  if (!creds) {
    console.error("Error: No credentials found for current account");
    process.exit(1);
  }

  const configPath = getClaudeConfigPath();
  const config = readFileSync(configPath, "utf-8");
  const configObj = JSON.parse(config);
  const uuid = configObj.oauthAccount?.accountUuid ?? "";

  // Add to sequence
  const updated = addAccountToSequence(seq, {
    email: currentEmail,
    uuid,
    alias,
  });

  const accountNum = String(updated.activeAccountNumber);

  // Store backups
  await writeAccountCredentials(accountNum, currentEmail, creds);
  await writeAccountConfig(accountNum, currentEmail, config, CONFIGS_DIR);
  await writeJsonAtomic(SEQUENCE_FILE, updated);

  const aliasStr = alias ? ` [${alias}]` : "";
  console.log(`Added Account ${accountNum}: ${currentEmail}${aliasStr}`);
}

async function cmdRemove(identifier?: string): Promise<void> {
  if (!existsSync(SEQUENCE_FILE)) {
    console.error("Error: No accounts managed yet");
    process.exit(1);
  }

  const seq = await loadSequence(SEQUENCE_FILE);

  // If no identifier given, use interactive picker
  let accountNum: string;
  if (!identifier) {
    accountNum = await pickAccountForRemoval(seq);
  } else {
    const resolved = resolveAccountIdentifier(seq, identifier);
    if (!resolved) {
      console.error(`Error: Account not found: ${identifier}`);
      process.exit(1);
    }
    accountNum = resolved;
  }

  const account = seq.accounts[accountNum];
  if (!account) {
    console.error(`Error: Account-${accountNum} does not exist`);
    process.exit(1);
  }

  if (seq.activeAccountNumber === Number(accountNum)) {
    console.log(`Warning: Account-${accountNum} (${account.email}) is currently active`);
  }

  const confirmed = await confirmAction(
    `Permanently remove Account-${accountNum} (${account.email})?`
  );
  if (!confirmed) {
    console.log("Cancelled");
    return;
  }

  // Delete backup files
  await deleteAccountCredentials(accountNum, account.email);
  deleteAccountConfig(accountNum, account.email, CONFIGS_DIR);

  // Update sequence
  const updated = removeAccountFromSequence(seq, accountNum);
  await writeJsonAtomic(SEQUENCE_FILE, updated);

  console.log(`Account-${accountNum} (${account.email}) has been removed`);
}

async function cmdNext(): Promise<void> {
  if (!existsSync(SEQUENCE_FILE)) {
    console.error("Error: No accounts managed yet");
    process.exit(1);
  }

  const seq = await loadSequence(SEQUENCE_FILE);

  if (seq.sequence.length < 2) {
    console.error("Error: Need at least 2 accounts to rotate");
    process.exit(1);
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
    if (existsSync(SEQUENCE_FILE)) {
      const seq = await loadSequence(SEQUENCE_FILE);
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

async function cmdAlias(alias: string, identifier: string): Promise<void> {
  if (!existsSync(SEQUENCE_FILE)) {
    console.error("Error: No accounts managed yet");
    process.exit(1);
  }

  const result = validateAlias(alias);
  if (!result.valid) {
    console.error(`Error: ${result.reason}`);
    process.exit(1);
  }

  const seq = await loadSequence(SEQUENCE_FILE);

  const accountNum = resolveAccountIdentifier(seq, identifier);
  if (!accountNum) {
    console.error(`Error: Account not found: ${identifier}`);
    process.exit(1);
  }

  const updated = setAlias(seq, accountNum, alias);
  await writeJsonAtomic(SEQUENCE_FILE, updated);

  const account = updated.accounts[accountNum];
  console.log(`Alias "${alias}" set for Account-${accountNum} (${account.email})`);
}

async function cmdInteractiveSwitch(): Promise<void> {
  if (!existsSync(SEQUENCE_FILE)) {
    console.error("Error: No accounts managed yet. Run: ccflip add");
    process.exit(1);
  }

  const seq = await loadSequence(SEQUENCE_FILE);

  if (seq.sequence.length === 0) {
    console.error("Error: No accounts managed yet. Run: ccflip add");
    process.exit(1);
  }

  const targetAccount = await pickAccount(seq);
  await performSwitch(seq, targetAccount);
}

function showHelp(): void {
  console.log(`ccflip - Multi-account switcher for Claude Code

Usage: ccflip [command]

Commands:
  (no args)                   Interactive account picker
  <alias>                     Switch to account by alias
  list                        List all managed accounts
  add [--alias <name>]        Add current account
  remove [<num|email>]        Remove an account
  next                        Rotate to next account
  status                      Show current account
  alias <name> <num|email>    Set alias for an account
  help                        Show this help

Examples:
  ccflip                      Pick account interactively
  ccflip work                 Switch to "work" alias
  ccflip add --alias personal Add current account with alias
  ccflip alias work 2         Set alias "work" for account 2`);
}

// --- Main ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // No args: interactive picker
  if (!command) {
    acquireLock(LOCK_DIR);
    try {
      await cmdInteractiveSwitch();
    } finally {
      releaseLock(LOCK_DIR);
    }
    return;
  }

  switch (command) {
    case "list":
      await cmdList();
      break;

    case "add": {
      acquireLock(LOCK_DIR);
      try {
        // Parse --alias flag
        let alias: string | undefined;
        const aliasIdx = args.indexOf("--alias");
        if (aliasIdx !== -1 && args[aliasIdx + 1]) {
          alias = args[aliasIdx + 1];
        }
        await cmdAdd(alias);
      } finally {
        releaseLock(LOCK_DIR);
      }
      break;
    }

    case "remove": {
      acquireLock(LOCK_DIR);
      try {
        await cmdRemove(args[1]);
      } finally {
        releaseLock(LOCK_DIR);
      }
      break;
    }

    case "next": {
      acquireLock(LOCK_DIR);
      try {
        await cmdNext();
      } finally {
        releaseLock(LOCK_DIR);
      }
      break;
    }

    case "status":
      await cmdStatus();
      break;

    case "alias": {
      if (!args[1] || !args[2]) {
        console.error("Usage: ccflip alias <name> <account_number|email>");
        process.exit(1);
      }
      acquireLock(LOCK_DIR);
      try {
        await cmdAlias(args[1], args[2]);
      } finally {
        releaseLock(LOCK_DIR);
      }
      break;
    }

    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;

    default: {
      // Check if it's an alias
      if (existsSync(SEQUENCE_FILE)) {
        const seq = await loadSequence(SEQUENCE_FILE);
        const accountNum = findAccountByAlias(seq, command);
        if (accountNum) {
          acquireLock(LOCK_DIR);
          try {
            await performSwitch(seq, accountNum);
          } finally {
            releaseLock(LOCK_DIR);
          }
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
    console.error(`Error: ${err.message}`);
    // Clean up lock on crash
    releaseLock(LOCK_DIR);
    process.exit(1);
  });
}
