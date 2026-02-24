// ABOUTME: Builds cross-provider interactive picker choices for unified account switching.
// ABOUTME: Converts provider snapshots into switch/add actions with user-facing labels.

import type { SequenceData } from "./accounts";
import type { ProviderName } from "./providers/types";

export interface ProviderSnapshot {
  provider: ProviderName;
  sequenceData: SequenceData | null;
  currentEmail: string;
}

export interface GlobalPickerChoice {
  name: string;
  value: string;
}

function getProviderLabel(provider: ProviderName): string {
  return provider === "codex" ? "Codex" : "Claude Code";
}

export function buildGlobalPickerChoices(
  snapshots: ProviderSnapshot[]
): GlobalPickerChoice[] {
  const choices: GlobalPickerChoice[] = [];

  for (const snapshot of snapshots) {
    const label = getProviderLabel(snapshot.provider);
    const seq = snapshot.sequenceData;

    if (seq) {
      for (const [index, num] of seq.sequence.entries()) {
        const numStr = String(num);
        const account = seq.accounts[numStr];
        if (!account) {
          throw new Error(`Corrupt sequence data: missing account entry for id ${numStr}`);
        }
        const isActive = snapshot.currentEmail === account.email;
        let name = `${label} · ${index + 1}: ${account.email}`;
        if (account.alias) name += ` [${account.alias}]`;
        if (isActive) name += " (active)";
        choices.push({
          name,
          value: `switch:${snapshot.provider}:${numStr}`,
        });
      }
    }

    const shouldOfferAddCurrent = snapshot.currentEmail !== "none"
      && (!seq || !Object.values(seq.accounts).some((a) => a.email === snapshot.currentEmail));

    if (shouldOfferAddCurrent) {
      choices.push({
        name: `${label} · + Add current logged-in account (${snapshot.currentEmail})`,
        value: `add:${snapshot.provider}`,
      });
    }
  }

  return choices;
}
