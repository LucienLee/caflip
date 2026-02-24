// ABOUTME: Persists CLI-level metadata shared across providers.
// ABOUTME: Stores UX state such as last selected provider for interactive flows.

import { existsSync, readFileSync } from "fs";
import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { writeJsonAtomic } from "./files";
import type { ProviderName } from "./providers/types";

export interface CliMeta {
  lastProvider: ProviderName;
}

function getMetaFilePath(): string {
  const home = process.env.HOME ?? homedir();
  return join(home, ".caflip-backup", ".meta.json");
}

export function readCliMeta(): CliMeta {
  const metaFile = getMetaFilePath();
  if (!existsSync(metaFile)) {
    return { lastProvider: "claude" };
  }
  try {
    const parsed = JSON.parse(readFileSync(metaFile, "utf-8")) as Partial<CliMeta>;
    if (parsed.lastProvider === "codex") {
      return { lastProvider: "codex" };
    }
    return { lastProvider: "claude" };
  } catch {
    return { lastProvider: "claude" };
  }
}

export async function writeLastProvider(provider: ProviderName): Promise<void> {
  const metaFile = getMetaFilePath();
  mkdirSync(join(process.env.HOME ?? homedir(), ".caflip-backup"), {
    recursive: true,
    mode: 0o700,
  });
  await writeJsonAtomic(metaFile, { lastProvider: provider });
}
