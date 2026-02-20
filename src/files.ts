// ABOUTME: Atomic JSON file writing and directory-based file locking.
// ABOUTME: Prevents data corruption by writing to temp files and renaming into place.

import { existsSync, mkdirSync, rmSync, chmodSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";

// Write JSON atomically: write to temp file, validate, then rename into place.
export async function writeJsonAtomic(
  filePath: string,
  data: unknown
): Promise<void> {
  const jsonStr = JSON.stringify(data, null, 2);

  // Validate by parsing back
  JSON.parse(jsonStr);

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const tempFile = `${filePath}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempFile, jsonStr, { mode: 0o600 });
    renameSync(tempFile, filePath);
    chmodSync(filePath, 0o600);
  } catch (err) {
    // Clean up temp file on failure
    try {
      rmSync(tempFile, { force: true });
    } catch {}
    throw err;
  }
}

// Acquire a cross-platform directory-based lock.
export function acquireLock(lockDir: string): void {
  try {
    mkdirSync(lockDir, { recursive: false });
  } catch {
    throw new Error(
      `Another instance is running. If this is wrong, remove ${lockDir}`
    );
  }
}

// Release directory-based lock.
export function releaseLock(lockDir: string): void {
  try {
    rmSync(lockDir, { recursive: true, force: true });
  } catch {}
}
