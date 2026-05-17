import { Hono } from "hono";
import { spawn } from "node:child_process";

export const mcpRoutes = new Hono();

interface McpTestRequest {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
}

mcpRoutes.post("/test", async (c) => {
  const body = (await c.req.json()) as McpTestRequest;

  if (body.url) {
    return c.json(await testRemoteMcp(body.name, body.url));
  } else if (body.command) {
    return c.json(await testLocalMcp(body.name, body.command, body.args ?? []));
  }
  return c.json({ status: "error", message: "需要提供 url 或 command" }, 400);
});

async function testRemoteMcp(
  name: string,
  url: string,
): Promise<{ status: string; message: string; latency_ms: number }> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "text/event-stream, application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latency = Math.round(performance.now() - start);

    if (res.ok || res.status === 405) {
      // 200 OK or 405 Method Not Allowed (some MCP servers only accept POST)
      return { status: "ok", message: `连接成功 (HTTP ${res.status})`, latency_ms: latency };
    }

    // Try POST for SSE-based MCP servers
    const res2 = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: { capabilities: {} } }),
      signal: AbortSignal.timeout(10000),
    });

    const latency2 = Math.round(performance.now() - start);
    if (res2.ok) {
      return { status: "ok", message: `连接成功 (POST ${res2.status})`, latency_ms: latency2 };
    }

    return { status: "error", message: `HTTP ${res.status}: ${res.statusText}`, latency_ms: latency };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    const msg = (err as Error).message;
    if (msg.includes("abort") || msg.includes("timeout")) {
      return { status: "error", message: "连接超时 (10s)", latency_ms: latency };
    }
    return { status: "error", message: `连接失败: ${msg}`, latency_ms: latency };
  }
}

async function testLocalMcp(
  name: string,
  command: string,
  args: string[],
): Promise<{ status: string; message: string; latency_ms: number }> {
  const start = performance.now();
  return new Promise((resolve) => {
    try {
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      let stderr = "";
      proc.stderr?.on("data", (c: Buffer) => { stderr += c.toString(); });

      const timeout = setTimeout(() => {
        // Process started and is still running after 3s = success
        proc.kill("SIGTERM");
        resolve({
          status: "ok",
          message: `进程启动成功 (PID ${proc.pid})`,
          latency_ms: Math.round(performance.now() - start),
        });
      }, 3000);

      proc.on("error", (err) => {
        clearTimeout(timeout);
        resolve({
          status: "error",
          message: `启动失败: ${err.message}`,
          latency_ms: Math.round(performance.now() - start),
        });
      });

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({
            status: "ok",
            message: "进程正常退出",
            latency_ms: Math.round(performance.now() - start),
          });
        } else {
          resolve({
            status: "error",
            message: `进程退出码 ${code}${stderr ? ": " + stderr.slice(0, 200) : ""}`,
            latency_ms: Math.round(performance.now() - start),
          });
        }
      });
    } catch (err) {
      resolve({
        status: "error",
        message: `启动失败: ${(err as Error).message}`,
        latency_ms: Math.round(performance.now() - start),
      });
    }
  });
}
