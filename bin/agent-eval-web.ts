#!/usr/bin/env bun
import { app } from "../src/server/index.ts";

const port = Number(process.env.AGENT_EVAL_PORT ?? 7800);

console.log(`agent-eval web server starting on http://localhost:${port}`);

Bun.serve({
  fetch: app.fetch,
  port,
});

console.log(`agent-eval web server listening on http://localhost:${port}`);
