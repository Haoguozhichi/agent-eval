#!/usr/bin/env bun
import { buildCli } from "../src/cli.ts";

async function main(): Promise<void> {
  const program = buildCli();
  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
