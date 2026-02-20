// ABOUTME: Validation utilities for email addresses, filename safety, and account aliases.
// ABOUTME: Guards against path traversal, reserved command conflicts, and invalid alias formats.

import { RESERVED_COMMANDS } from "./config";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const ALIAS_REGEX = /^[a-z][a-z0-9-]*$/;

export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function sanitizeEmailForFilename(email: string): boolean {
  if (!validateEmail(email)) return false;
  if (email.includes("..") || email.includes("/") || email.includes("\0")) {
    return false;
  }
  return true;
}

export interface AliasValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateAlias(alias: string): AliasValidationResult {
  if (alias.length < 2) {
    return { valid: false, reason: "Alias must be at least 2 characters" };
  }

  if (/^\d+$/.test(alias)) {
    return {
      valid: false,
      reason: "Alias cannot be purely numeric (would conflict with account numbers)",
    };
  }

  if (!ALIAS_REGEX.test(alias)) {
    return {
      valid: false,
      reason: "Alias must contain only lowercase letters, numbers, and hyphens, and start with a letter",
    };
  }

  if ((RESERVED_COMMANDS as readonly string[]).includes(alias)) {
    return { valid: false, reason: `"${alias}" is a reserved command name` };
  }

  return { valid: true };
}
