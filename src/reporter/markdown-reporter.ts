import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CaseResult, RunResult } from "../runner/types.ts";
import type { TokenUsage } from "../runner/metrics.ts";
import type { Reporter } from "./types.ts";

export const markdownReporter: Reporter = {
  async write(outputDir, result) {
    await mkdir(outputDir, { recursive: true });
    const path = join(outputDir, "report.md");
    await writeFile(path, renderMarkdown(result), "utf-8");
    return path;
  },
};

export function renderMarkdown(result: RunResult): string {
  const lines: string[] = [];
  const m = result.metadata;
  const s = result.summary;

  lines.push(`# ${m.eval_name}`);
  if (m.description) lines.push("", m.description);
  lines.push("");
  lines.push("## Metadata");
  lines.push("");
  lines.push(`- Timestamp: ${m.timestamp}`);
  lines.push(`- Duration: ${formatDuration(m.duration_ms)}`);
  lines.push(`- Model: \`${m.config.model}\``);
  lines.push(`- Sandbox: \`${m.config.sandbox_mode}\``);
  lines.push(`- Concurrency: ${m.config.concurrency}`);
  if (m.config.judge_model) lines.push(`- Judge: \`${m.config.judge_model}\``);
  lines.push(`- agent-eval: v${m.agent_eval_version}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Total cases | ${s.total} |`);
  lines.push(`| Passed | ${s.passed} |`);
  lines.push(`| Failed | ${s.failed} |`);
  lines.push(`| Errored | ${s.errored} |`);
  lines.push(`| Timeout | ${s.timeout} |`);
  lines.push(`| Skipped | ${s.skipped} |`);
  lines.push(`| Pass rate | ${(s.pass_rate * 100).toFixed(1)}% |`);
  if (s.average_score !== null) lines.push(`| Average score | ${s.average_score.toFixed(2)} |`);
  lines.push(`| Total messages | ${s.total_messages} |`);
  lines.push(`| Total tool calls | ${s.total_tool_calls.total} (${s.total_tool_calls.errors} errored) |`);
  lines.push(`| Total tokens | ${formatTokens(s.total_tokens)} |`);
  lines.push("");

  if (Object.keys(s.total_tool_calls.by_tool).length > 0) {
    lines.push("### Tool calls by tool");
    lines.push("");
    lines.push("| Tool | Count |");
    lines.push("|---|---:|");
    for (const [tool, n] of sortedEntries(s.total_tool_calls.by_tool)) {
      lines.push(`| \`${tool}\` | ${n} |`);
    }
    lines.push("");
  }

  lines.push("## Cases");
  lines.push("");
  lines.push("| ID | Name | Status | Score | Duration | Tokens | Tool calls |");
  lines.push("|---|---|---|---:|---:|---:|---:|");
  for (const c of result.cases) {
    lines.push(
      `| \`${c.id}\` | ${escapeCell(c.name)} | ${statusBadge(c.status)} | ${
        c.score !== undefined ? c.score.toFixed(2) : "—"
      } | ${formatDuration(c.duration_ms)} | ${c.metrics.tokens.total} | ${c.metrics.tool_calls.total} |`,
    );
  }
  lines.push("");

  for (const c of result.cases) {
    lines.push(`### ${c.id} — ${c.name}`);
    lines.push("");
    lines.push(`- Status: **${c.status}**`);
    if (c.score !== undefined) lines.push(`- Score: ${c.score.toFixed(2)}`);
    lines.push(`- Duration: ${formatDuration(c.duration_ms)}`);
    lines.push(`- Attempt: ${c.attempt}`);
    lines.push(`- Tokens: ${formatTokens(c.metrics.tokens)}`);
    lines.push(
      `- Tool calls: ${c.metrics.tool_calls.total} (${c.metrics.tool_calls.errors} errored)`,
    );
    if (Object.keys(c.metrics.tool_calls.by_tool).length > 0) {
      const breakdown = sortedEntries(c.metrics.tool_calls.by_tool)
        .map(([k, v]) => `\`${k}\`×${v}`)
        .join(", ");
      lines.push(`  - By tool: ${breakdown}`);
    }
    lines.push(`- Messages: ${c.metrics.messages}`);
    if (c.error) lines.push("", `> Error: ${c.error}`);
    if (c.validators.length > 0) {
      lines.push("", "**Validators:**", "");
      lines.push("| Type | Result | Score | Message |");
      lines.push("|---|---|---:|---|");
      for (const v of c.validators) {
        lines.push(
          `| \`${v.type}\` | ${v.passed ? "✅" : "❌"} | ${
            v.score !== undefined ? v.score.toFixed(2) : "—"
          } | ${escapeCell(v.message)} |`,
        );
      }
    }
    if (c.agent_output_summary) {
      lines.push("", "**Agent output:**", "", "```", c.agent_output_summary, "```");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function statusBadge(status: CaseResult["status"]): string {
  switch (status) {
    case "passed":
      return "✅ passed";
    case "failed":
      return "❌ failed";
    case "errored":
      return "💥 errored";
    case "timeout":
      return "⌛ timeout";
    case "skipped":
      return "⏭ skipped";
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

function formatTokens(t: TokenUsage): string {
  return `${t.total} (in ${t.input}, out ${t.output}, cache r ${t.cache_read} / w ${t.cache_write})`;
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function sortedEntries(obj: Record<string, number>): [string, number][] {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

export async function writeMarkdownReport(outputDir: string, result: RunResult): Promise<string> {
  return markdownReporter.write(outputDir, result);
}
