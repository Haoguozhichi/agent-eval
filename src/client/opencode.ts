import { createParser, type EventSourceMessage } from "eventsource-parser";
import { createLogger } from "../utils/logger.ts";
import { emptyTokenUsage, finalizeTokens } from "../runner/metrics.ts";
import type { TokenUsage } from "../runner/metrics.ts";
import { waitForReady } from "./health.ts";
import type {
  AgentRunResult,
  MessageEndEvent,
  MessageStreamHandlers,
  SendMessageOptions,
  SessionInfo,
  ToolCallEvent,
  ToolResultEvent,
} from "./types.ts";

const log = createLogger("client:opencode");

export interface OpenCodeClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  readyTimeoutMs?: number;
}

export class OpenCodeClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: OpenCodeClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async waitReady(signal?: AbortSignal, timeoutMs = 30_000): Promise<void> {
    await waitForReady({
      url: `${this.baseUrl}/app`,
      timeoutMs,
      signal,
    });
  }

  async createSession(title?: string, signal?: AbortSignal): Promise<SessionInfo> {
    const res = await this.fetchImpl(`${this.baseUrl}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`createSession failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { id: string; title?: string };
    return { id: json.id, title: json.title };
  }

  async deleteSession(id: string, signal?: AbortSignal): Promise<void> {
    await this.fetchImpl(`${this.baseUrl}/session/${id}`, {
      method: "DELETE",
      signal,
    }).catch(() => undefined);
  }

  async sendMessage(
    options: SendMessageOptions,
    handlers: MessageStreamHandlers,
  ): Promise<AgentRunResult> {
    const evtController = new AbortController();
    const onParentAbort = () => evtController.abort();
    options.signal?.addEventListener("abort", onParentAbort, { once: true });

    const eventsTask = this.consumeEvents(
      options.sessionId,
      handlers,
      evtController.signal,
    );

    const res = await this.fetchImpl(
      `${this.baseUrl}/session/${options.sessionId}/message`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parts: [{ type: "text", text: options.text }],
        }),
        signal: options.signal,
      },
    );

    if (!res.ok) {
      evtController.abort();
      options.signal?.removeEventListener("abort", onParentAbort);
      throw new Error(
        `sendMessage failed: ${res.status} ${await res.text().catch(() => "")}`,
      );
    }

    const result = await eventsTask;
    options.signal?.removeEventListener("abort", onParentAbort);

    // Fetch final session state for accurate token counts
    const finalTokens = await this.getSessionTokens(options.sessionId, options.signal);
    if (finalTokens) {
      result.usage = finalTokens;
    }

    // Fetch messages to count tool calls accurately
    const messages = await this.getSessionMessages(options.sessionId, options.signal);
    if (messages) {
      const { toolCalls, toolResults, messageCount } = extractToolInfo(messages, options.sessionId);
      if (toolCalls.length > 0) {
        result.toolCalls = toolCalls;
        result.toolResults = toolResults;
      }
      if (messageCount > 0) result.messages = messageCount;
    }

    return result;
  }

  private async getSessionTokens(sessionId: string, signal?: AbortSignal): Promise<TokenUsage | null> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/session/${sessionId}`, { signal });
      if (!res.ok) return null;
      const json = (await res.json()) as { tokens?: Record<string, unknown> };
      if (!json.tokens) return null;
      const t = json.tokens;
      const cache = t.cache as Record<string, unknown> | undefined;
      return finalizeTokens({
        input: numOr(t.input, 0),
        output: numOr(t.output, 0),
        cache_read: numOr(cache?.read, 0),
        cache_write: numOr(cache?.write, 0),
        total: 0,
      });
    } catch {
      return null;
    }
  }

  private async getSessionMessages(sessionId: string, signal?: AbortSignal): Promise<unknown[] | null> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/session/${sessionId}/message`, { signal });
      if (!res.ok) return null;
      const json = await res.json();
      if (Array.isArray(json)) return json;
      return null;
    } catch {
      return null;
    }
  }

  private async consumeEvents(
    sessionId: string,
    handlers: MessageStreamHandlers,
    signal: AbortSignal,
  ): Promise<AgentRunResult> {
    const url = `${this.baseUrl}/event`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: { accept: "text/event-stream" },
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`event stream failed: ${res.status}`);
    }

    const aggregator = new MessageAggregator(sessionId, handlers);

    const parser = createParser({
      onEvent: (msg: EventSourceMessage) => {
        if (!msg.data) return;
        try {
          const payload = JSON.parse(msg.data) as OpenCodeEvent;
          aggregator.handle(payload);
        } catch (err) {
          log.debug("failed to parse event", { err: (err as Error).message });
        }
      },
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        if (signal.aborted) break;
        if (aggregator.done) break;
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if (!signal.aborted) throw err;
    } finally {
      try { reader.cancel().catch(() => {}); } catch {}
    }

    return aggregator.finish();
  }
}

