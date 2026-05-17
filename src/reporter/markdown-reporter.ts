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
  lines.push("## 基本信息");
  lines.push("");
  lines.push(`- 时间: ${m.timestamp}`);
  lines.push(`- 总耗时: ${m.duration}`);
  lines.push(`- 模型: \`${m.config.model}\``);
  lines.push(`- 并发数: ${m.config.concurrency}`);
  if (m.config.judge_model) lines.push(`- 裁判模型: \`${m.config.judge_model}\``);
  lines.push(`- agent-eval: v${m.agent_eval_version}`);
  lines.push("");

  lines.push("## 总览");
  lines.push("");
  lines.push("| 指标 | 值 |");
  lines.push("|---|---|");
  lines.push(`| 总用例数 | ${s.total} |`);
  lines.push(`| 通过 | ${s.passed} |`);
  lines.push(`| 失败 | ${s.failed} |`);
  lines.push(`| 错误 | ${s.errored} |`);
  lines.push(`| 超时 | ${s.timeout} |`);
  lines.push(`| 跳过 | ${s.skipped} |`);
  lines.push(`| 通过率 | ${(s.pass_rate * 100).toFixed(1)}% |`);
  if (s.average_score !== null) lines.push(`| 平均分 | ${s.average_score.toFixed(2)} |`);
  lines.push(`| 总消息轮数 | ${s.total_messages} |`);
  lines.push(`| 总工具调用 | ${s.total_tool_calls.total} (${s.total_tool_calls.errors} 次失败) |`);
  lines.push(`| 总 Token | ${formatTokens(s.total_tokens)} |`);
  lines.push("");

  if (Object.keys(s.total_tool_calls.by_tool).length > 0) {
    lines.push("### 工具调用分布");
    lines.push("");
    lines.push("| 工具 | 次数 |");
    lines.push("|---|---:|");
    for (const [tool, n] of sortedEntries(s.total_tool_calls.by_tool)) {
      lines.push(`| \`${tool}\` | ${n} |`);
    }
    lines.push("");
  }

  lines.push("## 用例结果");
  lines.push("");
  lines.push("| ID | 名称 | 状态 | 得分 | 耗时 | Token | 工具调用 |");
  lines.push("|---|---|---|---:|---:|---:|---:|");
  for (const c of result.cases) {
    lines.push(
      `| \`${c.id}\` | ${escapeCell(c.name)} | ${statusBadge(c.status)} | ${
        c.score !== undefined ? c.score.toFixed(2) : "—"
      } | ${c.duration} | ${c.metrics.tokens.total} | ${c.metrics.tool_calls.total} |`,
    );
  }
  lines.push("");

  for (const c of result.cases) {
    lines.push(`### ${c.id} — ${c.name}`);
    lines.push("");
    lines.push(`- 状态: **${statusText(c.status)}**`);
    if (c.score !== undefined) lines.push(`- 得分: ${c.score.toFixed(2)}`);
    lines.push(`- 耗时: ${c.duration}`);
    lines.push(`- 尝试次数: ${c.attempt}`);
    lines.push(`- Token: ${formatTokens(c.metrics.tokens)}`);
    lines.push(
      `- 工具调用: ${c.metrics.tool_calls.total} 次 (${c.metrics.tool_calls.errors} 次失败)`,
    );
    if (Object.keys(c.metrics.tool_calls.by_tool).length > 0) {
      const breakdown = sortedEntries(c.metrics.tool_calls.by_tool)
        .map(([k, v]) => `\`${k}\`×${v}`)
        .join(", ");
      lines.push(`  - 分布: ${breakdown}`);
    }
    lines.push(`- 消息轮数: ${c.metrics.messages}`);
    if (c.error) lines.push("", `> 错误: ${c.error}`);
    if (c.validators.length > 0) {
      lines.push("", "**验证器结果:**", "");
      lines.push("| 类型 | 结果 | 得分 | 说明 |");
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
      lines.push("", "**Agent 输出:**", "", "```", c.agent_output_summary, "```");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function statusBadge(status: CaseResult["status"]): string {
  switch (status) {
    case "passed":
      return "✅ 通过";
    case "failed":
      return "❌ 失败";
    case "errored":
      return "💥 错误";
    case "timeout":
      return "⌛ 超时";
    case "skipped":
      return "⏭ 跳过";
  }
}

function statusText(status: CaseResult["status"]): string {
  switch (status) {
    case "passed":
      return "通过";
    case "failed":
      return "失败";
    case "errored":
      return "错误";
    case "timeout":
      return "超时";
    case "skipped":
      return "跳过";
  }
}

function formatTokens(t: TokenUsage): string {
  return `${t.total} (输入 ${t.input}, 输出 ${t.output}, 缓存读 ${t.cache_read} / 写 ${t.cache_write})`;
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
