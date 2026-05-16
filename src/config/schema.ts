import { z } from "zod";

const providerCredentialSchema = z
  .object({
    api_key: z.string().optional(),
    api_key_env: z.string().optional(),
    base_url: z.string().url().optional(),
  })
  .passthrough();

const opencodeConfigSchema = z.object({
  model: z.string().min(1),
  provider: z.record(z.string(), z.unknown()).default({}),
  mcp: z.record(z.string(), z.unknown()).default({}),
  skills: z.record(z.string(), z.unknown()).default({}),
  permission: z.record(z.string(), z.unknown()).default({}),
  extra: z.record(z.string(), z.unknown()).optional(),
});

const sandboxConfigSchema = z.object({
  mode: z.enum(["docker", "local"]).default("docker"),
  image: z.string().default("agent-eval/opencode:latest"),
  timeout_ms: z.number().int().positive().default(300_000),
  memory_limit: z.string().default("2g"),
  cpu_limit: z.string().default("2"),
  port_range_start: z.number().int().min(1024).max(65000).default(14096),
  network: z.enum(["bridge", "host", "none"]).default("bridge"),
  env: z.record(z.string(), z.string()).default({}),
});

const executionConfigSchema = z.object({
  concurrency: z.number().int().positive().default(4),
  case_timeout_ms: z.number().int().positive().default(180_000),
  global_timeout_ms: z.number().int().positive().default(3_600_000),
  retries: z.number().int().min(0).max(5).default(0),
  fail_fast: z.boolean().default(false),
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
  sandbox: sandboxConfigSchema.default({}),
  execution: executionConfigSchema.default({}),
  judge: judgeConfigSchema.optional(),
  dataset: z.string().min(1),
  workspace: z.string().optional(),
  output_dir: z.string().default("./results"),
});

export type EvalConfig = z.infer<typeof evalConfigSchema>;
export type OpenCodeConfig = z.infer<typeof opencodeConfigSchema>;
export type SandboxConfig = z.infer<typeof sandboxConfigSchema>;
export type ExecutionConfig = z.infer<typeof executionConfigSchema>;
export type JudgeConfig = z.infer<typeof judgeConfigSchema>;
