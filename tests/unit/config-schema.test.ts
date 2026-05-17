import { describe, expect, it } from "vitest";
import { evalConfigSchema } from "../../src/config/schema.ts";

describe("evalConfigSchema", () => {
  it("fills defaults", () => {
    const cfg = evalConfigSchema.parse({
      name: "n",
      opencode: { model: "anthropic/claude-sonnet-4-5-20250929" },
      dataset: "./dataset.json",
    });
    expect(cfg.execution.concurrency).toBe(4);
    expect(cfg.dataset).toBe("./dataset.json");
  });

  it("rejects empty model", () => {
    expect(() =>
      evalConfigSchema.parse({
        name: "n",
        opencode: { model: "" },
        dataset: "./dataset.json",
      }),
    ).toThrow();
  });
});
