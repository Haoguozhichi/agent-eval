import type { JudgeConfig } from "../config/types.ts";
import { finalizeTokens, type TokenUsage } from "../runner/metrics.ts";

export interface JudgeRequest {
  prompt: string;
  signal?: AbortSignal;
}

export interface JudgeResponse {
  text: string;
  usage: TokenUsage;
  durationMs: number;
}

export interface JudgeClient {
  complete(req: JudgeRequest): Promise<JudgeResponse>;
}

export function createJudgeClient(judge: JudgeConfig): JudgeClient {
  if (judge.type === "anthropic") return new AnthropicJudgeClient(judge);
  return new OpenAICompatibleJudgeClient(judge);
}

function resolveApiKey(judge: JudgeConfig): string | undefined {
  if (judge.api_key) return judge.api_key;
  if (judge.api_key_env) return process.env[judge.api_key_env];
  return undefined;
}

function normalizeModel(model: string): string {
  return model.includes("/") ? model.split("/").slice(-1)[0]! : model;
}

class OpenAICompatibleJudgeClient implements JudgeClient {
  constructor(private cfg: JudgeConfig) {}

  async complete(req: JudgeRequest): Promise<JudgeResponse> {
    const baseUrl = this.cfg.base_url!.replace(/\/+$/, "");
    const apiKey = resolveApiKey(this.cfg) ?? "EMPTY";
    const start = performance.now();

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        ...this.cfg.extra_headers,
      },
      body: JSON.stringify({
        model: normalizeModel(this.cfg.model),
        temperature: this.cfg.temperature,
        max_tokens: this.cfg.max_tokens,
        messages: [{ role: "user", content: req.prompt }],
      }),
      signal: req.signal,
    });

    if (!res.ok) {
      throw new Error(`judge ${res.status}: ${await res.text().catch(() => "")}`);
    }

    const json = (await res.json()) as ChatCompletionResponse;
    const text = json.choices?.[0]?.message?.content ?? "";
    const usage = finalizeTokens({
      input: json.usage?.prompt_tokens ?? 0,
      output: json.usage?.completion_tokens ?? 0,
      cache_read: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      cache_write: 0,
      total: 0,
    });

    return {
      text,
      usage,
      durationMs: Math.round(performance.now() - start),
    };
  }
}

class AnthropicJudgeClient implements JudgeClient {
  constructor(private cfg: JudgeConfig) {}

  async complete(req: JudgeRequest): Promise<JudgeResponse> {
    const baseUrl = (this.cfg.base_url ?? "https://api.anthropic.com").replace(/\/+$/, "");
    const apiKey = resolveApiKey(this.cfg) ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("anthropic judge requires api_key/api_key_env or ANTHROPIC_API_KEY");
    const start = performance.now();

    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        ...this.cfg.extra_headers,
      },
      body: JSON.stringify({
        model: normalizeModel(this.cfg.model),
        temperature: this.cfg.temperature,
        max_tokens: this.cfg.max_tokens,
        messages: [{ role: "user", content: req.prompt }],
      }),
      signal: req.signal,
    });

    if (!res.ok) {
      throw new Error(`judge ${res.status}: ${await res.text().catch(() => "")}`);
    }

    const json = (await res.json()) as AnthropicResponse;
    const text =
      json.content?.map((b) => (b.type === "text" ? b.text : "")).join("") ?? "";
    const usage = finalizeTokens({
      input: json.usage?.input_tokens ?? 0,
      output: json.usage?.output_tokens ?? 0,
      cache_read: json.usage?.cache_read_input_tokens ?? 0,
      cache_write: json.usage?.cache_creation_input_tokens ?? 0,
      total: 0,
    });

    return {
      text,
      usage,
      durationMs: Math.round(performance.now() - start),
    };
  }
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}
