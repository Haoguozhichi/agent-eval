import type { ValidatorRunner } from "./types.ts";

export const scriptRunner: ValidatorRunner<{
  type: "script";
  script: string;
  shell: string;
  timeout_ms: number;
  expected_exit_code: number;
  weight: number;
  description?: string;
}> = {
  type: "script",
  async run(spec, ctx) {
    const result = await ctx.sandbox.exec(spec.script, {
      shell: spec.shell,
      timeoutMs: spec.timeout_ms,
      signal: ctx.signal,
    });
    const passed = !result.timedOut && result.exitCode === spec.expected_exit_code;
    return {
      passed,
      message: passed
        ? `script exited ${result.exitCode}`
        : result.timedOut
          ? `script timed out after ${spec.timeout_ms}ms`
          : `script exit ${result.exitCode}, expected ${spec.expected_exit_code}`,
      details: {
        exit_code: result.exitCode,
        duration_ms: result.durationMs,
        stdout: truncate(result.stdout),
        stderr: truncate(result.stderr),
      },
    };
  },
};

function truncate(s: string): string {
  return s.length > 1000 ? `${s.slice(0, 800)}\n…\n${s.slice(-200)}` : s;
}
