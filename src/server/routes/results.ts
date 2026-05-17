import { Hono } from "hono";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const RESULTS_DIR = process.env.AGENT_EVAL_RESULTS_DIR ?? resolve(process.cwd(), "results");

export const resultsRoutes = new Hono();

// List all historical runs
resultsRoutes.get("/", async (c) => {
  try {
    const entries = await readdir(RESULTS_DIR);
    const runs: { id: string; timestamp: string; status: string; summary?: unknown }[] = [];

    for (const entry of entries) {
      const dir = join(RESULTS_DIR, entry);
      const st = await stat(dir).catch(() => null);
      if (!st?.isDirectory()) continue;

      const resultsFile = join(dir, "results.json");
      try {
        const raw = await readFile(resultsFile, "utf-8");
        const data = JSON.parse(raw);
        runs.push({
          id: entry,
          timestamp: data.metadata?.timestamp ?? entry,
          status: "completed",
          summary: data.summary,
        });
      } catch {
        // No results.json yet — run might be in progress or failed to write
        const casesDir = join(dir, "cases");
        const hasCases = await stat(casesDir).then(() => true).catch(() => false);
        runs.push({
          id: entry,
          timestamp: entry,
          status: hasCases ? "incomplete" : "empty",
        });
      }
    }

    runs.sort((a, b) => b.id.localeCompare(a.id));
    return c.json(runs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return c.json([]);
    }
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Get a specific run's results.json
resultsRoutes.get("/:runId", async (c) => {
  const runId = c.req.param("runId");
  const filePath = join(RESULTS_DIR, runId, "results.json");
  try {
    const raw = await readFile(filePath, "utf-8");
    return c.json(JSON.parse(raw));
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});

// Get a specific run's report.md
resultsRoutes.get("/:runId/report", async (c) => {
  const runId = c.req.param("runId");
  const filePath = join(RESULTS_DIR, runId, "report.md");
  try {
    const raw = await readFile(filePath, "utf-8");
    return c.text(raw);
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});

// Get messages.json for a case
resultsRoutes.get("/:runId/cases/:caseId/messages", async (c) => {
  const { runId, caseId } = c.req.param();
  const filePath = join(RESULTS_DIR, runId, "cases", caseId, "messages.json");
  try {
    const raw = await readFile(filePath, "utf-8");
    return c.json(JSON.parse(raw));
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});
