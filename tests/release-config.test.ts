// ABOUTME: Guards install/release naming alignment for standalone binary downloads.
// ABOUTME: Ensures GitHub release artifacts use the same caflip binary name as install.sh.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("release configuration", () => {
  test("uses the install.sh binary name for release artifacts", () => {
    const installScript = readRepoFile("install.sh");
    const releaseWorkflow = readRepoFile(".github/workflows/release.yml");

    const binaryMatch = installScript.match(/^BINARY="([^"]+)"$/m);
    expect(binaryMatch).not.toBeNull();

    const binaryName = binaryMatch?.[1];
    const matrixArtifactPattern = `${binaryName}-\${{ matrix.os }}-\${{ matrix.arch }}`;

    expect(releaseWorkflow).toContain(`--outfile ${matrixArtifactPattern}`);
    expect(releaseWorkflow).toContain(`name: ${matrixArtifactPattern}`);
    expect(releaseWorkflow).toContain(`path: ${matrixArtifactPattern}`);
    expect(releaseWorkflow).toContain(`files: "*/${binaryName}-*"`);
  });
});
