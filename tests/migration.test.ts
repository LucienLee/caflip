// ABOUTME: Tests lazy migration of legacy account records into the normalized account shape.
// ABOUTME: Verifies legacy records remain readable before a provider refresh fills identity fields.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadSequence } from "../src/accounts";

describe("sequence migration", () => {
  test("legacy records stay readable without normalized identity", async () => {
    const testDir = mkdtempSync(join(tmpdir(), "caflip-migration-"));
    const sequencePath = join(testDir, "sequence.json");
    mkdirSync(testDir, { recursive: true });

    await Bun.write(
      sequencePath,
      JSON.stringify(
        {
          activeAccountNumber: 1,
          lastUpdated: "2026-03-29T00:00:00.000Z",
          sequence: [1],
          accounts: {
            "1": {
              email: "legacy@test.com",
              uuid: "old-uuid",
              alias: "work",
              added: "2026-03-29T00:00:00.000Z",
            },
          },
        },
        null,
        2
      )
    );

    const seq = await loadSequence(sequencePath);
    expect(seq.accounts["1"].email).toBe("legacy@test.com");
    expect(seq.accounts["1"].legacyUuid).toBe("old-uuid");
    expect(seq.accounts["1"].alias).toBe("work");
    expect(seq.accounts["1"].identity).toBeUndefined();
    expect(seq.accounts["1"].display?.label).toBe("legacy@test.com");

    rmSync(testDir, { recursive: true, force: true });
  });
});
