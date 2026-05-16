import type { RunResult } from "../runner/types.ts";
import { jsonReporter } from "./json-reporter.ts";
import { markdownReporter } from "./markdown-reporter.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("reporter");

export async function writeReports(outputDir: string, result: RunResult): Promise<{ json: string; markdown: string }> {
  const [json, markdown] = await Promise.all([
    jsonReporter.write(outputDir, result),
    markdownReporter.write(outputDir, result),
  ]);
  log.info("reports written", { json, markdown });
  return { json, markdown };
}

export { jsonReporter, markdownReporter };
