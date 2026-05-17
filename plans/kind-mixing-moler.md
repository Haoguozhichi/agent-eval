# agent-eval: OpenCode 端到端评测框架

## Context

用户需要一个开源的端到端评测框架，用于评估 opencode（开源 AI 编码 agent）的能力。框架接收 JSON 格式的评测集和 opencode 配置，在 Docker 沙箱中并发运行评测用例，最终生成 JSON 结果文件和 Markdown 报告。

## 技术选型

- 语言: TypeScript (Bun)
- 沙箱: Docker 容器（默认）+ 本地模式（开发调试）
- 与 opencode 交互: HTTP API（`opencode serve`）
- 并发: 用例级并发，使用 p-limit 控制
- 验证: 内置验证器 + 自定义脚本 + LLM-as-judge

## 项目结构

```
agent-eval/
├── package.json
├── tsconfig.json
├── Dockerfile                      # 评测容器基础镜像
├── bin/
│   └── agent-eval.ts               # CLI 入口
├── src/
│   ├── index.ts                    # 公共 API 导出
│   ├── cli.ts                      # CLI 命令解析
│   ├── config/
│   │   ├── loader.ts               # 加载和验证评测配置
│   │   ├── schema.ts               # Zod schema
│   │   └── types.ts                # 类型定义
│   ├── dataset/
│   │   ├── parser.ts               # 解析 JSON 评测集
│   │   ├── schema.ts               # Zod schema
│   │   └── types.ts                # 类型定义
│   ├── sandbox/
│   │   ├── manager.ts              # 沙箱管理器（工厂）
│   │   ├── docker.ts               # Docker 容器生命周期
│   │   ├── local.ts                # 本地模式（无 Docker）
│   │   └── types.ts                # SandboxProvider 接口
│   ├── client/
│   │   ├── opencode.ts             # OpenCode HTTP API 客户端
│   │   ├── health.ts               # 健康检查/就绪轮询
│   │   └── types.ts                # 客户端类型
│   ├── runner/
│   │   ├── orchestrator.ts         # 顶层编排，并发控制
│   │   ├── executor.ts             # 单用例执行逻辑
│   │   └── types.ts                # 执行上下文和结果类型
│   ├── validator/
│   │   ├── engine.ts               # 验证器调度和聚合
│   │   ├── builtin/
│   │   │   ├── file-diff.ts        # 文件内容对比
│   │   │   ├── command-check.ts    # 命令执行结果检查
│   │   │   ├── regex-match.ts      # 正则匹配
│   │   │   ├── file-exists.ts      # 文件存在性检查
│   │   │   ├── json-match.ts       # JSON 深度对比
│   │   │   └── index.ts            # 内置验证器注册表
│   │   ├── script.ts               # 自定义验证脚本执行
│   │   ├── llm-judge.ts            # LLM 裁判模型
│   │   └── types.ts                # 验证器接口和结果类型
│   ├── reporter/
│   │   ├── json-reporter.ts        # JSON 结果输出
│   │   ├── markdown-reporter.ts    # Markdown 报告生成
│   │   └── types.ts                # Reporter 接口
│   └── utils/
│       ├── logger.ts               # 结构化日志
│       ├── timer.ts                # 计时工具
│       ├── retry.ts                # 重试与退避
│       └── port.ts                 # 端口分配
├── templates/
│   └── Dockerfile.eval             # 评测容器 Dockerfile 模板
├── examples/
│   ├── simple-eval/
│   │   ├── eval.config.json
│   │   ├── dataset.json
│   │   └── workspace/
│   └── scoring-eval/
│       ├── eval.config.json
│       ├── dataset.json
│       └── validators/
└── tests/
    ├── unit/
    └── integration/
```

## 核心数据格式

### 评测配置 (`eval.config.json`)

```json
{
  "name": "my-evaluation",
  "description": "评测描述",
  "opencode": {
    "model": "anthropic/claude-sonnet-4-20250514",
    "provider": {
      "anthropic": { "api_key_env": "ANTHROPIC_API_KEY" }
    },
    "mcp": {},
    "skills": [],
    "permission": { "bash": { "*": "allow" }, "write": { "*": "allow" } }
  },
  "sandbox": {
    "mode": "docker",
    "image": "agent-eval/opencode:latest",
    "timeout_ms": 300000,
    "memory_limit": "2g",
    "cpu_limit": "2"
  },
  "execution": {
    "concurrency": 4,
    "case_timeout_ms": 180000,
    "global_timeout_ms": 3600000
  },
  "judge": {
    "model": "anthropic/claude-sonnet-4-20250514",
    "provider": { "anthropic": { "api_key_env": "ANTHROPIC_API_KEY" } },
    "temperature": 0.0,
    "rubric": "评分标准描述"
  },
  "dataset": "./dataset.json",
  "workspace": "./workspace",
  "output_dir": "./results"
}
```

