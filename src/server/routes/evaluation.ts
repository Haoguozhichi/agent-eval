import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { resolve, join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { loadConfig } from "../../config/loader.ts";
import { loadDataset } from "../../dataset/parser.ts";
import { runEvaluation, type CaseProgressCallback } from "../../runner/orchestrator.ts";
import { writeReports } from "../../reporter/index.ts";
import { state, resetState } from "../state.ts";
import { sseBus } from "../sse.ts";

const DATA_DIR = process.env.AGENT_EVAL_DATA_DIR ?? resolve(process.cwd(), "data");
const RESULTS_DIR = process.env.AGENT_EVAL_RESULTS_DIR ?? resolve(process.cwd(), "results");

export const evaluationRoutes = new Hono();

evaluationRoutes.post("/", async (c) => {
  if (state.status === "running") {
    return c.json({ error: "evaluation already running" }, 409);
  }

  resetState();
  state.status = "running";
  const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  state.currentRunId = runId;
  state.abortController = new AbortController();

  // Run evaluation in background
  runEval(runId, state.abortController.signal).catch(() => {});

  return c.json({ run_id: runId });
});

evaluationRoutes.get("/status", (c) => {
  return c.json({
    status: state.status,
    run_id: state.currentRunId,
    error: state.error,
    progress: state.progress,
  });
});

evaluationRoutes.post("/abort", (c) => {
  if (state.status !== "running" || !state.abortController) {
    return c.json({ error: "no running evaluation" }, 400);
  }
  state.abortController.abort();
  state.status = "idle";
  sseBus.send("run.error", { message: "aborted by user" });
  return c.json({ ok: true });
});

evaluationRoutes.get("/events", (c) => {
  return streamSSE(c, async (stream) => {
    const listener = (evt: { type: string; data: Record<string, unknown> }) => {
      stream.writeSSE({ data: JSON.stringify({ type: evt.type, ...evt.data }) });
    };
    sseBus.on("message", listener);

    // Keep alive
    const keepAlive = setInterval(() => {
      stream.writeSSE({ data: JSON.stringify({ type: "ping" }) });
    }, 15000);

    stream.onAbort(() => {
      sseBus.off("message", listener);
      clearInterval(keepAlive);
    });

    // Block until client disconnects
    await new Promise<void>((resolve) => {
      stream.onAbort(resolve);
    });
  });
});

async function runEval(runId: string, signal: AbortSignal): Promise<void> {
  try {
    const configPath = join(DATA_DIR, "eval.config.json");
    const loaded = await loadConfig(configPath);

    // In local (non-Docker) mode, replace host.docker.internal with 127.0.0.1
    const configStr = JSON.stringify(loaded.config);
    const fixed = configStr.replace(/host\.docker\.internal/g, "127.0.0.1");
    Object.assign(loaded.config, JSON.parse(fixed));

    // Override output dir to include run ID
    const outputDir = join(RESULTS_DIR, runId);
    loaded.outputDir = outputDir;

    const parsed = await loadDataset(loaded.datasetPath);
    state.progress.total = parsed.dataset.cases.length;

    sseBus.send("run.started", { run_id: runId, total: parsed.dataset.cases.length });

    const result = await runEvaluation(loaded, parsed, {
      onCaseStart: (caseId, index) => {
        sseBus.send("case.started", { id: caseId, index });
      },
      onCaseComplete: (caseResult, index) => {
        state.progress.completed += 1;
        if (caseResult.status === "passed") state.progress.passed += 1;
        else if (caseResult.status !== "skipped") state.progress.failed += 1;

        sseBus.send("case.completed", {
          id: caseResult.id,
          name: caseResult.name,
          status: caseResult.status,
          duration: caseResult.duration,
          tokens: caseResult.metrics.tokens.total,
          tool_calls: caseResult.metrics.tool_calls.total,
          index,
        });
      },
    });

    // Always write reports (even if some cases errored/timed out)
    try {
      await writeReports(outputDir, result);
    } catch (writeErr) {
      console.error("failed to write reports:", (writeErr as Error).message);
    }

    state.status = "completed";
    state.lastResult = result;
    sseBus.send("run.completed", {
      run_id: runId,
      summary: result.summary,
      output_dir: outputDir,
    });
  } catch (err) {
    state.status = "error";
    state.error = (err as Error).message;
    sseBus.send("run.error", { message: (err as Error).message });
  }
}
