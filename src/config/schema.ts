import { z } from "zod";

const opencodeConfigSchema = z.object({
  model: z.string().min(1),
  provider: z.record(z.string(), z.unknown()).default({}),
  mcp: z.record(z.string(), z.unknown()).default({}),
  skills: z.record(z.string(), z.unknown()).default({}),
  permission: z.record(z.string(), z.unknown()).default({}),
  extra: z.record(z.string(), z.unknown()).optional(),
});

const executionConfigSchema = z.object({
  concurrency: z.number().int().positive().default(4),
  case_timeout_ms: z.number().int().positive().default(300_000),
  global_timeout_ms: z.number().int().positive().default(3_600_000),
  retries: z.number().int().min(0).max(5).default(0),
  fail_fast: z.boolean().default(false),
});

const scoringDimensionSchema = z.object({
  name: z.string().min(1),
  weight: z.number().min(0).default(1),
  description: z.string().optional(),
});

const scoringConfigSchema = z.object({
  scale: z.number().int().positive().default(10),
  pass_threshold: z.number().min(0).default(6),
  dimensions: z.array(scoringDimensionSchema).min(1),
});

const judgeConfigSchema = z
  .object({
    type: z.enum(["anthropic", "openai_compatible"]).default("openai_compatible"),
    model: z.string().min(1),
    base_url: z.string().url().optional(),
    api_key: z.string().optional(),
    api_key_env: z.string().optional(),
    temperature: z.number().min(0).max(2).default(0),
    rubric: z.string().optional(),
    max_tokens: z.number().int().positive().default(8192),
    extra_headers: z.record(z.string(), z.string()).default({}),
    scoring: scoringConfigSchema,
  })
  .superRefine((v, ctx) => {
    if (v.type === "openai_compatible" && !v.base_url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "openai_compatible judge requires `base_url`",
        path: ["base_url"],
      });
    }
  });

export const evalConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  opencode: opencodeConfigSchema,
  execution: executionConfigSchema.default({}),
  judge: judgeConfigSchema.optional(),
  dataset: z.string().min(1).default("./dataset.json"),
});

export type EvalConfig = z.infer<typeof evalConfigSchema>;
export type OpenCodeConfig = z.infer<typeof opencodeConfigSchema>;
export type ExecutionConfig = z.infer<typeof executionConfigSchema>;
export type JudgeConfig = z.infer<typeof judgeConfigSchema>;
export type ScoringConfig = z.infer<typeof scoringConfigSchema>;
export type ScoringDimension = z.infer<typeof scoringDimensionSchema>;
