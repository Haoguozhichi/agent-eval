import type { ValidatorRunner } from "../types.ts";

export const fileExistsRunner: ValidatorRunner<{
  type: "file_exists";
  path: string;
  should_exist: boolean;
  weight: number;
  description?: string;
}> = {
  type: "file_exists",
  async run(spec, ctx) {
    const exists = await ctx.sandbox.fileExists(spec.path);
    const passed = exists === spec.should_exist;
    return {
      passed,
      message: passed
        ? `${spec.path} ${spec.should_exist ? "exists" : "absent"} as expected`
        : `${spec.path} ${exists ? "exists" : "missing"} but expected ${spec.should_exist ? "exists" : "absent"}`,
      details: { path: spec.path, exists, should_exist: spec.should_exist },
    };
  },
};
