# agent-eval

opencode 端到端评测框架。支持 Web UI 和 CLI 两种使用方式，在 Docker 容器中运行评测（内置 opencode），用户电脑无需安装任何依赖（除 Docker 外）。

## 快速开始（Web UI）

只需要 Docker：

```bash
node launcher/bin/cli.mjs
```

这会：
1. 构建/拉取 Docker 镜像（内含 opencode + bun + web 全套环境）
2. 启动容器，映射端口 7800
3. 自动打开浏览器 `http://localhost:7800`
4. 在网页上配置模型、编写用例、启动评测、查看结果
5. Ctrl+C 停止并清理容器

```bash
# 自定义端口和结果目录
node launcher/bin/cli.mjs --port 8080 --results ./my-results
```

## 快速开始（CLI）

需要本地安装 Bun 和 opencode：

```bash
bun install

# 初始化评测项目
bun run bin/agent-eval.ts init -d ./my-eval
cd my-eval

# 编辑 eval.config.json 和 dataset.json

# 验证配置
bun run /path/to/agent-eval/bin/agent-eval.ts validate -c eval.config.json

# 运行评测（本地模式）
bun run /path/to/agent-eval/bin/agent-eval.ts run --local -c eval.config.json
```

## Web UI 功能

| 页面 | 功能 |
|---|---|
| 配置页 | 编辑 eval.config.json（模型、provider、沙箱、超时等）+ 编辑/拖拽上传 dataset.json |
| 运行页 | 实时进度条、用例状态实时更新（SSE 推送）、中止按钮 |
| 历史页 | 所有评测记录列表，按时间倒序 |
| 结果详情 | 总览卡片 + 用例表格，点击进入单用例详情 |
| 用例详情 | 三个 Tab：验证器结果 / Agent 对话日志（含 system prompt）/ 工作区文件浏览 |

## CLI 命令

```
agent-eval run [-c config] [--local] [-j N] [-f glob] [--fail-fast] [--retries N] [-o dir]
agent-eval validate -c config
agent-eval report -i results.json [-o report.md]
agent-eval init [-d dir]
agent-eval build-image [-t tag]
```

| 参数 | 说明 |
|---|---|
| `-c, --config` | 配置文件路径，默认 `./eval.config.json` |
| `--local` | 本地模式（不使用 Docker 沙箱，需本地安装 opencode） |
| `-j, --concurrency` | 并发数 |
| `-f, --filter` | 按 case id glob 过滤 |
| `--fail-fast` | 首个失败即终止 |
| `--retries` | 失败重试次数 |

## 配置文件 (eval.config.json)

```jsonc
{
  "name": "my-eval",                        // 评测名称
  "description": "描述",                     // 可选

  "opencode": {
    "model": "lmstudio/qwen3.5-9b",        // provider/model 格式
    "provider": {                            // 透传给 opencode 的 provider 配置
      "lmstudio": {
        "npm": "@ai-sdk/openai-compatible",
        "options": { "baseURL": "http://host.docker.internal:1234/v1", "apiKey": "empty" },
        "models": { "qwen3.5-9b": {} }
      }
    },
    "mcp": {},                               // MCP 配置
    "skills": {},                            // 技能配置（必须是 object）
    "permission": {                          // 权限
      "bash": { "*": "allow" },
      "write": { "*": "allow" }
    }
  },

  "sandbox": {
    "mode": "local",                         // "docker" | "local"
    "timeout_ms": 300000,                    // 沙箱超时
    "memory_limit": "2g",                    // Docker 内存限制
    "cpu_limit": "2"                         // Docker CPU 限制
  },

  "execution": {
    "concurrency": 2,                        // 并发用例数
    "case_timeout_ms": 300000,               // 单用例超时
    "global_timeout_ms": 3600000,            // 全局超时
    "retries": 0,                            // 失败重试
    "fail_fast": false                       // 首个失败即终止
  },

  "judge": {                                 // 可选：LLM 裁判
    "type": "openai_compatible",             // "openai_compatible" | "anthropic"
    "model": "qwen3.5-9b",
    "base_url": "http://host.docker.internal:1234/v1",
    "api_key": "empty",
    "temperature": 0,
    "max_tokens": 8192
  },

  "dataset": "./dataset.json",              // 数据集路径
  "workspace": "./workspace",               // 全局工作区
  "output_dir": "./results"                  // 输出目录
}
```

### Provider 配置示例

```jsonc
// LM Studio（Docker 容器内访问宿主机）
"provider": {
  "lmstudio": {
    "npm": "@ai-sdk/openai-compatible",
    "options": { "baseURL": "http://host.docker.internal:1234/v1", "apiKey": "empty" },
    "models": { "qwen3.5-9b": {} }
  }
}

// Ollama
"provider": {
  "ollama": {
    "npm": "@ai-sdk/openai-compatible",
    "options": { "baseURL": "http://host.docker.internal:11434/v1", "apiKey": "ollama" },
    "models": { "qwen2.5-coder:32b": {} }
  }
}

// Anthropic
"provider": {
  "anthropic": { "api_key_env": "ANTHROPIC_API_KEY" }
}

// DeepSeek
"provider": {
  "deepseek": {
    "npm": "@ai-sdk/openai-compatible",
    "options": { "baseURL": "https://api.deepseek.com/v1", "apiKey_env": "DEEPSEEK_API_KEY" },
    "models": { "deepseek-chat": {} }
  }
}
```

