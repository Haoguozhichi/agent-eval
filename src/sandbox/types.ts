import type { Readable } from "node:stream";

export type SandboxMode = "docker" | "local";

export interface SandboxSpec {
  caseId: string;
  workspaceSrc: string | null;
  workspaceOverlay: string | null;
  opencodeConfig: Record<string, unknown>;
  env: Record<string, string>;
  timeoutMs: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  shell?: string;
  signal?: AbortSignal;
  stdin?: string;
}

export interface SandboxHandle {
  readonly id: string;
  readonly host: string;
  readonly port: number;
  readonly workdir: string;
  readonly mode: SandboxMode;
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  followLogs?(): Readable;
  destroy(): Promise<void>;
}

export interface SandboxProvider {
  readonly mode: SandboxMode;
  create(spec: SandboxSpec, signal: AbortSignal): Promise<SandboxHandle>;
  shutdown(): Promise<void>;
}
