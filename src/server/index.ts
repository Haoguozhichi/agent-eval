import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { resolve } from "node:path";
import { configRoutes } from "./routes/config.ts";
import { datasetRoutes } from "./routes/dataset.ts";
import { evaluationRoutes } from "./routes/evaluation.ts";
import { resultsRoutes } from "./routes/results.ts";
import { filesRoutes } from "./routes/files.ts";
import { skillsRoutes } from "./routes/skills.ts";
import { mcpRoutes } from "./routes/mcp.ts";

const app = new Hono();

// CORS for dev mode (vite dev server on different port)
app.use("/api/*", cors());

// API routes
app.route("/api/config", configRoutes);
app.route("/api/dataset", datasetRoutes);
app.route("/api/run", evaluationRoutes);
app.route("/api/results", resultsRoutes);
app.route("/api/files", filesRoutes);
app.route("/api/skills", skillsRoutes);
app.route("/api/mcp", mcpRoutes);

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Serve static frontend (production)
const webDistPath = resolve(import.meta.dir, "../../web/dist");
app.use("/*", serveStatic({ root: webDistPath }));
app.use("/*", serveStatic({ root: webDistPath, path: "index.html" }));

export { app };
