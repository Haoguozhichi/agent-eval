import { Hono } from "hono";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const RESULTS_DIR = process.env.AGENT_EVAL_RESULTS_DIR ?? resolve(process.cwd(), "results");

export const filesRoutes = new Hono();

// List files in a case's workspace
filesRoutes.get("/:runId/cases/:caseId/files", async (c) => {
  const { runId, caseId } = c.req.param();
  const wsDir = join(RESULTS_DIR, runId, "cases", caseId, "workspace");
  try {
    const files = await walkDir(wsDir, "");
    return c.json(files);
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});

// Get a specific file's content
filesRoutes.get("/:runId/cases/:caseId/files/*", async (c) => {
  const { runId, caseId } = c.req.param();
  const filePath = c.req.path.replace(
    `/api/files/${runId}/cases/${caseId}/files/`,
    "",
  );
  const fullPath = join(RESULTS_DIR, runId, "cases", caseId, "workspace", filePath);

  // Security: prevent path traversal
  const resolved = resolve(fullPath);
  const base = resolve(RESULTS_DIR, runId, "cases", caseId, "workspace");
  if (!resolved.startsWith(base)) {
    return c.json({ error: "forbidden" }, 403);
  }

  try {
    const st = await stat(resolved);
    if (!st.isFile()) return c.json({ error: "not a file" }, 400);
    const content = await readFile(resolved, "utf-8");
    return c.json({ path: filePath, content, size: st.size });
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

async function walkDir(dir: string, rel: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  const items = await readdir(dir);
  for (const item of items) {
    const full = join(dir, item);
    const relPath = rel ? `${rel}/${item}` : item;
    const st = await stat(full);
    if (st.isDirectory()) {
      entries.push({ name: item, path: relPath, type: "directory" });
      const children = await walkDir(full, relPath);
      entries.push(...children);
    } else {
      entries.push({ name: item, path: relPath, type: "file", size: st.size });
    }
  }
  return entries;
}
