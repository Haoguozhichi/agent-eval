#!/usr/bin/env node
// agent-eval launcher
// Usage: npx agent-eval [--port 7800] [--results ./results]
//
// Pulls and runs the agent-eval Docker container, then opens the browser.

import { execSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const IMAGE = process.env.AGENT_EVAL_IMAGE ?? "agent-eval:latest";
const CONTAINER_NAME = "agent-eval-web";

function parseArgs() {
  const args = process.argv.slice(2);
  let port = 7800;
  let resultsDir = resolve(process.cwd(), "results");

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) port = Number(args[++i]);
    if (args[i] === "--results" && args[i + 1]) resultsDir = resolve(args[++i]);
  }
  return { port, resultsDir };
}

function checkDocker() {
  try {
    execSync("docker info", { stdio: "ignore" });
  } catch {
    console.error("错误: Docker 未运行或未安装。请先安装并启动 Docker。");
    process.exit(1);
  }
}

function stopExisting() {
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: "ignore" });
  } catch {
    // container doesn't exist, that's fine
  }
}

function startContainer(port, resultsDir) {
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

  const dataDir = resolve(process.cwd(), "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const args = [
    "run", "-d",
    "--name", CONTAINER_NAME,
    "-p", `${port}:7800`,
    "-v", `${resultsDir}:/app/results`,
    "-v", `${dataDir}:/app/data`,
    "--add-host", "host.docker.internal:host-gateway",
    IMAGE,
  ];

  console.log(`启动容器: docker ${args.join(" ")}`);
  const result = execSync(`docker ${args.join(" ")}`, { encoding: "utf-8" }).trim();
  console.log(`容器 ID: ${result.slice(0, 12)}`);
  return result;
}

async function waitForReady(port, timeoutMs = 30000) {
  const url = `http://localhost:${port}/api/health`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  try {
    execSync(`${cmd} ${url}`, { stdio: "ignore" });
  } catch {}
}

function cleanup() {
  console.log("\n正在停止容器...");
  try {
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: "ignore" });
    execSync(`docker rm ${CONTAINER_NAME}`, { stdio: "ignore" });
  } catch {}
  console.log("已停止。");
  process.exit(0);
}

async function main() {
  const { port, resultsDir } = parseArgs();

  console.log("agent-eval Web UI");
  console.log("=================\n");

  checkDocker();
  stopExisting();

  console.log(`结果目录: ${resultsDir}`);
  console.log(`端口: ${port}\n`);

  startContainer(port, resultsDir);

  process.stdout.write("等待服务就绪");
  const ready = await waitForReady(port);
  if (!ready) {
    console.error("\n服务启动超时，请检查 Docker 日志: docker logs " + CONTAINER_NAME);
    process.exit(1);
  }
  console.log(" ✓\n");

  const url = `http://localhost:${port}`;
  console.log(`浏览器打开: ${url}`);
  openBrowser(url);

  console.log("\n按 Ctrl+C 停止服务\n");

  // Show container logs
  const logs = spawn("docker", ["logs", "-f", CONTAINER_NAME], { stdio: "inherit" });

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
