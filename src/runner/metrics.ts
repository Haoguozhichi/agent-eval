export interface TokenUsage {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  total: number;
}

export interface ToolCallStats {
  total: number;
  by_tool: Record<string, number>;
  errors: number;
}

export interface CaseMetrics {
  tokens: TokenUsage;
  tool_calls: ToolCallStats;
  messages: number;
  judge_tokens?: TokenUsage;
}

export function emptyTokenUsage(): TokenUsage {
  return { input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0 };
}

export function emptyToolCallStats(): ToolCallStats {
  return { total: 0, by_tool: {}, errors: 0 };
}

export function emptyMetrics(): CaseMetrics {
  return {
    tokens: emptyTokenUsage(),
    tool_calls: emptyToolCallStats(),
    messages: 0,
  };
}

export function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cache_read: a.cache_read + b.cache_read,
    cache_write: a.cache_write + b.cache_write,
    total: a.total + b.total,
  };
}

export function recordToolCall(
  stats: ToolCallStats,
  tool: string,
  errored: boolean,
): void {
  stats.total += 1;
  stats.by_tool[tool] = (stats.by_tool[tool] ?? 0) + 1;
  if (errored) stats.errors += 1;
}

export function finalizeTokens(usage: TokenUsage): TokenUsage {
  return {
    ...usage,
    total: usage.input + usage.output + usage.cache_read + usage.cache_write,
  };
}
