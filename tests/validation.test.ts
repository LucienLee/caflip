// ABOUTME: Tests for email, filename safety, and alias validation utilities.
// ABOUTME: Covers valid/invalid inputs, path traversal prevention, and reserved name checks.

import { describe, expect, test } from "bun:test";
import {
  validateEmail,
  sanitizeEmailForFilename,
  validateAlias,
  validateAccountNumber,
} from "../src/validation";

describe("validateEmail", () => {
  test("accepts valid emails", () => {
    expect(validateEmail("user@example.com")).toBe(true);
    expect(validateEmail("user.name+tag@domain.co")).toBe(true);
    expect(validateEmail("a@b.cc")).toBe(true);
  });

  test("rejects invalid emails", () => {
    expect(validateEmail("")).toBe(false);
    expect(validateEmail("noat")).toBe(false);
    expect(validateEmail("@domain.com")).toBe(false);
    expect(validateEmail("user@")).toBe(false);
    expect(validateEmail("user@.com")).toBe(false);
  });
});

describe("sanitizeEmailForFilename", () => {
  test("accepts normal emails", () => {
    expect(sanitizeEmailForFilename("user@example.com")).toBe(true);
  });

  test("rejects path traversal", () => {
    expect(sanitizeEmailForFilename("../etc/passwd@x.com")).toBe(false);
    expect(sanitizeEmailForFilename("user/../../@x.com")).toBe(false);
  });

  test("rejects slashes", () => {
    expect(sanitizeEmailForFilename("user/name@x.com")).toBe(false);
  });

  test("rejects invalid email format", () => {
    expect(sanitizeEmailForFilename("notanemail")).toBe(false);
  });
});

describe("validateAlias", () => {
  test("accepts valid aliases", () => {
    expect(validateAlias("work").valid).toBe(true);
    expect(validateAlias("my-team").valid).toBe(true);
    expect(validateAlias("dev2").valid).toBe(true);
    expect(validateAlias("ab").valid).toBe(true);
  });

  test("rejects reserved command names", () => {
    const result = validateAlias("list");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("reserved");

    expect(validateAlias("all").valid).toBe(false);
    expect(validateAlias("claude").valid).toBe(false);
    expect(validateAlias("codex").valid).toBe(false);
  });

  test("rejects purely numeric aliases", () => {
    const result = validateAlias("42");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("numeric");
  });

  test("rejects too-short aliases", () => {
    const result = validateAlias("a");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("2 characters");
  });

  test("rejects invalid characters", () => {
    const result = validateAlias("Work");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("lowercase");

    const result2 = validateAlias("my_team");
    expect(result2.valid).toBe(false);

    const result3 = validateAlias("my team");
    expect(result3.valid).toBe(false);
  });

  test("rejects aliases starting with number or hyphen", () => {
    const result = validateAlias("2work");
    expect(result.valid).toBe(false);

    const result2 = validateAlias("-work");
    expect(result2.valid).toBe(false);
  });
});

describe("validateAccountNumber", () => {
  test("accepts numeric account numbers", () => {
    expect(validateAccountNumber("1")).toBe(true);
    expect(validateAccountNumber("42")).toBe(true);
  });

  test("rejects non-numeric account numbers", () => {
    expect(validateAccountNumber("1a")).toBe(false);
    expect(validateAccountNumber("../1")).toBe(false);
    expect(validateAccountNumber("1/2")).toBe(false);
    expect(validateAccountNumber("")).toBe(false);
  });
});
