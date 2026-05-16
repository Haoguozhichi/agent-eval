import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("init");

export async function initProject(targetDir: string): Promise<void> {
  const root = resolve(process.cwd(), targetDir);
  await mkdir(root, { recursive: true });
  await mkdir(join(root, "workspace"), { recursive: true });
  await mkdir(join(root, "results"), { recursive: true });

  const configPath = join(root, "eval.config.json");
  const datasetPath = join(root, "dataset.json");
  const gitignorePath = join(root, ".gitignore");

  if (!existsSync(configPath)) await writeFile(configPath, EXAMPLE_CONFIG, "utf-8");
  if (!existsSync(datasetPath)) await writeFile(datasetPath, EXAMPLE_DATASET, "utf-8");
  if (!existsSync(gitignorePath)) await writeFile(gitignorePath, "results/\nnode_modules/\n", "utf-8");

  log.info("project initialized", { dir: root });
  console.log(`\nNext steps:
  1. Set ANTHROPIC_API_KEY (or your provider's key)
  2. Run: agent-eval validate -c ${configPath}
  3. Run: agent-eval run --local -c ${configPath}\n`);
}

const EXAMPLE_CONFIG = `${JSON.stringify(
  {
    name: "example-eval",
    description: "Example evaluation suite",
    opencode: {
      model: "anthropic/claude-sonnet-4-5-20250929",
      provider: { anthropic: { api_key_env: "ANTHROPIC_API_KEY" } },
      mcp: {},
      skills: [],
      permission: { bash: { "*": "allow" }, write: { "*": "allow" } },
    },
    sandbox: {
      mode: "local",
      image: "agent-eval/opencode:latest",
      timeout_ms: 300000,
      memory_limit: "2g",
      cpu_limit: "2",
    },
    execution: {
      concurrency: 2,
      case_timeout_ms: 180000,
      global_timeout_ms: 1800000,
    },
    judge: {
      type: "openai_compatible",
      model: "gpt-4o-mini",
      base_url: "https://api.openai.com/v1",
      api_key_env: "OPENAI_API_KEY",
      temperature: 0,
    },
    dataset: "./dataset.json",
    workspace: "./workspace",
    output_dir: "./results",
  },
  null,
  2,
)}\n`;

const EXAMPLE_DATASET = `${JSON.stringify(
  {
    version: "1",
    name: "example-dataset",
    cases: [
      {
        id: "tc-001",
        name: "create hello.ts",
        type: "pass_fail",
        prompt: "Create hello.ts that exports a greet(name) function returning `Hello, ${name}!`.",
        validators: [
          { type: "file_exists", path: "hello.ts" },
        ],
      },
    ],
  },
  null,
  2,
)}\n`;
