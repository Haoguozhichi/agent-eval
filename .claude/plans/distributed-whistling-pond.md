# Plan: Skill/MCP 外挂 + UI 优化（4 项调整）

## 用户需求

1. **Skill/MCP 外挂机制** — MCP 在前端可配置（表单+JSON 双模式），Skill 放在 `data/skills/*.md`，前端可选择加载哪些。隔离机制：容器级隔离，本地模式通过设置 `HOME` 环境变量指向临时目录，确保 opencode 不加载全局配置。
2. **LLM 裁判评分维度 UI 优化** — 维度名称、评分细节描述、占比权重，界面更清晰
3. **运行界面实时更新** — 每评测完一个 case 立即更新到前端，正在评测的 case 高亮显示，完成的 case 在下方展示详情
4. **移除 data/cases 目录** — 所有 result 保存在 results/ 目录下

## 技术发现

### OpenCode MCP 格式
```jsonc
// opencode.json 中的 mcp 块
"mcp": {
  "websearch": {
    "url": "https://mcp.exa.ai/mcp?tools=web_search_exa"  // 远程 MCP (SSE)
  },
  "filesystem": {
    "command": "npx",                                       // 本地 MCP (stdio)
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    "env": { "KEY": "value" }
  }
}
```

### OpenCode Skill 格式
Skills 在 opencode.json 中是 object：`"skills": {}`。opencode 从项目目录的 `.opencode/skills/` 或通过 plugin 加载 skill。我们把 skill .md 文件复制到 sandbox 工作目录的 `.opencode/skills/` 下即可。

### 隔离机制
opencode 加载配置的路径：
1. `~/.config/opencode/opencode.jsonc` (全局)
2. `~/.opencode/opencode.json` (全局)
3. 项目目录的 `opencode.json` (项目级)

本地模式隔离方案：设置 `HOME=/tmp/agent-eval-isolated-xxx` + `XDG_CONFIG_HOME=/tmp/agent-eval-isolated-xxx/.config`，这样 opencode 找不到全局配置，只用我们生成的 `opencode.json`。

## 改动清单

### 1. Skill/MCP 机制

**后端：**
- `src/server/routes/skills.ts` — 新增：列出 `data/skills/` 下的 .md 文件，返回文件名列表
- `src/runner/executor.ts` — 在创建 sandbox 时：
  - 把选中的 skill .md 文件复制到工作目录的 `.opencode/skills/` 下
  - 设置 `HOME` 和 `XDG_CONFIG_HOME` 环境变量指向工作目录（隔离）
- `src/sandbox/local.ts` — spawn opencode 时注入隔离环境变量
- `src/config/schema.ts` — opencode 块的 mcp 保持 `Record<string, unknown>`，前端负责格式

**前端 ConfigView：**
- MCP 配置区域：
  - 简单模式：表单添加 MCP server（名称 + URL 或 command/args）
  - 高级模式：JSON 编辑器
- Skill 选择区域：
  - 从 `/api/skills` 获取可用 skill 列表
  - checkbox 多选要加载的 skill

**API：**
```
GET /api/skills              → 列出 data/skills/ 下的 .md 文件
GET /api/skills/:name        → 获取 skill 文件内容
```

### 2. LLM 裁判评分维度 UI

改进 ConfigView 中 judge.scoring.dimensions 的展示：
- 每个维度一行卡片式布局
- 字段：名称（必填）、描述（评分细节，textarea）、权重占比（数字，自动归一化显示百分比）
- 添加/删除按钮更明显

### 3. 运行界面实时更新

当前 RunView 已经有 SSE 实时更新（上次修复过），但需要增强：
- 正在评测的 case：高亮 + spinner
- 完成的 case：在表格下方展示简要结果卡片（状态、耗时、token、工具调用）
- SSE `case.started` 事件已经在发送，前端需要正确处理

### 4. 移除 data/cases

- `data/cases/` 目录是 dataset 中 `workspace_overlay` 引用的
- 改为：workspace_overlay 路径相对于 dataset.json 所在目录（即 `data/`）
- 用户如果需要 overlay 文件，直接放在 `data/` 下的任意子目录
- 不需要代码改动，只是文件组织约定

## 示例 Skill 和 MCP

### 示例 Skill: `data/skills/code-review.md`
```markdown
---
name: code-review
description: Review code for bugs, style issues, and improvements
---

You are a code reviewer. When asked to review code:
1. Check for bugs and logic errors
2. Suggest style improvements
3. Note any security concerns
4. Provide a summary rating (1-10)
```

### 示例 MCP: websearch
```json
{
  "websearch": {
    "url": "https://mcp.exa.ai/mcp?tools=web_search_exa"
  }
}
```

### 测试用例
```json
{
  "id": "tc-mcp-search",
  "name": "use web search to find info",
  "prompt": "Use the web search tool to find the current version of Node.js LTS, then create a file answer.txt with just the version number.",
  "validators": [
    { "type": "file_exists", "path": "answer.txt" }
  ]
}
```

## 实现步骤

1. 后端：`src/server/routes/skills.ts` + 注册路由
2. 后端：executor 隔离机制（HOME 环境变量 + skill 文件复制）
3. 前端：ConfigView MCP 配置（表单+JSON 双模式）
4. 前端：ConfigView Skill 选择（checkbox 列表）
5. 前端：ConfigView 评分维度 UI 优化
6. 前端：RunView 增强（完成 case 展示卡片）
7. 创建示例 skill 和测试 dataset
8. 端到端测试
