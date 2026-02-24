// ABOUTME: Provider registry and interface for account/auth operations.
// ABOUTME: Defines a common contract for Claude and Codex integrations.

import type { ProviderName } from "./types";
import { claudeProvider, type AccountProvider } from "./claude";
import { codexProvider } from "./claude";

export type { AccountProvider };

export const providers: Record<ProviderName, AccountProvider> = {
  claude: claudeProvider,
  codex: codexProvider,
};

export function getProvider(name: ProviderName): AccountProvider {
  return providers[name];
}
