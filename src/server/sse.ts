import { EventEmitter } from "node:events";

export type SSEEventType =
  | "run.started"
  | "case.started"
  | "case.completed"
  | "run.completed"
  | "run.error";

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
}

class SSEBus {
  private emitter = new EventEmitter();

  on(event: "message", listener: (payload: SSEEvent) => void): void {
    this.emitter.on("message", listener);
  }

  off(event: "message", listener: (payload: SSEEvent) => void): void {
    this.emitter.off("message", listener);
  }

  send(type: SSEEventType, data: Record<string, unknown>): void {
    this.emitter.emit("message", { type, data } satisfies SSEEvent);
  }
}

export const sseBus = new SSEBus();
