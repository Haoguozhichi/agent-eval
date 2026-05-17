import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/reporter/markdown-reporter.ts";
import type { RunResult } from "../../src/runner/types.ts";

const baseResult: RunResult = {
  metadata: {
    eval_name: "test",
    timestamp: "2026-05-16T00:00:00Z",
    duration_ms: 12345,
    duration: "12s 345ms",
    config: { model: "anthropic/claude-sonnet-4-5", concurrency: 2 },
    agent_eval_version: "0.1.0",
  },
  summary: {
    total: 1,
    passed: 1,
    failed: 0,
    errored: 0,
    timeout: 0,
    skipped: 0,
    pass_rate: 1,
    average_score: null,
    total_tokens: { input: 100, output: 50, cache_read: 10, cache_write: 5, total: 165 },
    total_tool_calls: { total: 3, by_tool: { Read: 2, Bash: 1 }, errors: 0 },
    total_messages: 4,
  },
  cases: [
    {
      id: "tc-001",
      name: "case one",
      status: "passed",
      duration_ms: 12000,
      duration: "12s",
      started_at: "2026-05-16T00:00:00Z",
      finished_at: "2026-05-16T00:00:12Z",
      validators: [
        { type: "file_exists", passed: true, weight: 1, message: "ok", duration_ms: 5, duration: "5ms" },
      ],
      agent_output_summary: "done",
      error: null,
      metrics: {
        tokens: { input: 100, output: 50, cache_read: 10, cache_write: 5, total: 165 },
        tool_calls: { total: 3, by_tool: { Read: 2, Bash: 1 }, errors: 0 },
        messages: 4,
      },
      attempt: 1,
    },
  ],
};

describe("renderMarkdown", () => {
  it("includes token and tool call totals", () => {
    const md = renderMarkdown(baseResult);
    expect(md).toContain("| 总 Token | 165");
    expect(md).toContain("| 总工具调用 | 3");
    expect(md).toContain("`Read` | 2");
    expect(md).toContain("工具调用: 3");
  });

  it("renders pass rate as percentage", () => {
    const md = renderMarkdown(baseResult);
    expect(md).toContain("100.0%");
  });
});
