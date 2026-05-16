import { OpenCodeClient } from "../client/opencode.ts";
import type { AgentRunResult } from "../client/types.ts";
import type { EvalCase } from "../dataset/types.ts";
import type { LoadedConfig } from "../config/loader.ts";
import type { SandboxHandle, SandboxProvider } from "../sandbox/types.ts";
import { runValidators } from "../validator/engine.ts";
import { createLogger } from "../utils/logger.ts";
import { Timer, nowIso, formatDurationHuman } from "../utils/timer.ts";
import { withRetry } from "../utils/retry.ts";
import {
  emptyMetrics,
  finalizeTokens,
  recordToolCall,
  type CaseMetrics,
} from "./metrics.ts";
import type { CaseResult, CaseStatus, ValidatorResult } from "./types.ts";

const log = createLogger("executor");

export interface ExecutorDeps {
  loaded: LoadedConfig;
  provider: SandboxProvider;
}

export async function executeCase(
  deps: ExecutorDeps,
  evalCase: EvalCase,
  signal: AbortSignal,
): Promise<CaseResult> {
  const { loaded, provider } = deps;
  const retries = loaded.config.execution.retries;
  let attempt = 0;
  let lastResult: CaseResult | null = null;

  await withRetry(
    async () => {
      attempt += 1;
      lastResult = await runOnce(loaded, provider, evalCase, attempt, signal);
      if (lastResult.status === "errored") throw new Error(lastResult.error ?? "case errored");
    },
    {
      retries,
      signal,
      onAttempt: (n, err) => log.warn(`retry attempt ${n + 1}`, { err: (err as Error).message }),
    },
  ).catch(() => undefined);

  return lastResult ?? errorResult(evalCase, "execution did not produce a result", attempt);
}

async function runOnce(
  loaded: LoadedConfig,
  provider: SandboxProvider,
  evalCase: EvalCase,
  attempt: number,
  parentSignal: AbortSignal,
): Promise<CaseResult> {
  const timer = new Timer();
  const startedAt = nowIso();
  const metrics: CaseMetrics = emptyMetrics();
  const validatorResults: ValidatorResult[] = [];
  let agentText = "";
  let status: CaseStatus = "errored";
  let error: string | null = null;

  const caseTimeout = evalCase.timeout_ms ?? loaded.config.execution.case_timeout_ms;
  const caseController = new AbortController();
  const timeoutTimer = setTimeout(() => caseController.abort(), caseTimeout);
  const onParentAbort = () => caseController.abort();
  parentSignal.addEventListener("abort", onParentAbort, { once: true });

  let sandbox: SandboxHandle | null = null;
  let sessionId: string | null = null;
  let client: OpenCodeClient | null = null;

  try {
    sandbox = await provider.create(
      {
        caseId: evalCase.id,
        workspaceSrc: loaded.workspacePath,
        workspaceOverlay: evalCase.workspace_overlay
          ? resolvePath(evalCase.workspace_overlay, loaded.baseDir)
          : null,
        opencodeConfig: buildOpencodeConfig(loaded),
        env: collectEnvFromProvider(loaded),
        timeoutMs: caseTimeout,
      },
      caseController.signal,
    );

    client = new OpenCodeClient({
      baseUrl: `http://${sandbox.host}:${sandbox.port}`,
    });
    await client.waitReady(caseController.signal, 30_000);

    for (const cmd of evalCase.setup_commands) {
      const r = await sandbox.exec(cmd, { signal: caseController.signal, timeoutMs: 60_000 });
      if (r.exitCode !== 0) {
        throw new Error(`setup command failed (exit ${r.exitCode}): ${cmd}\n${r.stderr}`);
      }
    }

    const session = await client.createSession(`agent-eval/${evalCase.id}`, caseController.signal);
    sessionId = session.id;

    const run = await client.sendMessage(
      { sessionId, text: evalCase.prompt, signal: caseController.signal },
      {
        onMessageStart: () => {
          metrics.messages += 1;
        },
        onUsage: (usage) => {
          metrics.tokens = usage;
        },
        onToolCall: (call) => {
          recordToolCall(metrics.tool_calls, call.toolName, false);
        },
        onToolResult: (result) => {
          if (result.errored) metrics.tool_calls.errors += 1;
        },
      },
    );
    agentText = run.text;
    metrics.tokens = finalizeTokens(run.usage);
    if (metrics.messages === 0) metrics.messages = run.messages;

    // Populate tool_calls from the messages API result
    for (const call of run.toolCalls) {
      recordToolCall(metrics.tool_calls, call.toolName, false);
    }
    for (const result of run.toolResults) {
      if (result.errored) metrics.tool_calls.errors += 1;
    }

    for (const cmd of evalCase.teardown_commands) {
      await sandbox
        .exec(cmd, { signal: caseController.signal, timeoutMs: 60_000 })
        .catch((err) => log.warn("teardown failed", { case: evalCase.id, err: (err as Error).message }));
    }

    const validation = await runValidators({
      loaded,
      sandbox,
      evalCase,
      agentRun: run,
      signal: caseController.signal,
    });
    validatorResults.push(...validation.results);

    status = decideStatus(evalCase, validation.results);
    error = null;
    return finalize({
      evalCase,
      status,
      validatorResults,
      agentText,
      error,
      metrics,
      durationMs: timer.elapsedMs(),
      startedAt,
      attempt,
      score: validation.aggregateScore,
    });
  } catch (err) {
    if (caseController.signal.aborted && !parentSignal.aborted) {
      status = "timeout";
      error = `case exceeded timeout of ${caseTimeout}ms`;
    } else {
      status = "errored";
      error = (err as Error).message;
    }
    return finalize({
      evalCase,
      status,
      validatorResults,
      agentText,
      error,
      metrics,
      durationMs: timer.elapsedMs(),
      startedAt,
      attempt,
    });
  } finally {
    clearTimeout(timeoutTimer);
    parentSignal.removeEventListener("abort", onParentAbort);
    if (client && sessionId) {
      await client.deleteSession(sessionId).catch(() => undefined);
    }
    if (sandbox) {
      await sandbox.destroy().catch((err) =>
        log.warn("sandbox destroy failed", { case: evalCase.id, err: (err as Error).message }),
      );
    }
  }
}

