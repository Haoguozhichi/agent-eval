import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cp } from "node:fs/promises";
import type { EvalConfig } from "../config/types.ts";
import type { PortPool } from "../utils/port.ts";
import { createLogger } from "../utils/logger.ts";
import { sleep } from "../utils/retry.ts";
import { DEFAULT_SHELL, shellArgs, gracefulKillSignal, forceKillSignal, opencodeSpawnOpts } from "../utils/platform.ts";
import type {
  ExecOptions,
  ExecResult,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "./types.ts";

const log = createLogger("sandbox:local");

export class LocalSandboxProvider implements SandboxProvider {
  readonly mode = "local" as const;
  private active = new Set<LocalSandboxHandle>();

  constructor(private config: EvalConfig, private portPool: PortPool) {}

  async create(spec: SandboxSpec, signal: AbortSignal): Promise<SandboxHandle> {
    const port = await this.portPool.acquire(signal);
    const workdir = await mkdtemp(join(tmpdir(), `agent-eval-${spec.caseId}-`));
    try {
      if (spec.workspaceSrc) {
        try {
          await cp(spec.workspaceSrc, workdir, { recursive: true });
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
          // workspace dir doesn't exist, skip (it's optional)
        }
      }
      if (spec.workspaceOverlay) {
        await cp(spec.workspaceOverlay, workdir, { recursive: true });
      }
      await writeFile(
        join(workdir, "opencode.json"),
        JSON.stringify(spec.opencodeConfig, null, 2),
        "utf-8",
      );

      const env = {
        ...process.env,
        ...spec.env,
        HOME: workdir,
        USERPROFILE: workdir,
        XDG_CONFIG_HOME: join(workdir, ".config"),
        OPENCODE_PORT: String(port),
      };

      const platformOpts = opencodeSpawnOpts();
      const proc = spawn("opencode", ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
        cwd: workdir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        ...platformOpts,
      });

      proc.stdout?.on("data", (chunk: Buffer) => {
        log.debug(`[${spec.caseId}] stdout`, { chunk: chunk.toString().trim() });
      });
      proc.stderr?.on("data", (chunk: Buffer) => {
        log.debug(`[${spec.caseId}] stderr`, { chunk: chunk.toString().trim() });
      });

      const handle = new LocalSandboxHandle({
        caseId: spec.caseId,
        port,
        workdir,
        proc,
        portPool: this.portPool,
        onDestroyed: () => this.active.delete(handle),
      });
      this.active.add(handle);
      return handle;
    } catch (err) {
      this.portPool.release(port);
      await rm(workdir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled([...this.active].map((h) => h.destroy()));
  }
}

interface LocalHandleOpts {
  caseId: string;
  port: number;
  workdir: string;
  proc: ReturnType<typeof spawn>;
  portPool: PortPool;
  onDestroyed: () => void;
}

class LocalSandboxHandle implements SandboxHandle {
  readonly mode = "local" as const;
  readonly host = "127.0.0.1";
  readonly id: string;
  readonly port: number;
  readonly workdir: string;
  private proc: ReturnType<typeof spawn>;
  private portPool: PortPool;
  private destroyed = false;
  private onDestroyed: () => void;

  constructor(opts: LocalHandleOpts) {
    this.id = `local-${opts.caseId}`;
    this.port = opts.port;
    this.workdir = opts.workdir;
    this.proc = opts.proc;
    this.portPool = opts.portPool;
    this.onDestroyed = opts.onDestroyed;
  }

  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    // On Windows local mode, "/bin/sh" from dataset defaults is invalid;
    // fall back to the platform default shell.
    const effectiveShell = options.shell === "/bin/sh" && DEFAULT_SHELL !== "/bin/sh"
      ? DEFAULT_SHELL
      : options.shell;
    return runShell(command, {
      ...options,
      cwd: options.cwd ?? this.workdir,
      env: mergeEnv(process.env, options.env),
      shell: effectiveShell,
    });
  }

  async readFile(path: string): Promise<string> {
    return readFile(this.resolveInWorkdir(path), "utf-8");
  }

  async writeFile(path: string, content: string): Promise<void> {
    const target = this.resolveInWorkdir(path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf-8");
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      await stat(this.resolveInWorkdir(path));
      return true;
    } catch {
      return false;
    }
  }

  async copyWorkdirTo(dest: string): Promise<void> {
    await mkdir(dest, { recursive: true });
    // Copy only project files, skip HOME artifacts (.cache, .config, .local, .npm, .opencode)
    const skipDirs = new Set([".cache", ".config", ".local", ".npm", ".opencode"]);
    const { readdir: rd } = await import("node:fs/promises");
    const entries = await rd(this.workdir);
    for (const entry of entries) {
      if (skipDirs.has(entry)) continue;
      await cp(join(this.workdir, entry), join(dest, entry), { recursive: true });
    }
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.proc.killed) {
      this.proc.kill(gracefulKillSignal());
      const exited = await waitForExit(this.proc, 3000);
      if (!exited) this.proc.kill(forceKillSignal());
    }
    this.portPool.release(this.port);
    await rm(this.workdir, { recursive: true, force: true }).catch(() => {});
    this.onDestroyed();
  }

  private resolveInWorkdir(path: string): string {
    const abs = resolve(this.workdir, path);
    if (!abs.startsWith(this.workdir)) {
      throw new Error(`path "${path}" escapes workdir`);
    }
    return abs;
  }
}

export async function runShell(command: string, options: ExecOptions = {}): Promise<ExecResult> {
  const start = performance.now();
  const shell = options.shell ?? DEFAULT_SHELL;
  return new Promise((resolveExec) => {
    const proc = spawn(shell, shellArgs(command), {
      cwd: options.cwd,
      env: options.env ?? mergeEnv(process.env),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          proc.kill(forceKillSignal());
        }, options.timeoutMs)
      : null;

    const onAbort = () => {
      timedOut = true;
      proc.kill(forceKillSignal());
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    proc.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    proc.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
    });

    if (options.stdin !== undefined) {
      proc.stdin?.write(options.stdin);
      proc.stdin?.end();
    }

    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolveExec({
        exitCode: code ?? -1,
        stdout,
        stderr,
        timedOut,
        durationMs: Math.round(performance.now() - start),
      });
    });
  });
}

async function waitForExit(proc: ReturnType<typeof spawn>, ms: number): Promise<boolean> {
  if (proc.exitCode !== null) return true;
  return new Promise((resolveExit) => {
    const onExit = () => {
      cleanup();
      resolveExit(true);
    };
    const t = setTimeout(() => {
      cleanup();
      resolveExit(false);
    }, ms);
    function cleanup() {
      clearTimeout(t);
      proc.off("exit", onExit);
    }
    proc.on("exit", onExit);
  });
}

function mergeEnv(
  base: NodeJS.ProcessEnv,
  ...overrides: (Record<string, string> | undefined)[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === "string") out[k] = v;
  }
  for (const o of overrides) {
    if (!o) continue;
    for (const [k, v] of Object.entries(o)) out[k] = v;
  }
  return out;
}

export { sleep };