interface OpenCodeEvent {
  id?: string;
  type: string;
  properties?: Record<string, unknown>;
}

class MessageAggregator {
  done = false;
  private text = "";
  private usage: TokenUsage = emptyTokenUsage();
  private messages = 0;
  private toolCalls: ToolCallEvent[] = [];
  private toolResults: ToolResultEvent[] = [];
  private seenPartIds = new Set<string>();
  private partTypes = new Map<string, string>();
  private currentMessageId: string | null = null;

  constructor(
    private sessionId: string,
    private handlers: MessageStreamHandlers,
  ) {}

  handle(evt: OpenCodeEvent): void {
    const props = evt.properties ?? {};
    if (!this.isForSession(props)) return;

    switch (evt.type) {
      case "session.updated":
        this.onSessionUpdated(props);
        break;
      case "session.status":
        this.onSessionStatus(props);
        break;
      case "session.idle":
        this.complete();
        break;
      case "message.part.delta":
        this.onPartDelta(props);
        break;
      case "message.created":
      case "message.updated":
        this.onMessageEvent(props);
        break;
      default:
        break;
    }
  }

  finish(): AgentRunResult {
    this.usage = finalizeTokens(this.usage);
    return {
      text: this.text,
      usage: this.usage,
      finishReason: "stop",
      messages: this.messages,
      toolCalls: this.toolCalls,
      toolResults: this.toolResults,
    };
  }

  private complete(): void {
    if (this.currentMessageId) {
      const end: MessageEndEvent = {
        messageId: this.currentMessageId,
        finishReason: "stop",
        text: this.text,
        usage: finalizeTokens({ ...this.usage }),
      };
      this.handlers.onMessageEnd?.(end);
    }
    this.done = true;
  }

  private onSessionUpdated(props: Record<string, unknown>): void {
    const info = props.info as Record<string, unknown> | undefined;
    if (!info) return;
    const tokens = info.tokens as Record<string, unknown> | undefined;
    if (tokens) {
      this.extractTokens(tokens);
      this.handlers.onUsage?.(finalizeTokens({ ...this.usage }));
    }
  }

  private onSessionStatus(props: Record<string, unknown>): void {
    const status = props.status as Record<string, unknown> | undefined;
    if (status?.type === "idle") {
      this.complete();
    }
  }

  private onMessageEvent(props: Record<string, unknown>): void {
    const info = props.info as Record<string, unknown> | undefined;
    const id = (info?.id ?? props.messageID) as string | undefined;
    const role = info?.role as string | undefined;
    if (id && role === "assistant" && id !== this.currentMessageId) {
      this.currentMessageId = id;
      this.messages += 1;
      this.handlers.onMessageStart?.(id);
    }
  }

