import type { ValidatorRunner } from "../types.ts";

export const commandCheckRunner: ValidatorRunner<{
  type: "command_check";
  command: string;
  shell: string;
  expected_exit_code: number;
  expected_stdout?: string;
  expected_stdout_regex?: string;
  timeout_ms: number;
  cwd?: string;
  weight: number;
  description?: string;
}> = {
  type: "command_check",
  async run(spec, ctx) {
    const result = await ctx.sandbox.exec(spec.command, {
      shell: spec.shell,
      timeoutMs: spec.timeout_ms,
      cwd: spec.cwd,
      signal: ctx.signal,
    });

    const exitOk = result.exitCode === spec.expected_exit_code;
    const stdoutTrimmed = result.stdout.trim();
    const stdoutOk =
      spec.expected_stdout === undefined ||
      stdoutTrimmed === spec.expected_stdout.trim();
    const regexOk =
      spec.expected_stdout_regex === undefined ||
      new RegExp(spec.expected_stdout_regex).test(result.stdout);
    const passed = exitOk && stdoutOk && regexOk && !result.timedOut;

    const reasons: string[] = [];
    if (result.timedOut) reasons.push(`timed out after ${spec.timeout_ms}ms`);
    if (!exitOk) reasons.push(`exit ${result.exitCode}, expected ${spec.expected_exit_code}`);
    if (!stdoutOk) reasons.push("stdout did not match expected");
    if (!regexOk) reasons.push("stdout did not match regex");

    return {
      passed,
      message: passed
        ? `command exited ${result.exitCode}`
        : `command failed: ${reasons.join(", ")}`,
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
