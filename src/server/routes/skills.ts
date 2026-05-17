import { Hono } from "hono";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const DATA_DIR = process.env.AGENT_EVAL_DATA_DIR ?? resolve(process.cwd(), "data");

export const skillsRoutes = new Hono();

function skillsDir(): string {
  return join(DATA_DIR, "skills");
}

// List available skills (each skill is a subdirectory)
skillsRoutes.get("/", async (c) => {
  try {
    const dir = skillsDir();
    const entries = await readdir(dir);
    const skills: { name: string; hasMain: boolean }[] = [];
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const entryPath = join(dir, entry);
      const st = await stat(entryPath).catch(() => null);
      if (st?.isDirectory()) {
        const mainFile = join(entryPath, "skill.md");
        const hasMain = await stat(mainFile).then(() => true).catch(() => false);
        skills.push({ name: entry, hasMain });
      }
    }
    return c.json(skills);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return c.json([]);
    }
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Get skill details (file list + main content)
skillsRoutes.get("/:name", async (c) => {
  const name = c.req.param("name");
  const skillPath = join(skillsDir(), name);
  // Security: prevent path traversal
  const resolved = resolve(skillPath);
  if (!resolved.startsWith(resolve(skillsDir()))) {
    return c.json({ error: "forbidden" }, 403);
  }
  try {
    const st = await stat(resolved);
    if (!st.isDirectory()) return c.json({ error: "not a skill directory" }, 404);
    const files = await listFiles(resolved, "");
    let mainContent = "";
    try {
      mainContent = await readFile(join(resolved, "skill.md"), "utf-8");
    } catch {}
    return c.json({ name, files, mainContent });
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});

async function listFiles(dir: string, rel: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await readdir(dir);
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const relPath = rel ? `${rel}/${entry}` : entry;
    const st = await stat(full);
    if (st.isDirectory()) {
      const children = await listFiles(full, relPath);
      result.push(...children);
    } else {
      result.push(relPath);
    }
  }
  return result;
}
