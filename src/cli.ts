import picomatch from "picomatch";
import { Command } from "commander";
import { loadConfig } from "./config/loader.ts";
import { loadDataset } from "./dataset/parser.ts";
import { runEvaluation } from "./runner/orchestrator.ts";
import { regenerateReport } from "./reporter/regenerate.ts";
import { writeReports } from "./reporter/index.ts";
import { createLogger } from "./utils/logger.ts";
import { initProject } from "./scaffold/init.ts";
import { buildImage } from "./sandbox/build-image.ts";

const log = createLogger("cli");

interface RunOptions {
  config: string;
  local?: boolean;
  concurrency?: string;
  filter?: string;
  output?: string;
  failFast?: boolean;
  retries?: string;
}

interface ValidateOptions {
  config: string;
}

interface ReportOptions {
  input: string;
  output?: string;
}

interface BuildImageOptions {
  tag?: string;
  context?: string;
}

export function buildCli(): Command {
  const program = new Command();
  program
    .name("agent-eval")
    .description("End-to-end evaluation framework for opencode")
    .version("0.1.0");

  program
    .command("run")
    .description("Run an evaluation suite")
    .requiredOption("-c, --config <path>", "Path to eval.config.json", "./eval.config.json")
    .option("--local", "Use local sandbox (no Docker)")
    .option("-j, --concurrency <n>", "Override concurrency")
    .option("-f, --filter <glob>", "Filter cases by id (glob)")
    .option("-o, --output <dir>", "Override output directory")
    .option("--fail-fast", "Abort on first failure")
    .option("--retries <n>", "Override retries per case")
    .action(async (options: RunOptions) => {
      await runCommand(options);
    });

  program
    .command("validate")
    .description("Validate config and dataset without running")
    .requiredOption("-c, --config <path>", "Path to eval.config.json", "./eval.config.json")
    .action(async (options: ValidateOptions) => {
      await validateCommand(options);
    });

  program
    .command("report")
    .description("Regenerate Markdown report from a results.json")
    .requiredOption("-i, --input <path>", "Path to results.json")
    .option("-o, --output <path>", "Output path for report.md")
    .action(async (options: ReportOptions) => {
      await reportCommand(options);
    });

  program
    .command("init")
    .description("Scaffold a new evaluation project in the current directory")
    .option("-d, --dir <path>", "Target directory", ".")
    .action(async (options: { dir: string }) => {
      await initProject(options.dir);
    });

  program
    .command("build-image")
    .description("Build the default agent-eval Docker image")
    .option("-t, --tag <tag>", "Image tag", "agent-eval/opencode:latest")
    .option("--context <dir>", "Build context directory")
    .action(async (options: BuildImageOptions) => {
      await buildImage({
        tag: options.tag ?? "agent-eval/opencode:latest",
        context: options.context,
      });
    });

  return program;
}

async function runCommand(options: RunOptions): Promise<void> {
  const loaded = await loadConfig(options.config);
  if (options.concurrency) {
    const c = Number(options.concurrency);
    if (!Number.isFinite(c) || c <= 0) throw new Error(`invalid concurrency: ${options.concurrency}`);
    loaded.config.execution.concurrency = c;
  }
  if (options.failFast) loaded.config.execution.fail_fast = true;
  if (options.retries) {
    const r = Number(options.retries);
    if (!Number.isFinite(r) || r < 0) throw new Error(`invalid retries: ${options.retries}`);
    loaded.config.execution.retries = r;
  }
  if (options.output) loaded.outputDir = options.output;

  const parsed = await loadDataset(loaded.datasetPath);
  if (options.filter) {
    const isMatch = picomatch(options.filter);
    parsed.dataset.cases = parsed.dataset.cases.filter((c) => isMatch(c.id));
    if (parsed.dataset.cases.length === 0) {
      throw new Error(`filter "${options.filter}" matched no cases`);
    }
  }

  const result = await runEvaluation(loaded, parsed);
  await writeReports(loaded.outputDir, result);

  log.info("evaluation complete", {
    total: result.summary.total,
    passed: result.summary.passed,
    failed: result.summary.failed,
    errored: result.summary.errored,
    pass_rate: result.summary.pass_rate,
    total_tokens: result.summary.total_tokens.total,
    total_tool_calls: result.summary.total_tool_calls.total,
  });

  if (result.summary.failed + result.summary.errored + result.summary.timeout > 0) {
    process.exitCode = 1;
  }
}

async function validateCommand(options: ValidateOptions): Promise<void> {
  const loaded = await loadConfig(options.config);
  const parsed = await loadDataset(loaded.datasetPath);
  log.info("config and dataset valid", {
    name: loaded.config.name,
    cases: parsed.dataset.cases.length,
  });
}

async function reportCommand(options: ReportOptions): Promise<void> {
  await regenerateReport(options.input, options.output);
  log.info("report regenerated", { input: options.input, output: options.output });
}
