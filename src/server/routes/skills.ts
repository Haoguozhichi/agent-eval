import { Hono } from "hono";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const DATA_DIR = process.env.AGENT_EVAL_DATA_DIR ?? resolve(process.cwd(), "data");

export const skillsRoutes = new Hono();

function skillsDir(): string {
  return join(DATA_DIR, "skills");
}

// List available skills
skillsRoutes.get("/", async (c) => {
  try {
    const dir = skillsDir();
    const entries = await readdir(dir);
    const skills = entries
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ name: f.replace(/\.md$/, ""), file: f }));
    return c.json(skills);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return c.json([]);
    }
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Get skill content
skillsRoutes.get("/:name", async (c) => {
  const name = c.req.param("name");
  const filePath = join(skillsDir(), `${name}.md`);
  // Security: prevent path traversal
  const resolved = resolve(filePath);
  if (!resolved.startsWith(resolve(skillsDir()))) {
    return c.json({ error: "forbidden" }, 403);
  }
  try {
    const content = await readFile(resolved, "utf-8");
    return c.json({ name, content });
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});
