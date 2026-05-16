export function nowIso(): string {
  return new Date().toISOString();
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