### 评测集 (`dataset.json`)

```json
{
  "cases": [
    {
      "id": "tc-001",
      "name": "创建 hello world 函数",
      "type": "pass_fail",
      "prompt": "创建 hello.ts，导出 greet(name) 函数",
      "workspace_overlay": "./cases/tc-001/workspace",
      "timeout_ms": 60000,
      "validators": [
        { "type": "file_exists", "path": "hello.ts" },
        { "type": "command_check", "command": "npx tsx -e \"...\"", "expected_exit_code": 0 }
      ]
    },
    {
      "id": "tc-002",
      "name": "重构复杂函数",
      "type": "scoring",
      "prompt": "重构 src/utils.ts 以提高可读性",
      "reference_answer": "参考答案...",
      "validators": [
        { "type": "command_check", "command": "npm test", "expected_exit_code": 0, "weight": 0.4 },
        { "type": "llm_judge", "criteria": ["correctness", "quality"], "weight": 0.6 }
      ],
      "scoring": {
        "dimensions": [
          { "name": "correctness", "weight": 0.4 },
          { "name": "code_quality", "weight": 0.3 },
          { "name": "explanation", "weight": 0.3 }
        ]
      }
    }
  ]
}
```

### 结果输出 (`results.json`)

```json
{
  "metadata": {
    "eval_name": "my-evaluation",
    "timestamp": "2026-05-16T10:30:00Z",
    "duration_ms": 245000,
    "config": { "model": "...", "concurrency": 4, "sandbox_mode": "docker" }
  },
  "summary": {
    "total": 10, "passed": 7, "failed": 2, "errored": 1,
    "pass_rate": 0.7, "average_score": 7.2
  },
  "cases": [
    {
      "id": "tc-001", "name": "...", "type": "pass_fail",
      "status": "passed", "duration_ms": 12500,
      "validators": [{ "type": "file_exists", "passed": true, "message": "..." }],
      "agent_output_summary": "...", "error": null
    }
  ]
}
```

## Docker 策略

1. **基础镜像**: `node:20-slim` + 安装 opencode CLI
2. **每用例一容器**: 创建 → 复制 workspace → 写入 .opencode.json → 启动 opencode serve → 健康检查 → 执行 → 销毁
3. **端口分配**: 从 14096 开始的端口池，并发数即最大端口数
4. **清理**: 正常结束和 SIGINT/SIGTERM 都会清理所有容器

## 并发模型

```
Orchestrator
  └── p-limit(concurrency)
       ├── Case 1: create sandbox → execute → validate → destroy
       ├── Case 2: create sandbox → execute → validate → destroy
       └── Case N: ...
```

- `Promise.allSettled` 确保单个失败不影响其他用例
- 全局 AbortController 支持超时和优雅关闭
- EventEmitter 模式报告进度

## CLI 接口

```bash
agent-eval run -c eval.config.json          # 运行评测
agent-eval run --local                      # 本地模式（无 Docker）
agent-eval run -j 8 --filter "tc-00*"       # 8 并发，过滤用例
agent-eval validate -c eval.config.json     # 仅验证配置和数据集
agent-eval report -i results.json           # 从已有结果重新生成报告
agent-eval init                             # 脚手架新项目
agent-eval build-image                      # 构建 Docker 镜像
```

## 实现顺序

1. **Phase 1 - 基础**: 项目脚手架、配置 schema/loader、数据集 parser、CLI 骨架
2. **Phase 2 - 沙箱**: Docker sandbox manager、本地模式、端口分配
3. **Phase 3 - 执行**: OpenCode HTTP 客户端、SSE 流消费、Executor、Orchestrator
4. **Phase 4 - 验证**: 验证器引擎、内置验证器、自定义脚本、LLM-as-judge
5. **Phase 5 - 报告**: JSON reporter、Markdown reporter、CLI 进度展示
6. **Phase 6 - 完善**: 错误处理、init/build-image 命令、示例和测试

## 关键依赖

- `dockerode` - Docker API 客户端
- `p-limit` - 并发控制
- `zod` - 运行时 schema 验证
- `commander` - CLI 参数解析
- `ora` + `cli-table3` - CLI 进度展示
- `eventsource-parser` - 解析 OpenCode SSE 流
- `vitest` - 测试框架

## 验证方式

实现完成后：
1. `agent-eval validate` 验证配置和数据集格式
2. `agent-eval run --local --filter "tc-001"` 本地模式运行单个用例
3. `agent-eval run` Docker 模式完整运行
4. 检查 `results/results.json` 和 `results/report.md` 输出
