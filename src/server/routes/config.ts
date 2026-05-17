import { Hono } from "hono";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const DATA_DIR = process.env.AGENT_EVAL_DATA_DIR ?? resolve(process.cwd(), "data");

export const configRoutes = new Hono();

function configPath(): string {
  return join(DATA_DIR, "eval.config.json");
}

configRoutes.get("/", async (c) => {
  try {
    const raw = await readFile(configPath(), "utf-8");
    return c.json(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return c.json(defaultConfig());
    }
    return c.json({ error: (err as Error).message }, 500);
  }
});

configRoutes.put("/", async (c) => {
  const body = await c.req.json();
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(configPath(), JSON.stringify(body, null, 2), "utf-8");
  return c.json({ ok: true });
});

function defaultConfig() {
  return {
    name: "my-eval",
    description: "",
    opencode: {
      model: "lmstudio/qwen3.5-9b",
      provider: {
        lmstudio: {
          npm: "@ai-sdk/openai-compatible",
          name: "LM Studio",
          options: { baseURL: "http://host.docker.internal:1234/v1", apiKey: "empty" },
          models: { "qwen3.5-9b": {} },
        },
      },
      mcp: {},
      skills: [],
      permission: { bash: { "*": "allow" }, write: { "*": "allow" } },
    },
    execution: { concurrency: 2, case_timeout_ms: 300000, global_timeout_ms: 3600000 },
    dataset: "./dataset.json",
  };
}
