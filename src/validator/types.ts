import type { Validator } from "../dataset/types.ts";
import type { SandboxHandle } from "../sandbox/types.ts";
import type { LoadedConfig } from "../config/loader.ts";
import type { EvalCase } from "../dataset/types.ts";
import type { AgentRunResult } from "../client/types.ts";

export interface ValidatorContext {
  loaded: LoadedConfig;
  sandbox: SandboxHandle;
  evalCase: EvalCase;
  agentRun: AgentRunResult;
  signal: AbortSignal;
}

export interface ValidatorOutcome {
  passed: boolean;
  score?: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidatorRunner<T extends Validator = Validator> {
  type: T["type"];
  run(spec: T, ctx: ValidatorContext): Promise<ValidatorOutcome>;
}
