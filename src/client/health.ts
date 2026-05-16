import { sleep } from "../utils/retry.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("client:health");

export interface WaitForReadyOptions {
  url: string;
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
}

export async function waitForReady(opts: WaitForReadyOptions): Promise<void> {
  const timeout = opts.timeoutMs ?? 30_000;
  const interval = opts.intervalMs ?? 250;
  const start = Date.now();
  let lastErr: unknown = null;
  while (Date.now() - start < timeout) {
    if (opts.signal?.aborted) throw new Error("aborted");
    try {
      const res = await fetch(opts.url, { signal: opts.signal });
      if (res.ok) return;
      lastErr = new Error(`status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    log.debug("waiting for opencode", { url: opts.url });
    await sleep(interval, opts.signal);
  }
  throw new Error(
    `opencode at ${opts.url} not ready within ${timeout}ms: ${(lastErr as Error)?.message ?? "unknown"}`,
  );
}
