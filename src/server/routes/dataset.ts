import { Hono } from "hono";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const DATA_DIR = process.env.AGENT_EVAL_DATA_DIR ?? resolve(process.cwd(), "data");

export const datasetRoutes = new Hono();

function datasetPath(): string {
  return join(DATA_DIR, "dataset.json");
}

datasetRoutes.get("/", async (c) => {
  try {
    const raw = await readFile(datasetPath(), "utf-8");
    return c.json(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return c.json(defaultDataset());
    }
    return c.json({ error: (err as Error).message }, 500);
  }
});

datasetRoutes.put("/", async (c) => {
  const body = await c.req.json();
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(datasetPath(), JSON.stringify(body, null, 2), "utf-8");
  return c.json({ ok: true });
});

datasetRoutes.post("/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return c.json({ error: "no file provided" }, 400);
  }
  const text = await file.text();
  try {
    JSON.parse(text); // validate JSON
  } catch {
    return c.json({ error: "invalid JSON file" }, 400);
  }
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(datasetPath(), text, "utf-8");
  return c.json({ ok: true });
});

function defaultDataset() {
  return {
    version: "1",
    name: "my-dataset",
    cases: [],
  };
}
