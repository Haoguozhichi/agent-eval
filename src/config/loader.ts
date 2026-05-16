import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { evalConfigSchema, type EvalConfig } from "./schema.ts";

export interface LoadedConfig {
  config: EvalConfig;
  configPath: string;
  baseDir: string;
  datasetPath: string;
  workspacePath: string | null;
  outputDir: string;
}

export async function loadConfig(configPath: string): Promise<LoadedConfig> {
  const absConfigPath = resolve(process.cwd(), configPath);
  const raw = await readFile(absConfigPath, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Invalid JSON in config file ${absConfigPath}: ${(err as Error).message}`,
    );
  }

  let config: EvalConfig;
  try {
    config = evalConfigSchema.parse(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(
        `Config validation failed for ${absConfigPath}:\n${formatZodError(err)}`,
      );
    }
    throw err;
  }

  const baseDir = dirname(absConfigPath);
  const datasetPath = resolveRelative(config.dataset, baseDir);
  const workspacePath = config.workspace
    ? resolveRelative(config.workspace, baseDir)
    : null;
  const outputDir = resolveRelative(config.output_dir, baseDir);

  return { config, configPath: absConfigPath, baseDir, datasetPath, workspacePath, outputDir };
}

export function resolveRelative(path: string, baseDir: string): string {
  return isAbsolute(path) ? path : resolve(baseDir, path);
}

export function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((issue) => `  - ${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("\n");
}
