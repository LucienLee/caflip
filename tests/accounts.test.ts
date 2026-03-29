// ABOUTME: Tests for the accounts module covering CRUD, sequence rotation, and alias operations.
// ABOUTME: Uses temp directories to isolate test state from the real filesystem.
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  initSequenceFile,
  loadSequence,
  getNextAccountNumber,
  accountExists,
  resolveManagedAccountNumber,
  resolveManagedAccount,
  addAccountToSequence,
  removeAccountFromSequence,
  getNextInSequence,
  resolveAccountIdentifier,
  resolveAliasTargetAccount,
  getDisplayAccountLabel,
  getManagedAccountLabel,
  setAlias,
  findAccountByAlias,
  getPostRemovalAction,
  resolveManagedAccountNumberForEmail,
} from "../src/accounts";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DIR = join(tmpdir(), "ccflip-accounts-test-" + Date.now());
const TEST_SEQUENCE = join(TEST_DIR, "sequence.json");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("initSequenceFile", () => {
  test("creates sequence.json if missing", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    expect(existsSync(TEST_SEQUENCE)).toBe(true);
    const data = await loadSequence(TEST_SEQUENCE);
    expect(data.activeAccountNumber).toBeNull();
    expect(data.sequence).toEqual([]);
    expect(data.accounts).toEqual({});
  });

  test("does not overwrite existing file", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const original = await loadSequence(TEST_SEQUENCE);
    original.accounts["1"] = {
      email: "test@test.com",
      uuid: "abc",
      added: new Date().toISOString(),
    };
    const { writeJsonAtomic } = await import("../src/files");
    await writeJsonAtomic(TEST_SEQUENCE, original);

    await initSequenceFile(TEST_SEQUENCE);
    const data = await loadSequence(TEST_SEQUENCE);
    expect(data.accounts["1"]).toBeDefined();
  });

  test("loadSequence normalizes legacy accounts into display metadata", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const { writeJsonAtomic } = await import("../src/files");
    await writeJsonAtomic(TEST_SEQUENCE, {
      activeAccountNumber: 1,
      lastUpdated: new Date().toISOString(),
      sequence: [1],
      accounts: {
        "1": {
          email: "legacy@test.com",
          uuid: "legacy-uuid",
          added: new Date().toISOString(),
        },
      },
    });

    const data = await loadSequence(TEST_SEQUENCE);
    expect(data.accounts["1"].display?.email).toBe("legacy@test.com");
    expect(data.accounts["1"].display?.label).toBe("legacy@test.com");
    expect(data.accounts["1"].legacyUuid).toBe("legacy-uuid");
    expect(data.accounts["1"].identity).toBeUndefined();
  });
});

describe("getNextAccountNumber", () => {
  test("returns 1 for empty accounts", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    expect(getNextAccountNumber(seq)).toBe(1);
  });

  test("returns max + 1", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    seq.accounts["3"] = { email: "a@b.com", uuid: "x", added: "" };
    seq.accounts["5"] = { email: "c@d.com", uuid: "y", added: "" };
    expect(getNextAccountNumber(seq)).toBe(6);
  });
});

describe("accountExists", () => {
  test("returns false for empty accounts", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    expect(accountExists(seq, "nope@x.com")).toBe(false);
  });

  test("returns true for existing email", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    seq.accounts["1"] = { email: "test@x.com", uuid: "a", added: "" };
    expect(accountExists(seq, "test@x.com")).toBe(true);
  });

  test("matches normalized identity by unique key", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, {
      email: "test@x.com",
      uuid: "claude:acct-1:org-1",
      identity: {
        provider: "claude",
        accountId: "acct-1",
        organizationId: "org-1",
        uniqueKey: "claude:acct-1:org-1",
      },
      display: {
        email: "test@x.com",
        accountName: null,
        organizationName: "Org 1",
        planType: null,
        role: null,
        label: "test@x.com · Org 1",
      },
    });

    expect(
      accountExists(seq, {
        provider: "claude",
        email: "test@x.com",
        uniqueKey: "claude:acct-1:org-1",
      })
    ).toBe(true);
  });
});

