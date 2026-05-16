import type { RunResult } from "../runner/types.ts";

export interface Reporter {
  write(outputDir: string, result: RunResult): Promise<string>;
}
