export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDurationHuman(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  if (millis > 0) parts.push(`${millis}ms`);
  return parts.join(" ");
}

export class Timer {
  private start: number;

  constructor() {
    this.start = performance.now();
  }

  elapsedMs(): number {
    return Math.round(performance.now() - this.start);
  }

  reset(): void {
    this.start = performance.now();
  }
}
