import type { ValidatorRunner } from "./types.ts";
import { createJudgeClient } from "./judge-client.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("validator:llm-judge");

interface LlmJudgeSpec {
  type: "llm_judge";
  criteria: string[];
  rubric?: string;
  pass_threshold: number;
  weight: number;
  description?: string;
}

export const llmJudgeRunner: ValidatorRunner<LlmJudgeSpec> = {
  type: "llm_judge",
  async run(spec, ctx) {
    const judge = ctx.loaded.config.judge;
    if (!judge) {
      return { passed: false, message: "llm_judge requires `judge` config block" };
    }

    const client = createJudgeClient(judge);
    const prompt = buildPrompt({
      caseName: ctx.evalCase.name ?? ctx.evalCase.id,
      casePrompt: ctx.evalCase.prompt,
      reference: ctx.evalCase.reference_answer,
      rubric: spec.rubric ?? judge.rubric,
      criteria: spec.criteria,
      agentText: ctx.agentRun.text,
      scoring: judge.scoring,
    });

    let response;
    try {
      response = await client.complete({ prompt, signal: ctx.signal });
    } catch (err) {
      return {
        passed: false,
        message: `judge call failed: ${(err as Error).message}`,
      };
    }

    const parsed = parseJudgeOutput(response.text);
    if (!parsed) {
      log.warn("failed to parse judge output", {
        case: ctx.evalCase.id,
        text: response.text.slice(0, 200),
      });
      return {
        passed: false,
        message: "judge output could not be parsed as JSON",
        details: {
          raw: response.text.slice(0, 1000),
          judge_tokens: response.usage,
          judge_duration_ms: response.durationMs,
        },
      };
    }

    const scale = judge.scoring?.scale ?? 10;
    const passThreshold = judge.scoring?.pass_threshold ?? 6;
    const score = clamp(parsed.score, 0, scale);
    const passed = score >= passThreshold;
    return {
      passed,
      score,
      message: parsed.summary ?? `judge score ${score}`,
      details: {
        score,
        breakdown: parsed.breakdown,
        rationale: parsed.rationale,
        judge_tokens: response.usage,
        judge_duration_ms: response.durationMs,
      },
    };
  },
};

interface PromptArgs {
  caseName: string;
  casePrompt: string;
  reference?: string;
  rubric?: string;
  criteria: string[];
  agentText: string;
  scoring?: { dimensions: { name: string; weight: number; description?: string }[]; scale: number; pass_threshold: number };
}

function buildPrompt(args: PromptArgs): string {
  const dims =
    args.scoring?.dimensions ??
    args.criteria.map((name) => ({ name, weight: 1, description: undefined as string | undefined }));
  const scale = args.scoring?.scale ?? 10;
  const dimList = dims
    .map((d) => `- ${d.name}${d.description ? `: ${d.description}` : ""} (weight=${d.weight})`)
    .join("\n");

  return `You are an evaluation judge. Score the agent response against the task.

Case: ${args.caseName}
Task prompt:
${fence(args.casePrompt)}

${args.reference ? `Reference answer:\n${fence(args.reference)}\n` : ""}${args.rubric ? `Rubric:\n${args.rubric}\n` : ""}
Scoring dimensions (each scored 0..${scale}):
${dimList}

Agent response:
${fence(args.agentText || "(empty)")}

Reply with ONLY a JSON object on a single block, no prose:
{
  "score": <weighted overall, 0..${scale}>,
  "summary": "<one short line>",
  "breakdown": { ${dims.map((d) => `"${d.name}": <0..${scale}>`).join(", ")} },
  "rationale": "<2-4 sentence justification>"
}`;
}

function fence(s: string): string {
  return "```\n" + s.replace(/```/g, "``​`") + "\n```";
}

interface JudgeOutput {
  score: number;
  summary?: string;
  breakdown?: Record<string, number>;
  rationale?: string;
}

function parseJudgeOutput(text: string): JudgeOutput | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  const slice = text.slice(start, end + 1);
  try {
    const json = JSON.parse(slice) as Partial<JudgeOutput>;
    if (typeof json.score !== "number") return null;
    return {
      score: json.score,
      summary: typeof json.summary === "string" ? json.summary : undefined,
      breakdown: (json.breakdown as Record<string, number> | undefined) ?? undefined,
      rationale: typeof json.rationale === "string" ? json.rationale : undefined,
    };
  } catch {
    return null;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