describe("addAccountToSequence", () => {
  test("adds account and updates sequence", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    const updated = addAccountToSequence(seq, {
      email: "user@test.com",
      uuid: "abc-123",
    });
    expect(updated.accounts["1"].email).toBe("user@test.com");
    expect(updated.sequence).toContain(1);
    expect(updated.activeAccountNumber).toBe(1);
  });

  test("adds account with alias", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    const updated = addAccountToSequence(seq, {
      email: "user@test.com",
      uuid: "abc-123",
      alias: "work",
    });
    expect(updated.accounts["1"].alias).toBe("work");
  });

  test("adds normalized identity and display metadata", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    const updated = addAccountToSequence(seq, {
      email: "user@test.com",
      uuid: "codex:acct-1:org-1",
      identity: {
        provider: "codex",
        accountId: "acct-1",
        organizationId: "org-1",
        uniqueKey: "codex:acct-1:org-1",
      },
      display: {
        email: "user@test.com",
        accountName: null,
        organizationName: "Workspace 1",
        planType: "team",
        role: "owner",
        label: "user@test.com · Workspace 1",
      },
    });

    expect(updated.accounts["1"].identity?.uniqueKey).toBe("codex:acct-1:org-1");
    expect(updated.accounts["1"].display.organizationName).toBe("Workspace 1");
  });

  test("codex free accounts do not show org ids in labels", () => {
    expect(
      getManagedAccountLabel({
        email: "user@test.com",
        identity: {
          provider: "codex",
          accountId: "acct-1",
          organizationId: "org-1234567890",
          uniqueKey: "codex:acct-1:org-1234567890",
        },
        display: {
          email: "user@test.com",
          accountName: null,
          organizationName: "Personal",
          planType: "free",
          role: "owner",
          label: "ignored",
        },
      })
    ).toBe("user@test.com · free");
  });

  test("claude personal organization labels are simplified", () => {
    expect(
      getManagedAccountLabel({
        email: "hi.lucienlee@gmail.com",
        identity: {
          provider: "claude",
          accountId: "acct-1",
          organizationId: "org-1",
          uniqueKey: "claude:acct-1:org-1",
        },
        display: {
          email: "hi.lucienlee@gmail.com",
          accountName: null,
          organizationName: "hi.lucienlee@gmail.com's Organization",
          planType: null,
          role: null,
          label: "ignored",
        },
      })
    ).toBe("hi.lucienlee@gmail.com · Personal");
  });
});

describe("removeAccountFromSequence", () => {
  test("removes account and updates sequence", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    const updated = removeAccountFromSequence(seq, "1");
    expect(updated.accounts["1"]).toBeUndefined();
    expect(updated.sequence).not.toContain(1);
    expect(updated.accounts["2"]).toBeDefined();
  });

  test("clears activeAccountNumber when removing last account", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq.activeAccountNumber = 1;
    const updated = removeAccountFromSequence(seq, "1");
    expect(updated.sequence).toEqual([]);
    expect(updated.activeAccountNumber).toBeNull();
  });

  test("repoints activeAccountNumber when removing active account", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    seq.activeAccountNumber = 1;
    const updated = removeAccountFromSequence(seq, "1");
    expect(updated.sequence).toEqual([2]);
    expect(updated.activeAccountNumber).toBe(2);
  });
});

describe("getNextInSequence", () => {
  test("rotates to next account", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    seq.activeAccountNumber = 1;
    expect(getNextInSequence(seq)).toBe(2);
  });

  test("wraps around to first", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    seq.activeAccountNumber = 2;
    expect(getNextInSequence(seq)).toBe(1);
  });
});

describe("resolveAccountIdentifier", () => {
  test("resolves number string", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    expect(resolveAccountIdentifier(seq, "1")).toBe("1");
  });

  test("resolves email", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    expect(resolveAccountIdentifier(seq, "a@b.com")).toBe("1");
  });

  test("returns null for unknown", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    expect(resolveAccountIdentifier(seq, "nope@x.com")).toBeNull();
  });

  test("resolves UI sequence number when internal ids are sparse", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    seq = removeAccountFromSequence(seq, "1");
    expect(resolveAccountIdentifier(seq, "1")).toBe("2");
  });
});

describe("resolveAliasTargetAccount", () => {
  test("resolves explicit email identifier first", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    expect(
      resolveAliasTargetAccount(seq, {
        identifier: "c@d.com",
        currentEmail: "a@b.com",
      })
    ).toBe("2");
  });

  test("resolves numeric identifier as UI account index", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    expect(
      resolveAliasTargetAccount(seq, {
        identifier: "2",
        currentEmail: "a@b.com",
      })
    ).toBe("2");
  });

  test("uses current email when identifier is missing", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    expect(
      resolveAliasTargetAccount(seq, {
        currentEmail: "a@b.com",
      })
    ).toBe("1");
  });

  test('returns null when identifier is missing and current email is "none"', async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    expect(
      resolveAliasTargetAccount(seq, {
        currentEmail: "none",
      })
    ).toBeNull();
  });

  test("returns null when current email is unmanaged", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    expect(
      resolveAliasTargetAccount(seq, {
        currentEmail: "x@y.com",
      })
    ).toBeNull();
  });
});

describe("getDisplayAccountLabel", () => {
  test("uses UI order instead of internal account id", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    seq = removeAccountFromSequence(seq, "1");

    expect(getDisplayAccountLabel(seq, "2")).toBe("Account-1");
  });
});

