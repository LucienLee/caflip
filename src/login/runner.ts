// ABOUTME: Shared subprocess helpers for provider login orchestration.
// ABOUTME: Supports inherited-stdio login execution and captured output for provider verification.

import { spawn } from "child_process";
import type { CommandRunResult, LoginExecutionResult } from "./types";

const DEFAULT_CAPTURE_TIMEOUT_MS = 5000;

function normalizeOutput(value: string): string {
  return value.trim();
}

export async function runLoginCommand(command: string[]): Promise<LoginExecutionResult> {
  return await new Promise((resolve, reject) => {
    const proc = spawn(command[0], command.slice(1), {
      stdio: "inherit",
    });

    proc.on("error", (error) => {
      reject(error);
    });

    proc.on("close", (code, signal) => {
      resolve({
        exitCode: code ?? 1,
        signal,
      });
    });
  });
}

export async function runCapturedCommand(
  command: string[],
  options?: { timeoutMs?: number }
): Promise<CommandRunResult> {
  return await new Promise((resolve, reject) => {
    const proc = spawn(command[0], command.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeoutMs = options?.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS;
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal === "SIGTERM") {
        resolve({
          exitCode: 124,
          stdout: normalizeOutput(stdout),
          stderr: normalizeOutput(stderr) || `command timed out after ${timeoutMs}ms`,
          signal,
        });
        return;
      }
      resolve({
        exitCode: code ?? 1,
        stdout: normalizeOutput(stdout),
        stderr: normalizeOutput(stderr),
        signal,
      });
    });
  });
}