> Docker 容器内访问宿主机服务用 `host.docker.internal`，本地 CLI 模式用 `127.0.0.1`。

## 数据集 (dataset.json)

```jsonc
{
  "version": "1",
  "name": "my-dataset",
  "cases": [
    {
      "id": "tc-001",                        // 唯一 ID
      "name": "创建 hello 函数",              // 可读名称
      "type": "pass_fail",                   // "pass_fail"(默认) | "scoring"
      "prompt": "创建 hello.ts...",           // 发给 agent 的指令

      "workspace_overlay": "./cases/tc-001/workspace",  // 用例专属初始文件
      "timeout_ms": 60000,                   // 覆盖超时
      "setup_commands": ["npm install"],     // 执行前命令
      "teardown_commands": [],               // 执行后命令
      "tags": ["basic"],                     // 标签
      "reference_answer": "...",             // 参考答案（传给 judge）

      "validators": [                        // 验证器列表
        { "type": "file_exists", "path": "hello.ts" },
        { "type": "regex_match", "path": "hello.ts", "pattern": "export function greet" }
      ],

      // scoring 类型专属
      "scoring": {
        "scale": 10,
        "dimensions": [
          { "name": "correctness", "weight": 0.5 },
          { "name": "clarity", "weight": 0.5 }
        ]
      }
    }
  ]
}
```

### Workspace 机制

- `workspace`（config 级）— 全局初始文件，所有用例共享
- `workspace_overlay`（case 级）— 用例专属文件，覆盖到 workspace 之上

复制顺序：`workspace` → `workspace_overlay` → 启动 opencode

### 验证器

| 类型 | 说明 | 关键参数 |
|---|---|---|
| `file_exists` | 文件存在性 | `path`, `should_exist` |
| `file_diff` | 文件内容匹配 | `path`, `expected`/`expected_path`, `ignore_whitespace` |
| `command_check` | 命令退出码/输出 | `command`, `expected_exit_code`, `expected_stdout_regex` |
| `regex_match` | 正则匹配文件 | `path`, `pattern`, `flags`, `should_match` |
| `json_match` | JSON 深度对比 | `path`, `expected`, `partial` |
| `script` | 任意脚本 | `script`, `expected_exit_code` |
| `llm_judge` | LLM 裁判打分 | `criteria`, `pass_threshold`（需配置 `judge` 块） |

## 输出结构

每次评测生成以下文件：

```
results/{run-id}/
├── results.json          ← 结构化结果（含 token、工具调用统计）
├── report.md             ← 中文 Markdown 报告
└── cases/
    ├── tc-001/
    │   ├── workspace/    ← agent 执行后的工作区快照（生成的文件都在这里）
    │   └── messages.json ← 完整对话日志（含 system prompt、tool 调用详情）
    └── tc-002/
        ├── workspace/
        └── messages.json
```

### results.json 关键字段

```jsonc
{
  "metadata": {
    "eval_name": "my-eval",
    "duration_ms": 37803,
    "duration": "37s 803ms",              // 人类可读耗时
    "config": { "model": "...", "concurrency": 2, "sandbox_mode": "local" }
  },
  "summary": {
    "pass_rate": 1.0,
    "total_tokens": { "input": 48620, "output": 136, "total": 48756 },
    "total_tool_calls": { "total": 1, "by_tool": { "write": 1 }, "errors": 0 },
    "total_messages": 2
  },
  "cases": [{
    "id": "tc-001",
    "status": "passed",
    "duration": "34s 784ms",
    "metrics": {
      "tokens": { "input": 48620, "output": 136, "total": 48756 },
      "tool_calls": { "total": 1, "by_tool": { "write": 1 }, "errors": 0 },
      "messages": 2
    }
  }]
}
```

### messages.json 结构

```jsonc
[
  { "info": { "role": "user" }, "parts": [{ "type": "text", "text": "..." }] },
  {
    "info": { "role": "assistant" },
    "parts": [
      { "type": "reasoning", "reasoning": "..." },
      { "type": "text", "text": "..." },
      { "type": "tool", "tool": "write", "state": { "status": "completed", "input": {...}, "output": "..." } }
    ]
  }
]
```

## Docker 架构

```
┌─────────────────────────────────────────┐
│  Docker 容器 (agent-eval:latest)         │
│                                          │
│  ┌──────────┐  ┌───────────────────┐    │
│  │ Bun Web  │  │ opencode (内置)    │    │
│  │ Server   │  │                   │    │
│  │ :7800    │──│ 每个 case 启动一个  │    │
│  │          │  │ opencode serve    │    │
│  └──────────┘  └───────────────────┘    │
│       │                    │             │
│       ▼                    ▼             │
│  /app/results         /tmp/workspace     │
└───────┬────────────────────────────────┘
        │ -v 挂载
        ▼
  宿主机 ./results/
```

容器通过 `host.docker.internal` 访问宿主机上的模型服务（LM Studio / Ollama 等）。

## 开发

```bash
# 安装依赖
bun install && cd web && bun install && cd ..

# 后端开发（API server）
bun run bin/agent-eval-web.ts

# 前端开发（Vite dev server，代理 API 到 7800）
cd web && bun run dev

# 类型检查
bun run typecheck

# 测试
bun run test

# 构建前端
cd web && npx vite build

# 构建 Docker 镜像
docker build -t agent-eval:latest .
```
