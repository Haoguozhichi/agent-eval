export { loadConfig } from "./config/loader.ts";
export { evalConfigSchema } from "./config/schema.ts";
export type {
  EvalConfig,
  OpenCodeConfig,
  ExecutionConfig,
  JudgeConfig,
  ScoringConfig,
  ScoringDimension,
} from "./config/types.ts";

export { loadDataset } from "./dataset/parser.ts";
export { datasetSchema, evalCaseSchema, validatorSchema } from "./dataset/schema.ts";
export type {
  Dataset,
  EvalCase,
  Validator,
} from "./dataset/types.ts";

export type {
  CaseResult,
  CaseStatus,
  RunResult,
  RunSummary,
  RunMetadata,
  ValidatorResult,
  ExecutionContext,
} from "./runner/types.ts";

export type {
  TokenUsage,
  ToolCallStats,
  CaseMetrics,
} from "./runner/metrics.ts";

export { runEvaluation, type CaseProgressCallback } from "./runner/orchestrator.ts";
