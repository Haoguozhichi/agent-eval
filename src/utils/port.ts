import { createServer } from "node:net";

export class PortPool {
  private inUse = new Set<number>();
  private cursor: number;

  constructor(private start: number, private size: number) {
    this.cursor = start;
  }

  async acquire(signal?: AbortSignal): Promise<number> {
    const end = this.start + Math.max(this.size, 1) * 8;
    for (let port = this.cursor; port < end; port += 1) {
      if (signal?.aborted) throw new Error("aborted");
      if (this.inUse.has(port)) continue;
      if (await isFree(port)) {
        this.inUse.add(port);
        this.cursor = port + 1;
        return port;
      }
    }
    throw new Error(`no free port available in range starting at ${this.start}`);
  }

  release(port: number): void {
    this.inUse.delete(port);
  }
}

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}
