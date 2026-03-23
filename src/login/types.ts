// ABOUTME: Shared types for provider login orchestration and verification.
// ABOUTME: Defines provider-owned login adapter contracts used by the unified login flow.

export interface CommandRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  signal: NodeJS.Signals | null;
}

export interface LoginExecutionResult {
  exitCode: number;
  signal: NodeJS.Signals | null;
}

export interface LoginVerificationSuccess {
  ok: true;
  email: string;
  details?: Record<string, unknown>;
}

export interface LoginVerificationFailure {
  ok: false;
  reason: string;
  details?: Record<string, unknown>;
}

export type LoginVerificationResult =
  | LoginVerificationSuccess
  | LoginVerificationFailure;

export type CommandRunner = (command: string[]) => Promise<CommandRunResult>;

export interface ProviderLoginAdapter {
  buildCommand(passthroughArgs: string[]): string[];
  verifyLogin(commandRunner?: CommandRunner): Promise<LoginVerificationResult>;
}