describe("alias operations", () => {
  test("setAlias assigns alias to account", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    const updated = setAlias(seq, "1", "work");
    expect(updated.accounts["1"].alias).toBe("work");
  });

  test("setAlias rejects duplicate alias", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    seq = setAlias(seq, "1", "work");
    expect(() => setAlias(seq, "2", "work")).toThrow(/already in use/i);
  });

  test("setAlias duplicate error uses UI account label", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    seq = removeAccountFromSequence(seq, "1");
    seq = setAlias(seq, "2", "work");
    seq = addAccountToSequence(seq, { email: "e@f.com", uuid: "3" });
    expect(() => setAlias(seq, "3", "work")).toThrow(/Account-1/);
  });

  test("findAccountByAlias returns account number", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = setAlias(seq, "1", "work");
    expect(findAccountByAlias(seq, "work")).toBe("1");
  });

  test("findAccountByAlias returns null if not found", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);
    expect(findAccountByAlias(seq, "nope")).toBeNull();
  });

  test("resolveAliasTargetAccount accepts UI account index", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });

    expect(resolveAliasTargetAccount(seq, { identifier: "2" })).toBe("2");
  });

  test("resolveAliasTargetAccount accepts existing alias target", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = setAlias(seq, "1", "work");

    expect(resolveAliasTargetAccount(seq, { identifier: "work" })).toBe("1");
  });

  test("resolveAliasTargetAccount returns null for ambiguous same-email targets", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, {
      email: "same@test.com",
      uuid: "codex:acct-1:org-a",
      identity: {
        provider: "codex",
        accountId: "acct-1",
        organizationId: "org-a",
        uniqueKey: "codex:acct-1:org-a",
      },
      display: {
        email: "same@test.com",
        accountName: null,
        organizationName: "Workspace A",
        planType: "team",
        role: "owner",
        label: "same@test.com · Workspace A",
      },
    });
    seq = addAccountToSequence(seq, {
      email: "same@test.com",
      uuid: "codex:acct-1:org-b",
      identity: {
        provider: "codex",
        accountId: "acct-1",
        organizationId: "org-b",
        uniqueKey: "codex:acct-1:org-b",
      },
      display: {
        email: "same@test.com",
        accountName: null,
        organizationName: "Workspace B",
        planType: "team",
        role: "owner",
        label: "same@test.com · Workspace B",
      },
    });

    expect(resolveAliasTargetAccount(seq, { identifier: "same@test.com" })).toBeNull();
  });
});

describe("getPostRemovalAction", () => {
  test("returns switch when removing active account with remaining accounts", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    seq.activeAccountNumber = 1;
    const updated = removeAccountFromSequence(seq, "1");

    expect(getPostRemovalAction(seq, updated, "1")).toEqual({
      type: "switch",
      targetAccountNumber: "2",
    });
  });

  test("returns logout when removing last active account", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq.activeAccountNumber = 1;
    const updated = removeAccountFromSequence(seq, "1");

    expect(getPostRemovalAction(seq, updated, "1")).toEqual({
      type: "logout",
    });
  });

  test("returns none when removing a non-active account", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });
    seq.activeAccountNumber = 2;
    const updated = removeAccountFromSequence(seq, "1");

    expect(getPostRemovalAction(seq, updated, "1")).toEqual({
      type: "none",
    });
  });
});

describe("resolveManagedAccountNumberForEmail", () => {
  test("returns managed account number when email exists in sequence", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });
    seq = addAccountToSequence(seq, { email: "c@d.com", uuid: "2" });

    expect(resolveManagedAccountNumberForEmail(seq, "c@d.com")).toBe(2);
  });

  test("returns null when email is unmanaged", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "a@b.com", uuid: "1" });

    expect(resolveManagedAccountNumberForEmail(seq, "x@y.com")).toBeNull();
  });

  test('returns null when current account is "none"', async () => {
    await initSequenceFile(TEST_SEQUENCE);
    const seq = await loadSequence(TEST_SEQUENCE);

    expect(resolveManagedAccountNumberForEmail(seq, "none")).toBeNull();
  });
});

