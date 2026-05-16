import type { TokenUsage } from "../runner/metrics.ts";

export interface SessionInfo {
  id: string;
  title?: string;
}

export interface SendMessageOptions {
  sessionId: string;
  text: string;
  signal?: AbortSignal;
}

export interface MessageStreamHandlers {
  onMessageStart?: (messageId: string) => void;
  onTextDelta?: (messageId: string, text: string) => void;
  onToolCall?: (event: ToolCallEvent) => void;
  onToolResult?: (event: ToolResultEvent) => void;
  onUsage?: (usage: TokenUsage) => void;
  onMessageEnd?: (event: MessageEndEvent) => void;
  onError?: (err: Error) => void;
}

export interface ToolCallEvent {
  messageId: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown> | null;
}

export interface ToolResultEvent {
  messageId: string;
  toolCallId: string;
  toolName: string;
  errored: boolean;
  output: string | null;
}

export interface MessageEndEvent {
  messageId: string;
  finishReason: string | null;
  text: string;
  usage: TokenUsage;
}

export interface AgentRunResult {
  text: string;
  usage: TokenUsage;
  finishReason: string | null;
  messages: number;
  toolCalls: ToolCallEvent[];
  toolResults: ToolResultEvent[];
}
