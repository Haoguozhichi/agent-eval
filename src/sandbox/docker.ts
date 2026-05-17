import Docker from "dockerode";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cp } from "node:fs/promises";
import { Readable } from "node:stream";
import { extract, pack } from "tar-stream";
import type { EvalConfig } from "../config/types.ts";
import type { PortPool } from "../utils/port.ts";
import { createLogger } from "../utils/logger.ts";
import { sleep } from "../utils/retry.ts";
import type {
  ExecOptions,
  ExecResult,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "./types.ts";

const log = createLogger("sandbox:docker");

export class DockerSandboxProvider implements SandboxProvider {
  readonly mode = "docker" as const;
  private docker: Docker;
  private active = new Set<DockerSandboxHandle>();

  constructor(private config: EvalConfig, private portPool: PortPool) {
    this.docker = new Docker();
  }

  async create(spec: SandboxSpec, signal: AbortSignal): Promise<SandboxHandle> {
    const port = await this.portPool.acquire(signal);
    const stagingDir = await mkdtemp(join(tmpdir(), `agent-eval-stage-${spec.caseId}-`));
    let container: Docker.Container | null = null;
    try {
      if (spec.workspaceSrc) {
        await cp(spec.workspaceSrc, stagingDir, { recursive: true });
      }
      if (spec.workspaceOverlay) {
        await cp(spec.workspaceOverlay, stagingDir, { recursive: true });
      }
      await writeFile(
        join(stagingDir, "opencode.json"),
        JSON.stringify(spec.opencodeConfig, null, 2),
        "utf-8",
      );

      const envArr = Object.entries({ ...spec.env }).map(
        ([k, v]) => `${k}=${v}`,
      );

      container = await this.docker.createContainer({
        Image: "agent-eval/opencode:latest",
        name: `agent-eval-${spec.caseId}-${port}`,
        Cmd: ["opencode", "serve", "--port", String(port), "--hostname", "0.0.0.0"],
        WorkingDir: "/workspace",
        Env: envArr,
        Tty: false,
        ExposedPorts: { [`${port}/tcp`]: {} },
        HostConfig: {
          AutoRemove: false,
          Memory: 2 * 1024 ** 3,
          NanoCpus: 2 * 1e9,
          NetworkMode: "bridge",
          PortBindings: { [`${port}/tcp`]: [{ HostPort: String(port) }] },
        },
      });

      const tarStream = await packDirectory(stagingDir);
      await container.putArchive(tarStream, { path: "/workspace" });

      await container.start();

      const handle = new DockerSandboxHandle({
        caseId: spec.caseId,
        port,
        container,
        stagingDir,
        portPool: this.portPool,
        onDestroyed: () => this.active.delete(handle),
      });
      this.active.add(handle);
      return handle;
    } catch (err) {
      this.portPool.release(port);
      if (container) await container.remove({ force: true }).catch(() => {});
      await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled([...this.active].map((h) => h.destroy()));
  }
}

interface DockerHandleOpts {
  caseId: string;
  port: number;
  container: Docker.Container;
  stagingDir: string;
  portPool: PortPool;
  onDestroyed: () => void;
}

class DockerSandboxHandle implements SandboxHandle {
  readonly mode = "docker" as const;
  readonly host = "127.0.0.1";
  readonly id: string;
  readonly port: number;
  readonly workdir = "/workspace";
  private container: Docker.Container;
  private stagingDir: string;
  private portPool: PortPool;
  private destroyed = false;
  private onDestroyed: () => void;

  constructor(opts: DockerHandleOpts) {
    this.id = `docker-${opts.caseId}`;
    this.port = opts.port;
    this.container = opts.container;
    this.stagingDir = opts.stagingDir;
    this.portPool = opts.portPool;
    this.onDestroyed = opts.onDestroyed;
  }

  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    const start = performance.now();
    const shell = options.shell ?? "/bin/sh";
    const env = options.env
      ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
      : undefined;

    const exec = await this.container.exec({
      Cmd: [shell, "-c", command],
      WorkingDir: options.cwd ?? "/workspace",
      Env: env,
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: options.stdin !== undefined,
      Tty: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const stream = await exec.start({ hijack: true, stdin: options.stdin !== undefined });
    if (options.stdin !== undefined) {
      stream.write(options.stdin);
      stream.end();
    }

    const out = collectMultiplexed(stream, (s, e) => {
      stdout += s;
      stderr += e;
    });

    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          stream.destroy();
        }, options.timeoutMs)
      : null;
    const onAbort = () => {
      timedOut = true;
      stream.destroy();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      await out;
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }

    const inspect = await exec.inspect();
    return {
      exitCode: inspect.ExitCode ?? -1,
      stdout,
      stderr,
      timedOut,
      durationMs: Math.round(performance.now() - start),
    };
  }

  async readFile(path: string): Promise<string> {
    const target = this.resolveInWorkdir(path);
    const stream = await this.container.getArchive({ path: target });
    return readSingleFileFromTar(stream);
  }

  async writeFile(path: string, content: string): Promise<void> {
    const target = this.resolveInWorkdir(path);
    const tar = pack();
    tar.entry({ name: posixBasename(target), mode: 0o644 }, content);
    tar.finalize();
    const dir = posixDirname(target);
    await this.container.putArchive(Readable.from(streamFromTar(tar)), { path: dir });
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      await this.container.infoArchive({ path: this.resolveInWorkdir(path) });
      return true;
    } catch {
      return false;
    }
  }

  async copyWorkdirTo(dest: string): Promise<void> {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dest, { recursive: true });
    const stream = await this.container.getArchive({ path: "/workspace" });
    await extractTarToDir(stream, dest);
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      await this.container.stop({ t: 2 }).catch(() => {});
      await this.container.remove({ force: true }).catch(() => {});
    } finally {
      this.portPool.release(this.port);
      await rm(this.stagingDir, { recursive: true, force: true }).catch(() => {});
      this.onDestroyed();
    }
  }

  private resolveInWorkdir(path: string): string {
    if (path.startsWith("/")) return path;
    return `${this.workdir}/${path}`;
  }
}