  private onPartDelta(props: Record<string, unknown>): void {
    const messageId = (props.messageID as string) ?? this.currentMessageId;
    const partId = props.partID as string | undefined;
    const field = props.field as string | undefined;
    const delta = props.delta as string | undefined;

    if (messageId && messageId !== this.currentMessageId) {
      this.currentMessageId = messageId;
      this.messages += 1;
      this.handlers.onMessageStart?.(messageId);
    }

    if (!partId) return;

    if (field === "type" && delta) {
      this.partTypes.set(partId, delta);
      return;
    }

    const partType = this.partTypes.get(partId);

    if (field === "text" && delta) {
      if (!partType || partType === "text") {
        this.text += delta;
        if (messageId) this.handlers.onTextDelta?.(messageId, delta);
      }
    }

    if (field === "tool" && delta && messageId) {
      if (!this.seenPartIds.has(partId)) {
        this.seenPartIds.add(partId);
        const call: ToolCallEvent = {
          messageId,
          toolCallId: partId,
          toolName: delta,
          input: null,
        };
        this.toolCalls.push(call);
        this.handlers.onToolCall?.(call);
      }
    }

    if (field === "state" && delta && messageId) {
      try {
        const state = JSON.parse(delta) as Record<string, unknown>;
        const status = state.status as string | undefined;
        if (status === "completed" || status === "error") {
          const toolName = this.toolCalls.find((c) => c.toolCallId === partId)?.toolName ?? "unknown";
          const result: ToolResultEvent = {
            messageId,
            toolCallId: partId,
            toolName,
            errored: status === "error",
            output: typeof state.output === "string" ? state.output : null,
          };
          this.toolResults.push(result);
          this.handlers.onToolResult?.(result);
        }
      } catch {}
    }

    if (field === "toolName" && delta && messageId) {
      if (!this.seenPartIds.has(partId)) {
        this.seenPartIds.add(partId);
        const call: ToolCallEvent = {
          messageId,
          toolCallId: partId,
          toolName: delta,
          input: null,
        };
        this.toolCalls.push(call);
        this.handlers.onToolCall?.(call);
      }
    }
  }

  private extractTokens(tokens: Record<string, unknown>): void {
    const cache = tokens.cache as Record<string, unknown> | undefined;
    this.usage = {
      input: numOr(tokens.input, this.usage.input),
      output: numOr(tokens.output, this.usage.output),
      cache_read: numOr(cache?.read, this.usage.cache_read),
      cache_write: numOr(cache?.write, this.usage.cache_write),
      total: 0,
    };
  }

  private isForSession(props: Record<string, unknown>): boolean {
    const sid = props.sessionID as string | undefined;
    if (sid) return sid === this.sessionId;
    return true;
  }
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function extractToolInfo(
  messages: unknown[],
  sessionId: string,
): { toolCalls: ToolCallEvent[]; toolResults: ToolResultEvent[]; messageCount: number } {
  const toolCalls: ToolCallEvent[] = [];
  const toolResults: ToolResultEvent[] = [];
  let messageCount = 0;

  for (const msg of messages) {
    const m = msg as Record<string, unknown>;
    const info = m.info as Record<string, unknown> | undefined;
    const role = info?.role as string | undefined;
    const msgId = (info?.id as string) ?? "";
    const parts = m.parts as unknown[] | undefined;

    if (role === "assistant") messageCount += 1;
    if (!parts) continue;

    for (const part of parts) {
      const p = part as Record<string, unknown>;
      const partType = p.type as string | undefined;
      if (partType !== "tool") continue;

      const toolName = (p.tool ?? p.name ?? p.toolName ?? "unknown") as string;
      const partId = (p.id ?? "") as string;
      const state = p.state as Record<string, unknown> | undefined;

      const call: ToolCallEvent = {
        messageId: msgId,
        toolCallId: partId,
        toolName,
        input: (state?.input as Record<string, unknown> | undefined) ?? null,
      };
      toolCalls.push(call);

      const status = state?.status as string | undefined;
      if (status === "completed" || status === "error") {
        toolResults.push({
          messageId: msgId,
          toolCallId: partId,
          toolName,
          errored: status === "error",
          output: typeof state?.output === "string" ? state.output : null,
        });
      }
    }
  }

  return { toolCalls, toolResults, messageCount };
}
