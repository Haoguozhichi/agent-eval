---
name: user-local-llm-setup
description: "User runs LM Studio on localhost:1234 with qwen models, prefers OpenAI-compatible APIs over Anthropic"
metadata: 
  node_type: memory
  type: user
  originSessionId: c66eac52-8421-4204-b95a-6cfb3e78bbf5
---

User runs local LLMs via LM Studio at `http://127.0.0.1:1234/v1` (currently qwen3.5-9b). Prefers OpenAI-compatible API endpoints over Anthropic SDK. Uses opencode as their coding agent with provider config format:

```json
{
  "model": "lmstudio/qwen3.5-9b",
  "provider": {
    "lmstudio": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://127.0.0.1:1234/v1", "apiKey": "empty" },
      "models": { "qwen3.5-9b": {} }
    }
  }
}
```