function parseMemory(s: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*([kmg]?)b?$/i.exec(s.trim());
  if (!match) throw new Error(`invalid memory_limit: ${s}`);
  const n = parseFloat(match[1]!);
  const unit = (match[2] ?? "").toLowerCase();
  const mult = unit === "g" ? 1024 ** 3 : unit === "m" ? 1024 ** 2 : unit === "k" ? 1024 : 1;
  return Math.round(n * mult);
}

function packDirectory(dir: string): Promise<Readable> {
  // Use tar-stream to recursively pack
  return new Promise(async (resolveTar, rejectTar) => {
    const tar = pack();
    try {
      const { readdir, stat: fsStat, readFile: fsRead } = await import("node:fs/promises");
      async function walk(current: string, rel: string): Promise<void> {
        const entries = await readdir(current);
        for (const entry of entries) {
          const full = join(current, entry);
          const relPath = rel ? `${rel}/${entry}` : entry;
          const st = await fsStat(full);
          if (st.isDirectory()) {
            await new Promise<void>((res, rej) =>
              tar.entry({ name: `${relPath}/`, type: "directory", mode: st.mode & 0o777 }, (err) =>
                err ? rej(err) : res(),
              ),
            );
            await walk(full, relPath);
          } else if (st.isFile()) {
            const content = await fsRead(full);
            await new Promise<void>((res, rej) =>
              tar.entry({ name: relPath, mode: st.mode & 0o777, size: content.length }, content, (err) =>
                err ? rej(err) : res(),
              ),
            );
          }
        }
      }
      await walk(dir, "");
      tar.finalize();
      resolveTar(tar as unknown as Readable);
    } catch (err) {
      rejectTar(err);
    }
  });
}

async function* streamFromTar(tar: ReturnType<typeof pack>): AsyncGenerator<Buffer> {
  for await (const chunk of tar as unknown as AsyncIterable<Buffer>) {
    yield chunk;
  }
}

function readSingleFileFromTar(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolveRead, rejectRead) => {
    const ex = extract();
    let result = "";
    let found = false;
    ex.on("entry", (header, entryStream, next) => {
      if (header.type === "file" && !found) {
        found = true;
        const chunks: Buffer[] = [];
        entryStream.on("data", (c: Buffer) => chunks.push(c));
        entryStream.on("end", () => {
          result = Buffer.concat(chunks).toString("utf-8");
          next();
        });
        entryStream.resume();
      } else {
        entryStream.on("end", next);
        entryStream.resume();
      }
    });
    ex.on("finish", () => resolveRead(result));
    ex.on("error", rejectRead);
    stream.pipe(ex);
  });
}

function collectMultiplexed(
  stream: NodeJS.ReadableStream,
  onChunk: (stdout: string, stderr: string) => void,
): Promise<void> {
  return new Promise((resolveCollect, rejectCollect) => {
    let buf = Buffer.alloc(0);
    stream.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 8) {
        const streamType = buf[0];
        const size = buf.readUInt32BE(4);
        if (buf.length < 8 + size) break;
        const payload = buf.slice(8, 8 + size).toString("utf-8");
        buf = buf.slice(8 + size);
        if (streamType === 1) onChunk(payload, "");
        else if (streamType === 2) onChunk("", payload);
      }
    });
    stream.on("end", () => resolveCollect());
    stream.on("error", rejectCollect);
  });
}

function posixBasename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function posixDirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "." : p.slice(0, i) || "/";
}

function extractTarToDir(stream: NodeJS.ReadableStream, dest: string): Promise<void> {
  return new Promise((resolveExtract, rejectExtract) => {
    const ex = extract();
    const pending: Promise<void>[] = [];
    ex.on("entry", (header, entryStream, next) => {
      // Strip leading "workspace/" prefix from paths
      let name = header.name;
      const prefix = "workspace/";
      if (name.startsWith(prefix)) name = name.slice(prefix.length);
      if (!name || name === ".") {
        entryStream.on("end", next);
        entryStream.resume();
        return;
      }
      const target = `${dest}/${name}`;
      if (header.type === "directory") {
        const p = import("node:fs/promises").then(({ mkdir }) =>
          mkdir(target, { recursive: true }),
        );
        pending.push(p.then(() => {}));
        entryStream.on("end", next);
        entryStream.resume();
      } else if (header.type === "file") {
        const chunks: Buffer[] = [];
        entryStream.on("data", (c: Buffer) => chunks.push(c));
        entryStream.on("end", () => {
          const p = import("node:fs/promises").then(async ({ mkdir: mk, writeFile: wf }) => {
            const dir = target.slice(0, target.lastIndexOf("/"));
            if (dir) await mk(dir, { recursive: true });
            await wf(target, Buffer.concat(chunks));
          });
          pending.push(p);
          next();
        });
        entryStream.resume();
      } else {
        entryStream.on("end", next);
        entryStream.resume();
      }
    });
    ex.on("finish", async () => {
      try {
        await Promise.all(pending);
        resolveExtract();
      } catch (err) {
        rejectExtract(err);
      }
    });
    ex.on("error", rejectExtract);
    stream.pipe(ex);
  });
}

export { sleep };
