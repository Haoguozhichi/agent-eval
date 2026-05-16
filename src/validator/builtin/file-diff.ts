import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ValidatorRunner } from "../types.ts";

export const fileDiffRunner: ValidatorRunner<{
  type: "file_diff";
  path: string;
  expected?: string;
  expected_path?: string;
  ignore_whitespace: boolean;
  ignore_trailing_newline: boolean;
  weight: number;
  description?: string;
}> = {
  type: "file_diff",
  async run(spec, ctx) {
    const exists = await ctx.sandbox.fileExists(spec.path);
    if (!exists) {
      return { passed: false, message: `file not found: ${spec.path}` };
    }
    const actualRaw = await ctx.sandbox.readFile(spec.path);
    let expectedRaw: string;
    if (spec.expected !== undefined) {
      expectedRaw = spec.expected;
    } else if (spec.expected_path) {
      const abs = resolve(ctx.loaded.baseDir, spec.expected_path);
      expectedRaw = await readFile(abs, "utf-8");
    } else {
      return { passed: false, message: "file_diff requires expected or expected_path" };
    }

    const actual = normalize(actualRaw, spec.ignore_whitespace, spec.ignore_trailing_newline);
    const expected = normalize(expectedRaw, spec.ignore_whitespace, spec.ignore_trailing_newline);
    const passed = actual === expected;
    return {
      passed,
      message: passed ? `${spec.path} matches expected` : `${spec.path} differs from expected`,
      details: passed ? undefined : { actual_preview: preview(actual), expected_preview: preview(expected) },
    };
  },
};

function normalize(s: string, ignoreWs: boolean, ignoreTrailingNewline: boolean): string {
  let out = s;
  if (ignoreWs) out = out.replace(/\s+/g, " ").trim();
  if (ignoreTrailingNewline) out = out.replace(/\n+$/, "");
  return out;
}

function preview(s: string): string {
  return s.length > 400 ? `${s.slice(0, 200)}…${s.slice(-100)}` : s;
}
