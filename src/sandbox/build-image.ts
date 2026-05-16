import Docker from "dockerode";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("build-image");

export interface BuildImageOptions {
  tag: string;
  context?: string;
  dockerfile?: string;
}

export async function buildImage(options: BuildImageOptions): Promise<void> {
  const docker = new Docker();
  const ctx = options.context ?? defaultContextDir();
  const dockerfile = options.dockerfile ?? "Dockerfile.eval";

  if (!existsSync(join(ctx, dockerfile))) {
    throw new Error(`Dockerfile not found at ${join(ctx, dockerfile)}`);
  }

  log.info("building image", { tag: options.tag, context: ctx, dockerfile });

  const stream = await docker.buildImage(
    { context: ctx, src: [dockerfile] },
    { t: options.tag, dockerfile },
  );

  await new Promise<void>((resolveBuild, rejectBuild) => {
    docker.modem.followProgress(
      stream as NodeJS.ReadableStream,
      (err) => (err ? rejectBuild(err) : resolveBuild()),
      (event: { stream?: string; error?: string }) => {
        if (event.error) log.error(event.error);
        else if (event.stream) process.stdout.write(event.stream);
      },
    );
  });

  log.info("image built", { tag: options.tag });
}

function defaultContextDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "templates");
}
