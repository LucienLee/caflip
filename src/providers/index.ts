// ABOUTME: Provider registry and interface for account/auth operations.
// ABOUTME: Defines a common contract for Claude and Codex integrations.

import type { ProviderName } from "./types";
import type { AccountProvider } from "./types";
import { claudeProvider } from "./claude";
import { codexProvider } from "./codex";

export type { AccountProvider };

export const providers: Record<ProviderName, AccountProvider> = {
  claude: claudeProvider,
  codex: codexProvider,
};

export function getProvider(name: ProviderName): AccountProvider {
  return providers[name];
}
