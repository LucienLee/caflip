// ABOUTME: Interactive account selection prompts for the CLI.
// ABOUTME: Wraps @inquirer/prompts to present account picker and confirmation dialogs.

import readline from "node:readline";
import { select, confirm } from "@inquirer/prompts";
import type { SequenceData } from "./accounts";

type SelectPrompt = (args: {
  message: string;
  choices: Array<{ name: string; value: string }>;
  theme?: unknown;
}) => Promise<string>;

type ConfirmPrompt = (args: {
  message: string;
  default: boolean;
}) => Promise<boolean>;

export class PromptCancelledError extends Error {
  constructor() {
    super("Prompt cancelled");
    this.name = "PromptCancelledError";
  }
}

function isPromptCancellation(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "ExitPromptError" || err.name === "CancelPromptError")
  );
}

// Cancel a prompt's promise when the user presses ESC.
// If the promise has no .cancel() method (e.g. in tests), this is a no-op.
function listenForEsc(promise: Promise<unknown> & { cancel?: () => void }): () => void {
  if (typeof promise.cancel !== "function") return () => {};

  readline.emitKeypressEvents(process.stdin);
  const wasRaw = process.stdin.isRaw;
  if (process.stdin.isTTY && !wasRaw) {
    process.stdin.setRawMode(true);
  }

  const onKeypress = (_str: string, key: { name: string }) => {
    if (key?.name === "escape") {
      promise.cancel!();
    }
  };
  process.stdin.on("keypress", onKeypress);

  return () => {
    process.stdin.removeListener("keypress", onKeypress);
    if (process.stdin.isTTY && !wasRaw) {
      process.stdin.setRawMode(false);
    }
  };
}

async function wrapPromptCancellation<T>(fn: () => Promise<T>): Promise<T> {
  const promise = fn();
  const cleanup = listenForEsc(promise as Promise<unknown> & { cancel?: () => void });
  try {
    return await promise;
  } catch (err) {
    if (isPromptCancellation(err)) {
      throw new PromptCancelledError();
    }
    throw err;
  } finally {
    cleanup();
  }
}

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
  message: string = "Switch to account:",
  promptSelect: SelectPrompt = select,
  extraChoices: Array<{ name: string; value: string }> = []
): Promise<string> {
  const choices = [
    ...seq.sequence.map((num, index) => {
      const numStr = String(num);
      const account = seq.accounts[numStr];
      if (!account) {
        throw new Error(`Corrupt sequence data: missing account entry for id ${numStr}`);
      }
      const isActive = num === seq.activeAccountNumber;
      return {
        name: formatAccount(String(index + 1), account.email, account.alias, isActive),
        value: numStr,
      };
    }),
    ...extraChoices,
  ];

  const bold = (s: string) => `\u001b[1m${s}\u001b[22m`;
  const dim = (s: string) => `\u001b[2m${s}\u001b[22m`;
  const theme = {
    style: {
      keysHelpTip: (keys: Array<[string, string]>) =>
        [...keys, ["\u238B", "cancel"]]
          .map(([k, a]) => `${bold(k)} ${dim(a)}`)
          .join(dim(" \u2022 ")),
    },
  };

  return wrapPromptCancellation(() => promptSelect({ message, choices, theme }));
}

// Show interactive account picker for removal.
export async function pickAccountForRemoval(
  seq: SequenceData,
  promptSelect: SelectPrompt = select
): Promise<string> {
  return pickAccount(seq, "Remove which account?", promptSelect);
}

// Confirm a destructive action.
export async function confirmAction(
  message: string,
  promptConfirm: ConfirmPrompt = confirm
): Promise<boolean> {
  return wrapPromptCancellation(() =>
    promptConfirm({ message, default: false })
  );
}