interface FinalizeArgs {
  evalCase: EvalCase;
  status: CaseStatus;
  validatorResults: ValidatorResult[];
  agentText: string;
  error: string | null;
  metrics: CaseMetrics;
  durationMs: number;
  startedAt: string;
  attempt: number;
  score?: number | undefined;
}

function finalize(args: FinalizeArgs): CaseResult {
  return {
    id: args.evalCase.id,
    name: args.evalCase.name ?? args.evalCase.id,
    type: args.evalCase.type,
    status: args.status,
    score: args.score,
    duration_ms: args.durationMs,
    duration: formatDurationHuman(args.durationMs),
    started_at: args.startedAt,
    finished_at: nowIso(),
    validators: args.validatorResults,
    agent_output_summary: summarize(args.agentText),
    error: args.error,
    metrics: args.metrics,
    attempt: args.attempt,
  };
}

function errorResult(evalCase: EvalCase, message: string, attempt: number): CaseResult {
  return {
    id: evalCase.id,
    name: evalCase.name ?? evalCase.id,
    type: evalCase.type,
    status: "errored",
    duration_ms: 0,
    duration: "0ms",
    started_at: nowIso(),
    finished_at: nowIso(),
    validators: [],
    agent_output_summary: "",
    error: message,
    metrics: emptyMetrics(),
    attempt,
  };
}

function decideStatus(evalCase: EvalCase, results: ValidatorResult[]): CaseStatus {
  if (evalCase.type === "scoring") {
    return results.every((r) => r.passed || r.score !== undefined) ? "passed" : "failed";
  }
  if (results.length === 0) return "passed";
  return results.every((r) => r.passed) ? "passed" : "failed";
}

function summarize(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 800) return trimmed;
  return `${trimmed.slice(0, 400)}\n…\n${trimmed.slice(-300)}`;
}

function buildOpencodeConfig(loaded: LoadedConfig): Record<string, unknown> {
  const cfg = loaded.config.opencode;
  return {
    $schema: "https://opencode.ai/config.json",
    model: cfg.model,
    provider: cfg.provider,
    mcp: cfg.mcp,
    permission: cfg.permission,
    skills: cfg.skills,
    ...(cfg.extra ?? {}),
  };
}

function collectEnvFromProvider(loaded: LoadedConfig): Record<string, string> {
  const env: Record<string, string> = {};
  walkForEnv(loaded.config.opencode.provider, env);
  if (loaded.config.judge?.api_key_env) {
    const v = process.env[loaded.config.judge.api_key_env];
    if (v) env[loaded.config.judge.api_key_env] = v;
  }
  return env;
}

function walkForEnv(value: unknown, out: Record<string, string>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) walkForEnv(v, out);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if ((k === "api_key_env" || k === "apiKeyEnv") && typeof v === "string") {
      const resolved = process.env[v];
      if (resolved) out[v] = resolved;
    } else {
      walkForEnv(v, out);
    }
  }
}

function resolvePath(p: string, base: string): string {
  if (p.startsWith("/")) return p;
  return `${base}/${p}`;
}
