import type { EvalConfig } from "../config/types.ts";
import { PortPool } from "../utils/port.ts";
import { DockerSandboxProvider } from "./docker.ts";
import { LocalSandboxProvider } from "./local.ts";
import type { SandboxProvider } from "./types.ts";

export function createSandboxProvider(config: EvalConfig): SandboxProvider {
  const portPool = new PortPool(config.sandbox.port_range_start, config.execution.concurrency);
  if (config.sandbox.mode === "local") {
    return new LocalSandboxProvider(config, portPool);
  }
  return new DockerSandboxProvider(config, portPool);
}
