import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ValidatorRunner } from "../types.ts";

export const jsonMatchRunner: ValidatorRunner<{
  type: "json_match";
  path: string;
  expected?: unknown;
  expected_path?: string;
  partial: boolean;
  weight: number;
  description?: string;
}> = {
  type: "json_match",
  async run(spec, ctx) {
    const exists = await ctx.sandbox.fileExists(spec.path);
    if (!exists) return { passed: false, message: `file not found: ${spec.path}` };
    const raw = await ctx.sandbox.readFile(spec.path);
    let actual: unknown;
    try {
      actual = JSON.parse(raw);
    } catch (err) {
      return { passed: false, message: `failed to parse JSON: ${(err as Error).message}` };
    }
    let expected: unknown;
    if (spec.expected_path) {
      const abs = resolve(ctx.loaded.baseDir, spec.expected_path);
      expected = JSON.parse(await readFile(abs, "utf-8"));
    } else {
      expected = spec.expected;
    }
    const passed = spec.partial ? subsetMatches(expected, actual) : deepEqual(expected, actual);
    return {
      passed,
      message: passed ? "JSON matches expected" : "JSON does not match expected",
    };
  },
};

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao).sort();
    const bk = Object.keys(bo).sort();
    if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
    return ak.every((k) => deepEqual(ao[k], bo[k]));
  }
  return false;
}

function subsetMatches(expected: unknown, actual: unknown): boolean {
  if (expected === actual) return true;
  if (typeof expected !== typeof actual) return false;
  if (expected === null || actual === null) return expected === actual;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length > actual.length) return false;
    return expected.every((v, i) => subsetMatches(v, actual[i]));
  }
  if (typeof expected === "object") {
    const eo = expected as Record<string, unknown>;
    const ao = actual as Record<string, unknown>;
    return Object.keys(eo).every((k) => subsetMatches(eo[k], ao[k]));
  }
  return false;
}
