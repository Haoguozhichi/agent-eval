---
name: agent-eval-project
description: "agent-eval is an e2e evaluation framework for opencode; uses Bun/TypeScript, opencode serve API, Docker/local sandboxes, OpenAI-compatible judge"
metadata: 
  node_type: memory
  type: project
  originSessionId: c66eac52-8421-4204-b95a-6cfb3e78bbf5
---

agent-eval is an end-to-end evaluation framework for opencode (open-source AI coding agent). Located at `/Users/steven/agent-eval`.

**Why:** User wants to benchmark opencode's capabilities across different models/providers using automated test suites with pass/fail and scored evaluations.

**How to apply:**
- The project uses Bun + TypeScript, no Anthropic SDK dependency
- opencode provider config is passed through verbatim (supports any provider opencode supports)
- Judge supports `openai_compatible` (default) and `anthropic` types via raw fetch
- SSE events from opencode use `message.part.delta` (field: text/tool/state), `session.updated` (tokens), `session.idle` (completion)
- Token counts come from `GET /session/:id` after completion; tool calls from `GET /session/:id/message` (messages array with tool parts)
- User runs LM Studio locally at `http://127.0.0.1:1234/v1` with qwen models
