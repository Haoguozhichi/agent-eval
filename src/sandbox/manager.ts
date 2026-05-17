import type { EvalConfig } from "../config/types.ts";
import { PortPool } from "../utils/port.ts";
import { LocalSandboxProvider } from "./local.ts";
import type { SandboxProvider } from "./types.ts";

export function createSandboxProvider(config: EvalConfig): SandboxProvider {
  const portPool = new PortPool(14096, config.execution.concurrency);
  return new LocalSandboxProvider(config, portPool);
}
