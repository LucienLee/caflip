// ABOUTME: Guards the public install/uninstall shell scripts for binary distribution.
// ABOUTME: Ensures install and uninstall scripts stay aligned on binary name and install dir.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("install scripts", () => {
  test("install and uninstall scripts share binary name and configurable install dir", () => {
    const installScript = readRepoFile("install.sh");
    const uninstallScript = readRepoFile("uninstall.sh");

    const binaryMatch = installScript.match(/^BINARY="([^"]+)"$/m);
    expect(binaryMatch).not.toBeNull();

    const binaryName = binaryMatch?.[1];

    expect(installScript).toContain('INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"');
    expect(uninstallScript).toContain(`BINARY="${binaryName}"`);
    expect(uninstallScript).toContain('INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"');
    expect(uninstallScript).toContain('TARGET="${INSTALL_DIR}/${BINARY}"');
  });

  test("uninstall checks install directory permissions before removing", () => {
    const uninstallScript = readRepoFile("uninstall.sh");

    expect(uninstallScript).toContain('if [ -w "$INSTALL_DIR" ]; then');
    expect(uninstallScript).not.toContain('[ -w "$TARGET" ] ||');
  });
});
