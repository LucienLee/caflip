// ABOUTME: Runs performSwitch in a subprocess for env-isolated switch tests.
// ABOUTME: Avoids leaking HOME/PATH/provider state across Bun test cases.

import type { SequenceData } from "../../src/accounts";
import { performSwitch } from "../../src/index";

type PerformSwitchPayload = {
  seq: SequenceData;
  targetAccount: string;
  currentEmail?: string;
};

async function main(): Promise<void> {
  const raw = process.env.CAFLIP_PERFORM_SWITCH_PAYLOAD;
  if (!raw) {
    throw new Error("Missing CAFLIP_PERFORM_SWITCH_PAYLOAD");
  }

  const payload = JSON.parse(raw) as PerformSwitchPayload;
  await performSwitch(payload.seq, payload.targetAccount, {
    currentEmail: payload.currentEmail,
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
