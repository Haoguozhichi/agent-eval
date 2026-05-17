const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // Config
  getConfig: () => request<Record<string, unknown>>("/config"),
  saveConfig: (data: unknown) => request("/config", { method: "PUT", body: JSON.stringify(data) }),

  // Dataset
  getDataset: () => request<Record<string, unknown>>("/dataset"),
  saveDataset: (data: unknown) => request("/dataset", { method: "PUT", body: JSON.stringify(data) }),
  uploadDataset: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/dataset/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Run
  startRun: () => request<{ run_id: string }>("/run", { method: "POST" }),
  getRunStatus: () => request<{ status: string; run_id: string | null; progress: unknown }>("/run/status"),
  abortRun: () => request("/run/abort", { method: "POST" }),
  subscribeEvents: () => new EventSource(`${BASE}/run/events`),

  // Results
  getResults: () => request<unknown[]>("/results"),
  getResult: (runId: string) => request<Record<string, unknown>>(`/results/${runId}`),
  getReport: async (runId: string) => {
    const res = await fetch(`${BASE}/results/${runId}/report`);
    return res.text();
  },
  getMessages: (runId: string, caseId: string) =>
    request<unknown[]>(`/results/${runId}/cases/${caseId}/messages`),
  getFiles: (runId: string, caseId: string) =>
    request<unknown[]>(`/files/${runId}/cases/${caseId}/files`),
  getFileContent: async (runId: string, caseId: string, path: string) => {
    const res = await fetch(`${BASE}/files/${runId}/cases/${caseId}/files/${path}`);
    return res.json();
  },

  // Skills
  getSkills: () => request<{ name: string; file: string }[]>("/skills"),
  getSkillContent: (name: string) => request<{ name: string; content: string }>(`/skills/${name}`),

  // Health
  health: () => request<{ status: string }>("/health"),
};
