// ABOUTME: Interactive account selection prompts for the CLI.
// ABOUTME: Wraps @inquirer/prompts to present account picker and confirmation dialogs.

import { select, confirm } from "@inquirer/prompts";
import type { SequenceData } from "./accounts";

// Format an account entry for display.
function formatAccount(
  num: string,
  email: string,
  alias?: string,
  isActive?: boolean
): string {
  let label = `${num}: ${email}`;
  if (alias) label += ` [${alias}]`;
  if (isActive) label += " (active)";
  return label;
}

// Show interactive account picker, returns selected account number.
export async function pickAccount(
  seq: SequenceData,
  message: string = "Switch to account:"
): Promise<string> {
  const choices = seq.sequence.map((num) => {
    const numStr = String(num);
    const account = seq.accounts[numStr];
    const isActive = num === seq.activeAccountNumber;
    return {
      name: formatAccount(numStr, account.email, account.alias, isActive),
      value: numStr,
    };
  });

  return select({ message, choices });
}

// Show interactive account picker for removal.
export async function pickAccountForRemoval(
  seq: SequenceData
): Promise<string> {
  return pickAccount(seq, "Remove which account?");
}

// Confirm a destructive action.
export async function confirmAction(message: string): Promise<boolean> {
  return confirm({ message, default: false });
}
