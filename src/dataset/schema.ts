import { z } from "zod";

const validatorBaseSchema = z.object({
  weight: z.number().min(0).default(1),
  description: z.string().optional(),
});

const fileExistsValidatorSchema = validatorBaseSchema.extend({
  type: z.literal("file_exists"),
  path: z.string().min(1),
  should_exist: z.boolean().default(true),
});

const fileDiffValidatorSchema = validatorBaseSchema.extend({
  type: z.literal("file_diff"),
  path: z.string().min(1),
  expected: z.string().optional(),
  expected_path: z.string().optional(),
  ignore_whitespace: z.boolean().default(false),
  ignore_trailing_newline: z.boolean().default(true),
});

const commandCheckValidatorSchema = validatorBaseSchema.extend({
  type: z.literal("command_check"),
  command: z.string().min(1),
  shell: z.string().default("/bin/sh"),
  expected_exit_code: z.number().int().default(0),
  expected_stdout: z.string().optional(),
  expected_stdout_regex: z.string().optional(),
  timeout_ms: z.number().int().positive().default(60_000),
  cwd: z.string().optional(),
});

const regexMatchValidatorSchema = validatorBaseSchema.extend({
  type: z.literal("regex_match"),
  path: z.string().min(1),
  pattern: z.string().min(1),
  flags: z.string().default(""),
  should_match: z.boolean().default(true),
});

const jsonMatchValidatorSchema = validatorBaseSchema.extend({
  type: z.literal("json_match"),
  path: z.string().min(1),
  expected: z.unknown(),
  expected_path: z.string().optional(),
  partial: z.boolean().default(false),
});

const scriptValidatorSchema = validatorBaseSchema.extend({
  type: z.literal("script"),
  script: z.string().min(1),
  shell: z.string().default("/bin/sh"),
  timeout_ms: z.number().int().positive().default(60_000),
  expected_exit_code: z.number().int().default(0),
});

const llmJudgeValidatorSchema = validatorBaseSchema.extend({
  type: z.literal("llm_judge"),
  criteria: z.array(z.string()).default([]),
  rubric: z.string().optional(),
});

export const validatorSchema = z.discriminatedUnion("type", [
  fileExistsValidatorSchema,
  fileDiffValidatorSchema,
  commandCheckValidatorSchema,
  regexMatchValidatorSchema,
  jsonMatchValidatorSchema,
  scriptValidatorSchema,
  llmJudgeValidatorSchema,
]);

const evalCaseBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  prompt: z.string().min(1),
  workspace_overlay: z.string().optional(),
  timeout_ms: z.number().int().positive().optional(),
  tags: z.array(z.string()).default([]),
  validators: z.array(validatorSchema).default([]),
  reference_answer: z.string().optional(),
  setup_commands: z.array(z.string()).default([]),
  teardown_commands: z.array(z.string()).default([]),
});

export const evalCaseSchema = evalCaseBaseSchema;

export const datasetSchema = z.object({
  version: z.string().default("1"),
  name: z.string().optional(),
  description: z.string().optional(),
  cases: z.array(evalCaseSchema).min(1),
});

export type Validator = z.infer<typeof validatorSchema>;
export type EvalCase = z.infer<typeof evalCaseSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
