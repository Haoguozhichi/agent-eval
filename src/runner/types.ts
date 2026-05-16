import type { EvalCase, Validator } from "../dataset/types.ts";
import type { EvalConfig } from "../config/types.ts";
import type { CaseMetrics, TokenUsage, ToolCallStats } from "./metrics.ts";

export type CaseStatus = "passed" | "failed" | "errored" | "timeout" | "skipped";

export interface ValidatorResult {
  type: Validator["type"];
  passed: boolean;
  score?: number;
  weight: number;
  message: string;
  details?: Record<string, unknown>;
  duration_ms: number;
}

export interface CaseResult {
  id: string;
  name: string;
  type: EvalCase["type"];
  status: CaseStatus;
  score?: number;
  duration_ms: number;
  started_at: string;
  finished_at: string;
  validators: ValidatorResult[];
  agent_output_summary: string;
  error: string | null;
  metrics: CaseMetrics;
  attempt: number;
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  timeout: number;
  skipped: number;
  pass_rate: number;
  average_score: number | null;
  total_tokens: TokenUsage;
  total_tool_calls: ToolCallStats;
  total_messages: number;
}

export interface RunMetadata {
  eval_name: string;
  description?: string;
  timestamp: string;
  duration_ms: number;
  config: {
    model: string;
    concurrency: number;
    sandbox_mode: "docker" | "local";
    judge_model?: string;
  };
  agent_eval_version: string;
}

export interface RunResult {
  metadata: RunMetadata;
  summary: RunSummary;
  cases: CaseResult[];
}

export interface ExecutionContext {
  config: EvalConfig;
  baseDir: string;
  outputDir: string;
  workspacePath: string | null;
  case: EvalCase;
  caseIndex: number;
  totalCases: number;
  signal: AbortSignal;
}
