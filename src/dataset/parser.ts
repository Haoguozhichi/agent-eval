import { readFile } from "node:fs/promises";
import { z } from "zod";
import { formatZodError } from "../config/loader.ts";
import { datasetSchema, type Dataset, type EvalCase } from "./schema.ts";

export interface ParsedDataset {
  dataset: Dataset;
  path: string;
}

export async function loadDataset(path: string): Promise<ParsedDataset> {
  const raw = await readFile(path, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in dataset ${path}: ${(err as Error).message}`);
  }

  let dataset: Dataset;
  try {
    dataset = datasetSchema.parse(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(
        `Dataset validation failed for ${path}:\n${formatZodError(err)}`,
      );
    }
    throw err;
  }

  ensureUniqueIds(dataset.cases, path);

  return { dataset, path };
}

function ensureUniqueIds(cases: EvalCase[], path: string): void {
  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id)) {
      throw new Error(`Duplicate case id "${c.id}" in dataset ${path}`);
    }
    seen.add(c.id);
  }
}