describe("resolveManagedAccountNumber", () => {
  test("prefers uniqueKey over email when available", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, {
      email: "same@test.com",
      uuid: "acct-1",
      identity: {
        provider: "codex",
        accountId: "acct-1",
        organizationId: "org-1",
        uniqueKey: "codex:acct-1:org-1",
      },
      display: {
        email: "same@test.com",
        accountName: null,
        organizationName: "Org One",
        planType: null,
        role: null,
        label: "same@test.com · Org One",
      },
    });
    seq = addAccountToSequence(seq, {
      email: "same@test.com",
      uuid: "acct-1",
      identity: {
        provider: "codex",
        accountId: "acct-1",
        organizationId: "org-2",
        uniqueKey: "codex:acct-1:org-2",
      },
      display: {
        email: "same@test.com",
        accountName: null,
        organizationName: "Org Two",
        planType: null,
        role: null,
        label: "same@test.com · Org Two",
      },
    });

    expect(
      resolveManagedAccountNumber(seq, {
        email: "same@test.com",
        accountId: "acct-1",
        organizationId: "org-2",
        uniqueKey: "codex:acct-1:org-2",
      })
    ).toBe(2);
  });

  test("returns null when same-email legacy candidates are ambiguous", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "same@test.com", uuid: "legacy-1" });
    seq = addAccountToSequence(seq, { email: "same@test.com", uuid: "legacy-2" });

    expect(
      resolveManagedAccountNumber(seq, {
        email: "same@test.com",
      })
    ).toBeNull();
  });
});

describe("resolveManagedAccount", () => {
  test("returns matching account by unique key when same email has multiple organizations", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, {
      email: "same@test.com",
      uuid: "claude:acct-1:org-1",
      identity: {
        provider: "claude",
        accountId: "acct-1",
        organizationId: "org-1",
        uniqueKey: "claude:acct-1:org-1",
      },
      display: {
        email: "same@test.com",
        accountName: null,
        organizationName: "Org 1",
        planType: null,
        role: null,
        label: "same@test.com · Org 1",
      },
    });
    seq = addAccountToSequence(seq, {
      email: "same@test.com",
      uuid: "claude:acct-1:org-2",
      identity: {
        provider: "claude",
        accountId: "acct-1",
        organizationId: "org-2",
        uniqueKey: "claude:acct-1:org-2",
      },
      display: {
        email: "same@test.com",
        accountName: null,
        organizationName: "Org 2",
        planType: null,
        role: null,
        label: "same@test.com · Org 2",
      },
    });

    expect(
      resolveManagedAccount(seq, {
        provider: "claude",
        email: "same@test.com",
        uniqueKey: "claude:acct-1:org-2",
      })
    ).toBe("2");
  });

  test("returns null for ambiguous same-email legacy candidates", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, { email: "same@test.com", uuid: "legacy-1" });
    seq = addAccountToSequence(seq, { email: "same@test.com", uuid: "legacy-2" });

    expect(
      resolveManagedAccount(seq, {
        provider: "codex",
        email: "same@test.com",
      })
    ).toBeNull();
  });

  test("does not email-match a normalized account when unique key is missing", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, {
      email: "same@test.com",
      uuid: "codex:acct-1:org-a",
      identity: {
        provider: "codex",
        accountId: "acct-1",
        organizationId: "org-a",
        uniqueKey: "codex:acct-1:org-a",
      },
      display: {
        email: "same@test.com",
        accountName: null,
        organizationName: "Workspace A",
        planType: "team",
        role: "owner",
        label: "same@test.com · Workspace A",
      },
    });

    expect(
      resolveManagedAccount(seq, {
        provider: "codex",
        email: "same@test.com",
      })
    ).toBeNull();
  });

  test("does not email-match a normalized account when unique key is missing", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, {
      email: "same@test.com",
      uuid: "codex:acct-1:org-a",
      identity: {
        provider: "codex",
        accountId: "acct-1",
        organizationId: "org-a",
        uniqueKey: "codex:acct-1:org-a",
      },
      display: {
        email: "same@test.com",
        accountName: null,
        organizationName: "Workspace A",
        planType: "team",
        role: "owner",
        label: "same@test.com · Workspace A",
      },
    });

    expect(
      resolveManagedAccount(seq, {
        provider: "codex",
        email: "same@test.com",
      })
    ).toBeNull();
  });
});

describe("resolveManagedAccountNumber", () => {
  test("returns managed account number for normalized identity", async () => {
    await initSequenceFile(TEST_SEQUENCE);
    let seq = await loadSequence(TEST_SEQUENCE);
    seq = addAccountToSequence(seq, {
      email: "same@test.com",
      uuid: "codex:acct-1:org-2",
      identity: {
        provider: "codex",
        accountId: "acct-1",
        organizationId: "org-2",
        uniqueKey: "codex:acct-1:org-2",
      },
      display: {
        email: "same@test.com",
        accountName: null,
        organizationName: "Workspace 2",
        planType: "team",
        role: "owner",
        label: "same@test.com · Workspace 2",
      },
    });

    expect(
      resolveManagedAccountNumber(seq, {
        provider: "codex",
        email: "same@test.com",
        uniqueKey: "codex:acct-1:org-2",
      })
    ).toBe(1);
  });
});
