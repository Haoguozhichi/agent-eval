import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunResult } from "../runner/types.ts";
import type { Reporter } from "./types.ts";

export const jsonReporter: Reporter = {
  async write(outputDir, result) {
    await mkdir(outputDir, { recursive: true });
    const path = join(outputDir, "results.json");
    await writeFile(path, JSON.stringify(result, null, 2), "utf-8");
    return path;
  },
};

export async function writeJsonResult(outputDir: string, result: RunResult): Promise<string> {
  return jsonReporter.write(outputDir, result);
}
