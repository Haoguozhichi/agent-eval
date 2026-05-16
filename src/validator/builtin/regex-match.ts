import type { ValidatorRunner } from "../types.ts";

export const regexMatchRunner: ValidatorRunner<{
  type: "regex_match";
  path: string;
  pattern: string;
  flags: string;
  should_match: boolean;
  weight: number;
  description?: string;
}> = {
  type: "regex_match",
  async run(spec, ctx) {
    const exists = await ctx.sandbox.fileExists(spec.path);
    if (!exists) {
      return { passed: false, message: `file not found: ${spec.path}` };
    }
    const content = await ctx.sandbox.readFile(spec.path);
    const re = new RegExp(spec.pattern, spec.flags);
    const matched = re.test(content);
    const passed = matched === spec.should_match;
    return {
      passed,
      message: passed
        ? `regex ${spec.should_match ? "matched" : "did not match"} as expected`
        : `regex expected to ${spec.should_match ? "match" : "not match"} but ${matched ? "matched" : "did not match"}`,
      details: { pattern: spec.pattern, flags: spec.flags, matched },
    };
  },
};
