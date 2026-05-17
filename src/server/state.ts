import type { RunResult, CaseResult } from "../runner/types.ts";

export type RunStatus = "idle" | "running" | "completed" | "error";

export interface CompletedCaseInfo {
  id: string;
  name: string;
  status: string;
  duration: string;
  tokens: number;
  tool_calls: number;
}

export interface AppState {
  status: RunStatus;
  currentRunId: string | null;
  currentCaseId: string | null;
  error: string | null;
  abortController: AbortController | null;
  lastResult: RunResult | null;
  progress: {
    total: number;
    completed: number;
    passed: number;
    failed: number;
  };
  completedCases: CompletedCaseInfo[];
}

export const state: AppState = {
  status: "idle",
  currentRunId: null,
  currentCaseId: null,
  error: null,
  abortController: null,
  lastResult: null,
  progress: { total: 0, completed: 0, passed: 0, failed: 0 },
  completedCases: [],
};

export function resetState(): void {
  state.status = "idle";
  state.currentRunId = null;
  state.currentCaseId = null;
  state.error = null;
  state.abortController = null;
  state.lastResult = null;
  state.progress = { total: 0, completed: 0, passed: 0, failed: 0 };
  state.completedCases = [];
}
