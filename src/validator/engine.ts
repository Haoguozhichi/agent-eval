import type { ValidatorRunner } from "./types.ts";
import type { Validator } from "../dataset/types.ts";
import { Timer } from "../utils/timer.ts";
import { createLogger } from "../utils/logger.ts";
import { fileExistsRunner } from "./builtin/file-exists.ts";
import { fileDiffRunner } from "./builtin/file-diff.ts";
import { commandCheckRunner } from "./builtin/command-check.ts";
import { regexMatchRunner } from "./builtin/regex-match.ts";
import { jsonMatchRunner } from "./builtin/json-match.ts";
import { scriptRunner } from "./script.ts";
import { llmJudgeRunner } from "./llm-judge.ts";
import type { ValidatorContext } from "./types.ts";
import type { ValidatorResult } from "../runner/types.ts";

const log = createLogger("validator");

const REGISTRY: Record<Validator["type"], ValidatorRunner> = {
  file_exists: fileExistsRunner,
  file_diff: fileDiffRunner,
  command_check: commandCheckRunner,
  regex_match: regexMatchRunner,
  json_match: jsonMatchRunner,
  script: scriptRunner,
  llm_judge: llmJudgeRunner,
};

export interface ValidationOutcome {
  results: ValidatorResult[];
  aggregateScore?: number;
}

export async function runValidators(ctx: ValidatorContext): Promise<ValidationOutcome> {
  const results: ValidatorResult[] = [];
  for (const spec of ctx.evalCase.validators) {
    const timer = new Timer();
    const runner = REGISTRY[spec.type] as ValidatorRunner | undefined;
    if (!runner) {
      results.push({
        type: spec.type,
        passed: false,
        weight: spec.weight,
        message: `unknown validator type: ${spec.type}`,
        duration_ms: timer.elapsedMs(),
      });
      continue;
    }
    try {
      const out = await runner.run(spec as never, ctx);
      results.push({
        type: spec.type,
        passed: out.passed,
        score: out.score,
        weight: spec.weight,
        message: out.message,
        details: out.details,
        duration_ms: timer.elapsedMs(),
      });
    } catch (err) {
      log.warn("validator threw", { type: spec.type, err: (err as Error).message });
      results.push({
        type: spec.type,
        passed: false,
        weight: spec.weight,
        message: `validator error: ${(err as Error).message}`,
        duration_ms: timer.elapsedMs(),
      });
    }
  }

  if (ctx.evalCase.type === "scoring") {
    const aggregate = aggregateScore(results);
    return { results, aggregateScore: aggregate };
  }
  return { results };
}

function aggregateScore(results: ValidatorResult[]): number | undefined {
  let weighted = 0;
  let weightSum = 0;
  for (const r of results) {
    if (typeof r.score !== "number") continue;
    weighted += r.score * r.weight;
    weightSum += r.weight;
  }
  if (weightSum === 0) return undefined;
  return Number((weighted / weightSum).toFixed(4));
}
