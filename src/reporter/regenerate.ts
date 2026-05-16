import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RunResult } from "../runner/types.ts";
import { renderMarkdown } from "./markdown-reporter.ts";

export async function regenerateReport(input: string, output?: string): Promise<string> {
  const raw = await readFile(input, "utf-8");
  const parsed = JSON.parse(raw) as RunResult;
  const md = renderMarkdown(parsed);
  const target = output ?? join(dirname(input), "report.md");
  await writeFile(target, md, "utf-8");
  return target;
}
