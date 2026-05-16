import { describe, expect, it } from "vitest";
import {
  addTokenUsage,
  emptyMetrics,
  emptyTokenUsage,
  finalizeTokens,
  recordToolCall,
} from "../../src/runner/metrics.ts";

describe("metrics", () => {
  it("aggregates token usage", () => {
    const a = { input: 10, output: 5, cache_read: 2, cache_write: 1, total: 0 };
    const b = { input: 3, output: 4, cache_read: 0, cache_write: 0, total: 0 };
    const combined = addTokenUsage(a, b);
    expect(combined.input).toBe(13);
    expect(combined.output).toBe(9);
  });

  it("finalizes total", () => {
    const u = finalizeTokens({ input: 10, output: 5, cache_read: 2, cache_write: 1, total: 0 });
    expect(u.total).toBe(18);
  });

  it("records tool calls", () => {
    const m = emptyMetrics();
    recordToolCall(m.tool_calls, "Read", false);
    recordToolCall(m.tool_calls, "Read", false);
    recordToolCall(m.tool_calls, "Bash", true);
    expect(m.tool_calls.total).toBe(3);
    expect(m.tool_calls.errors).toBe(1);
    expect(m.tool_calls.by_tool.Read).toBe(2);
    expect(m.tool_calls.by_tool.Bash).toBe(1);
  });

  it("empty token usage has zero total", () => {
    expect(emptyTokenUsage().total).toBe(0);
  });
});
