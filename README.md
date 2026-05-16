# agent-eval

End-to-end evaluation framework for [opencode](https://opencode.ai). Runs JSON-defined eval cases concurrently, in Docker sandboxes (or locally), and emits `results.json` and `report.md`.

## Install

```bash
bun install
```

Requires Bun >= 1.1 and (for the default sandbox) Docker.

## 从零开始运行一次评测

### 1. 安装 opencode

确保 `opencode` 在 PATH 上可用：

```bash
curl -fsSL https://opencode.ai/install | bash
opencode --version
```

### 2. 准备模型服务

启动你的模型服务（以 LM Studio 为例）：

- 打开 LM Studio，加载模型（如 qwen3.5-9b）
- 启动本地服务器，默认监听 `http://127.0.0.1:1234/v1`

或者使用云端 API（OpenAI、DeepSeek 等），确保对应的 API Key 已 export。

### 3. 初始化评测项目

```bash
bun run bin/agent-eval.ts init -d ./my-eval
cd my-eval
```

这会生成：

```
my-eval/
├── eval.config.json   # 评测配置
├── dataset.json       # 评测用例集
├── workspace/         # agent 工作区初始文件
└── .gitignore
```

### 4. 编辑配置

修改 `eval.config.json` 中的 `opencode.model` 和 `opencode.provider` 指向你的模型服务（格式见下方 Config 参考）。

### 5. 编写评测用例

编辑 `dataset.json`，定义你的测试用例（格式见下方 Dataset 参考）。

### 6. 验证配置

```bash
bun run /path/to/agent-eval/bin/agent-eval.ts validate -c eval.config.json
```

确认输出 `config and dataset valid`。

### 7. 运行评测

```bash
# 本地模式（无 Docker）
bun run /path/to/agent-eval/bin/agent-eval.ts run --local -c eval.config.json

# Docker 模式
bun run /path/to/agent-eval/bin/agent-eval.ts build-image
bun run /path/to/agent-eval/bin/agent-eval.ts run -c eval.config.json
```

### 8. 查看结果

运行完成后在 `output_dir`（默认 `./results`）下生成：

- `results.json` — 结构化结果，包含每个用例的 token 用量、工具调用统计、验证器结果
- `report.md` — 可读的 Markdown 报告

---

## CLI

```
agent-eval run [-c eval.config.json] [--local] [-j N] [-f glob] [--fail-fast] [--retries N]
agent-eval validate -c eval.config.json
agent-eval report -i results.json [-o report.md]
agent-eval init [-d ./dir]
agent-eval build-image [-t agent-eval/opencode:latest]
```

| 参数 | 说明 |
|---|---|
| `-c, --config` | 配置文件路径，默认 `./eval.config.json` |
| `--local` | 本地模式，不使用 Docker |
| `-j, --concurrency` | 覆盖并发数 |
| `-f, --filter` | 按 case id glob 过滤（如 `"tc-00*"`） |
| `--fail-fast` | 首个失败即终止 |
| `--retries` | 每个用例失败后重试次数 |
| `-o, --output` | 覆盖输出目录 |

---

## Config 参考 (`eval.config.json`)

完整字段说明：

```jsonc
{
  // 必填：评测名称
  "name": "my-eval",

  // 可选：描述
  "description": "评测描述",

  // 必填：opencode 配置，直接透传给 opencode 的 config
  "opencode": {
    "model": "lmstudio/qwen3.5-9b",       // 模型标识：provider/model-name
    "provider": {                           // provider 配置块（透传给 opencode）
      "lmstudio": {
        "npm": "@ai-sdk/openai-compatible",
        "name": "LM Studio",
        "options": {
          "baseURL": "http://127.0.0.1:1234/v1",
          "apiKey": "empty"
        },
        "models": { "qwen3.5-9b": {} }
      }
    },
    "mcp": {},                              // MCP 服务器配置（可选）
    "skills": {},                           // 技能配置（必须是 object）
    "permission": {                         // 权限配置
      "bash": { "*": "allow" },
      "write": { "*": "allow" }
    },
    "extra": {}                             // 其他透传字段（可选）
  },

  // 可选：沙箱配置
  "sandbox": {
    "mode": "local",                        // "docker" | "local"，默认 "docker"
    "image": "agent-eval/opencode:latest",  // Docker 镜像名
    "timeout_ms": 300000,                   // 沙箱总超时（默认 5 分钟）
    "memory_limit": "2g",                   // Docker 内存限制
    "cpu_limit": "2",                       // Docker CPU 限制
    "port_range_start": 14096,              // 端口池起始（默认 14096）
    "network": "bridge",                    // Docker 网络模式
    "env": {}                               // 注入沙箱的额外环境变量
  },

  // 可选：执行配置
  "execution": {
    "concurrency": 4,                       // 并发用例数（默认 4）
    "case_timeout_ms": 180000,              // 单用例超时（默认 3 分钟）
    "global_timeout_ms": 3600000,           // 全局超时（默认 1 小时）
    "retries": 0,                           // 失败重试次数（默认 0）
    "fail_fast": false                      // 首个失败即终止（默认 false）
  },

  // 可选：LLM 裁判配置（用于 llm_judge 验证器）
  "judge": {
    "type": "openai_compatible",            // "openai_compatible" | "anthropic"
    "model": "qwen3.5-9b",                 // 裁判模型名
    "base_url": "http://127.0.0.1:1234/v1",// API 地址（openai_compatible 必填）
    "api_key": "empty",                     // API Key（直接值）
    "api_key_env": "OPENAI_API_KEY",        // 或从环境变量读取
    "temperature": 0,                       // 温度（默认 0）
    "max_tokens": 8192,                     // 最大输出 token（默认 8192）
    "rubric": "评分标准描述",                // 全局评分标准
    "extra_headers": {}                     // 额外 HTTP 头
  },

  // 必填：数据集文件路径（相对于 config 文件）
  "dataset": "./dataset.json",

  // 可选：全局 workspace 目录（所有用例共享的初始文件）
  "workspace": "./workspace",

  // 可选：结果输出目录（默认 "./results"）
  "output_dir": "./results"
}
```

### Provider 配置示例

`opencode.provider` 块直接透传给 opencode，支持 opencode 支持的所有 provider：

```jsonc
// LM Studio（本地）
"provider": {
  "lmstudio": {
    "npm": "@ai-sdk/openai-compatible",
    "name": "LM Studio",
    "options": { "baseURL": "http://127.0.0.1:1234/v1", "apiKey": "empty" },
    "models": { "qwen3.5-9b": {} }
  }
}

// Anthropic
"provider": {
  "anthropic": { "api_key_env": "ANTHROPIC_API_KEY" }
}

// OpenAI-compatible（DeepSeek / Moonshot / Together 等）
"provider": {
  "openai": {
    "npm": "@ai-sdk/openai-compatible",
    "options": { "baseURL": "https://api.deepseek.com/v1", "apiKey_env": "DEEPSEEK_API_KEY" },
    "models": { "deepseek-chat": {} }
  }
}

// Ollama
"provider": {
  "ollama": {
    "npm": "@ai-sdk/openai-compatible",
    "options": { "baseURL": "http://localhost:11434/v1", "apiKey": "ollama" },
    "models": { "qwen2.5-coder:32b": {} }
  }
}
```

### Judge 配置

`judge` 块为 `llm_judge` 验证器提供裁判模型。两种 `type`：

- `openai_compatible`（默认）— 调用 `/chat/completions`，兼容 OpenAI / DeepSeek / Ollama / vLLM / LM Studio 等
- `anthropic` — 调用 `/v1/messages`

`api_key_env` 从环境变量读取 key；`api_key` 直接写值（适合本地服务器）。`extra_headers` 原样转发，适合需要自定义认证头的网关。

---

## Dataset 参考 (`dataset.json`)

完整字段说明：

```jsonc
{
  "version": "1",                           // 可选：版本号
  "name": "my-dataset",                     // 可选：数据集名称
  "description": "数据集描述",               // 可选

  "cases": [
    {
      // === 必填字段 ===
      "id": "tc-001",                       // 唯一标识（用于过滤和报告）
      "prompt": "创建 hello.ts...",          // 发送给 agent 的指令

      // === 可选字段 ===
      "name": "创建 hello 函数",             // 可读名称（报告中显示）
      "description": "详细描述",             // 用例描述
      "type": "pass_fail",                  // "pass_fail"（默认）| "scoring"
      "tags": ["basic", "typescript"],      // 标签（用于分类）
      "timeout_ms": 60000,                  // 覆盖单用例超时
      "workspace_overlay": "./cases/tc-001/workspace",  // 用例专属文件覆盖
      "reference_answer": "参考答案...",     // 参考答案（传给 judge）
      "setup_commands": ["npm install"],    // 执行前运行的命令
      "teardown_commands": ["rm -rf tmp"],  // 执行后运行的命令

      // === 验证器 ===
      "validators": [
        { "type": "file_exists", "path": "hello.ts" }
      ],

      // === scoring 类型专属 ===
      "scoring": {
        "scale": 10,                        // 评分量表（默认 10）
        "dimensions": [                     // 评分维度
          { "name": "correctness", "weight": 0.5, "description": "技术正确性" },
          { "name": "clarity", "weight": 0.5, "description": "表达清晰度" }
        ]
      }
    }
  ]
}
```

### Workspace 与 Overlay

- `workspace`（config 级）— 全局初始文件，所有用例共享。适合放 `package.json`、`tsconfig.json` 等公共文件
- `workspace_overlay`（case 级）— 用例专属文件，会覆盖到 workspace 之上。适合放需要 agent 修改的源文件

执行时的复制顺序：`workspace` → `workspace_overlay` → 启动 opencode

### 验证器详解

每个验证器都有公共字段 `weight`（权重，默认 1）和 `description`（描述）。

| 类型 | 参数 | 说明 |
|---|---|---|
| `file_exists` | `path`, `should_exist`(默认 true) | 检查文件是否存在 |
| `file_diff` | `path`, `expected`/`expected_path`, `ignore_whitespace`, `ignore_trailing_newline` | 文件内容精确匹配 |
| `command_check` | `command`, `expected_exit_code`(默认 0), `expected_stdout`, `expected_stdout_regex`, `timeout_ms`, `cwd`, `shell` | 运行命令检查退出码/输出 |
| `regex_match` | `path`, `pattern`, `flags`, `should_match`(默认 true) | 正则匹配文件内容 |
| `json_match` | `path`, `expected`/`expected_path`, `partial`(默认 false) | JSON 深度对比 |
| `script` | `script`, `shell`, `timeout_ms`, `expected_exit_code` | 任意脚本，退出码为判定 |
| `llm_judge` | `criteria`, `rubric`, `pass_threshold`(默认 6) | LLM 裁判打分（需配置 `judge` 块） |

### 用例类型

**pass_fail**（默认）— 所有验证器通过即 passed，任一失败即 failed。

**scoring** — 验证器返回分数，按 weight 加权聚合为最终得分。需要定义 `scoring.dimensions`。`llm_judge` 会按 dimensions 逐项打分并返回 breakdown。

---

## 输出结果

### results.json

完整结构：

```jsonc
{
  "metadata": {
    "eval_name": "my-eval",                 // 评测名称
    "description": "...",                   // 描述
    "timestamp": "2026-05-16T07:25:35Z",   // 开始时间
    "duration_ms": 30400,                   // 总耗时
    "config": {
      "model": "lmstudio/qwen3.5-9b",      // 使用的模型
      "concurrency": 2,                    // 并发数
      "sandbox_mode": "local",             // 沙箱模式
      "judge_model": "qwen3.5-9b"          // 裁判模型（如有）
    },
    "agent_eval_version": "0.1.0"
  },

  "summary": {
    "total": 2,                             // 总用例数
    "passed": 2,                            // 通过数
    "failed": 0,                            // 失败数
    "errored": 0,                           // 错误数（执行异常）
    "timeout": 0,                           // 超时数
    "skipped": 0,                           // 跳过数
    "pass_rate": 1.0,                       // 通过率（不含 skipped）
    "average_score": 7.5,                   // 平均分（仅 scoring 类型，无则 null）

    "total_tokens": {                       // 全部用例 token 汇总
      "input": 224983,                      //   输入 token
      "output": 758,                        //   输出 token
      "cache_read": 0,                      //   缓存读取（provider 支持时）
      "cache_write": 0,                     //   缓存写入
      "total": 225741                       //   总计
    },
    "total_tool_calls": {                   // 全部用例工具调用汇总
      "total": 7,                           //   总调用次数
      "by_tool": {                          //   按工具名分桶
        "write": 1,
        "glob": 2,
        "bash": 1,
        "read": 1,
        "edit": 1,
        "grep": 1
      },
      "errors": 0                           //   失败的工具调用数
    },
    "total_messages": 9                     // 全部 assistant 消息数
  },

  "cases": [
    {
      "id": "tc-001",                       // 用例 ID
      "name": "create hello.ts",            // 用例名称
      "type": "pass_fail",                  // 用例类型
      "status": "passed",                   // "passed"|"failed"|"errored"|"timeout"|"skipped"
      "score": null,                        // 得分（scoring 类型）
      "duration_ms": 38616,                 // 用例耗时
      "started_at": "2026-05-16T07:47:38Z",
      "finished_at": "2026-05-16T07:48:19Z",
      "attempt": 1,                         // 第几次尝试

      "metrics": {
        "tokens": {                         // 本用例 token 用量
          "input": 48649,
          "output": 150,
          "cache_read": 0,
          "cache_write": 0,
          "total": 48799
        },
        "tool_calls": {                     // 本用例工具调用
          "total": 1,
          "by_tool": { "write": 1 },
          "errors": 0
        },
        "messages": 2                       // assistant 消息轮数
      },

      "validators": [                       // 每个验证器的结果
        {
          "type": "file_exists",
          "passed": true,
          "score": null,                    // scoring 验证器会有分数
          "weight": 1,
          "message": "hello.ts exists as expected",
          "details": { "path": "hello.ts", "exists": true },
          "duration_ms": 1
        }
      ],

      "agent_output_summary": "...",        // agent 输出摘要（截断到 800 字符）
      "error": null                         // 错误信息（status 为 errored/timeout 时）
    }
  ]
}
```

### report.md

Markdown 格式的可读报告，包含：

- **Metadata** — 时间、模型、沙箱模式、并发数、版本
- **Summary 表** — 通过率、总 token、总工具调用、按工具分桶统计
- **Cases 总览表** — 每个用例一行：ID、名称、状态、得分、耗时、token、工具调用数
- **每个用例详情** — 状态、得分、耗时、token 明细、工具调用分桶、验证器结果表、agent 输出摘要

### cases/ 目录（工作区快照 + 完整日志）

每个用例执行完成后，agent-eval 会自动保存：

```
results/cases/
├── tc-001/
│   ├── workspace/          ← agent 执行后的完整工作区快照
│   │   ├── hello.ts        ← agent 生成的文件
│   │   └── opencode.json   ← opencode 配置
│   └── messages.json       ← 完整对话日志（含 system prompt）
├── tc-002/
│   ├── workspace/
│   │   ├── sum.js          ← agent 修改后的文件
│   │   └── opencode.json
│   └── messages.json
└── ...
```

**workspace/** — agent 执行结束时工作目录的完整快照。可以直接查看 agent 生成或修改了哪些文件。即使用例超时或出错，也会尽力保存。

**messages.json** — opencode 返回的完整消息列表，包含：
- system 消息（含完整 system prompt）
- user 消息（评测 prompt）
- assistant 消息（含 reasoning、text、tool parts）
- 每个 tool part 包含 `tool` 名称、`state.input`、`state.output`、`state.status`

示例 messages.json 结构：

```jsonc
[
  {
    "info": { "role": "user", "id": "msg_..." },
    "parts": [
      { "type": "text", "text": "Create hello.ts..." }
    ]
  },
  {
    "info": { "role": "assistant", "id": "msg_..." },
    "parts": [
      { "type": "step-start" },
      { "type": "reasoning", "reasoning": "..." },
      { "type": "text", "text": "I'll create the file..." },
      {
        "type": "tool",
        "tool": "write",
        "state": {
          "status": "completed",
          "input": { "path": "hello.ts", "content": "..." },
          "output": "File written successfully"
        }
      },
      { "type": "step-finish" }
    ]
  }
]
```

示例片段：

```markdown
## Summary

| Metric | Value |
|---|---|
| Total cases | 2 |
| Passed | 2 |
| Pass rate | 100.0% |
| Total tokens | 225741 (in 224983, out 758, cache r 0 / w 0) |
| Total tool calls | 7 (0 errored) |

### Tool calls by tool

| Tool | Count |
|---|---:|
| `glob` | 2 |
| `write` | 1 |
| `bash` | 1 |

### tc-001 — create hello.ts

- Status: **passed**
- Tokens: 48799 (in 48649, out 150, cache r 0 / w 0)
- Tool calls: 1 (0 errored)
  - By tool: `write`×1
- Messages: 2
```

---

## Tests

```bash
bun run test          # vitest
bun run typecheck     # tsc --noEmit
```
