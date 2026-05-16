export interface RetryOptions {
  retries: number;
  baseMs?: number;
  maxMs?: number;
  factor?: number;
  signal?: AbortSignal;
  onAttempt?: (attempt: number, err: unknown) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const { retries, baseMs = 200, maxMs = 5000, factor = 2, signal, onAttempt } = opts;
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    if (signal?.aborted) throw new Error("aborted");
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      onAttempt?.(attempt, err);
      if (attempt === retries) break;
      const delay = Math.min(maxMs, baseMs * Math.pow(factor, attempt));
      await sleep(delay, signal);
      attempt += 1;
    }
  }
  throw lastErr;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
