import type { RunResult } from "../runner/types.ts";

export type RunStatus = "idle" | "running" | "completed" | "error";

export interface AppState {
  status: RunStatus;
  currentRunId: string | null;
  error: string | null;
  abortController: AbortController | null;
  lastResult: RunResult | null;
  progress: {
    total: number;
    completed: number;
    passed: number;
    failed: number;
  };
}

export const state: AppState = {
  status: "idle",
  currentRunId: null,
  error: null,
  abortController: null,
  lastResult: null,
  progress: { total: 0, completed: 0, passed: 0, failed: 0 },
};

export function resetState(): void {
  state.status = "idle";
  state.currentRunId = null;
  state.error = null;
  state.abortController = null;
  state.lastResult = null;
  state.progress = { total: 0, completed: 0, passed: 0, failed: 0 };
}
