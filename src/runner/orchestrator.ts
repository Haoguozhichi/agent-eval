import pLimit from "p-limit";
import type { LoadedConfig } from "../config/loader.ts";
import type { ParsedDataset } from "../dataset/parser.ts";
import { createSandboxProvider } from "../sandbox/manager.ts";
import { createLogger } from "../utils/logger.ts";
import { Timer, nowIso, formatDurationHuman } from "../utils/timer.ts";
import {
  addTokenUsage,
  emptyToolCallStats,
  emptyTokenUsage,
} from "./metrics.ts";
import type { TokenUsage, ToolCallStats } from "./metrics.ts";
import { executeCase } from "./executor.ts";
import type { CaseResult, RunResult } from "./types.ts";

const log = createLogger("orchestrator");

export async function runEvaluation(
  loaded: LoadedConfig,
  parsed: ParsedDataset,
): Promise<RunResult> {
  const provider = createSandboxProvider(loaded.config);
  const limit = pLimit(loaded.config.execution.concurrency);
  const controller = new AbortController();
  const globalTimer = new Timer();
  const startTs = nowIso();

  const globalTimeout = setTimeout(
    () => controller.abort(),
    loaded.config.execution.global_timeout_ms,
  );

  const cleanup = async () => {
    controller.abort();
    await provider.shutdown().catch(() => undefined);
  };
  const onSig = () => {
    log.warn("received signal, shutting down");
    void cleanup();
  };
  process.once("SIGINT", onSig);
  process.once("SIGTERM", onSig);

  log.info("starting evaluation", {
    name: loaded.config.name,
    cases: parsed.dataset.cases.length,
    concurrency: loaded.config.execution.concurrency,
    sandbox: loaded.config.sandbox.mode,
  });

  const tasks = parsed.dataset.cases.map((c, idx) =>
    limit(async () => {
      log.info(`case start ${idx + 1}/${parsed.dataset.cases.length}`, { id: c.id });
      const result = await executeCase({ loaded, provider, outputDir: loaded.outputDir }, c, controller.signal);
      log.info(`case ${result.status}`, {
        id: c.id,
        duration_ms: result.duration_ms,
        tokens: result.metrics.tokens.total,
        tool_calls: result.metrics.tool_calls.total,
      });
      if (loaded.config.execution.fail_fast && result.status !== "passed" && result.status !== "skipped") {
        controller.abort();
      }
      return result;
    }),
  );

  let cases: CaseResult[] = [];
  try {
    const settled = await Promise.allSettled(tasks);
    cases = settled.map((s, idx) =>
      s.status === "fulfilled"
        ? s.value
        : {
            id: parsed.dataset.cases[idx]!.id,
            name: parsed.dataset.cases[idx]!.name ?? parsed.dataset.cases[idx]!.id,
            type: parsed.dataset.cases[idx]!.type,
            status: "errored" as const,
            duration_ms: 0,
            duration: "0ms",
            started_at: startTs,
            finished_at: nowIso(),
            validators: [],
            agent_output_summary: "",
            error: (s.reason as Error)?.message ?? "unknown error",
            metrics: { tokens: emptyTokenUsage(), tool_calls: emptyToolCallStats(), messages: 0 },
            attempt: 1,
          },
    );
  } finally {
    clearTimeout(globalTimeout);
    process.off("SIGINT", onSig);
    process.off("SIGTERM", onSig);
    await provider.shutdown().catch(() => undefined);
  }

  return assembleResult(loaded, parsed, cases, globalTimer.elapsedMs(), startTs);
}

function assembleResult(
  loaded: LoadedConfig,
  parsed: ParsedDataset,
  cases: CaseResult[],
  durationMs: number,
  startedAt: string,
): RunResult {
  const counts = {
    total: cases.length,
    passed: 0,
    failed: 0,
    errored: 0,
    timeout: 0,
    skipped: 0,
  };
  let totalTokens: TokenUsage = emptyTokenUsage();
  const totalToolCalls: ToolCallStats = emptyToolCallStats();
  let totalMessages = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  for (const c of cases) {
    counts[c.status as keyof typeof counts] += 1;
    totalTokens = addTokenUsage(totalTokens, c.metrics.tokens);
    totalToolCalls.total += c.metrics.tool_calls.total;
    totalToolCalls.errors += c.metrics.tool_calls.errors;
    for (const [tool, n] of Object.entries(c.metrics.tool_calls.by_tool)) {
      totalToolCalls.by_tool[tool] = (totalToolCalls.by_tool[tool] ?? 0) + n;
    }
    totalMessages += c.metrics.messages;
    if (typeof c.score === "number") {
      scoreSum += c.score;
      scoreCount += 1;
    }
  }

  const considered = counts.total - counts.skipped;
  const passRate = considered > 0 ? counts.passed / considered : 0;
  const averageScore = scoreCount > 0 ? scoreSum / scoreCount : null;

  return {
    metadata: {
      eval_name: loaded.config.name,
      description: loaded.config.description,
      timestamp: startedAt,
      duration_ms: durationMs,
      duration: formatDurationHuman(durationMs),
      config: {
        model: loaded.config.opencode.model,
        concurrency: loaded.config.execution.concurrency,
        sandbox_mode: loaded.config.sandbox.mode,
        judge_model: loaded.config.judge?.model,
      },
      agent_eval_version: "0.1.0",
    },
    summary: {
      total: counts.total,
      passed: counts.passed,
      failed: counts.failed,
      errored: counts.errored,
      timeout: counts.timeout,
      skipped: counts.skipped,
      pass_rate: Number(passRate.toFixed(4)),
      average_score: averageScore !== null ? Number(averageScore.toFixed(4)) : null,
      total_tokens: totalTokens,
      total_tool_calls: totalToolCalls,
      total_messages: totalMessages,
    },
    cases,
  };
}
