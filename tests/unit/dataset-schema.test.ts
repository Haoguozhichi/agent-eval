import { describe, expect, it } from "vitest";
import { datasetSchema } from "../../src/dataset/schema.ts";

describe("datasetSchema", () => {
  it("parses a basic case", () => {
    const ds = datasetSchema.parse({
      cases: [{ id: "a", prompt: "do thing", validators: [{ type: "file_exists", path: "x" }] }],
    });
    expect(ds.cases[0]?.id).toBe("a");
  });

  it("requires at least one case", () => {
    expect(() =>
      datasetSchema.parse({ cases: [] }),
    ).toThrow();
  });

  it("validates discriminated validators", () => {
    const ds = datasetSchema.parse({
      cases: [
        {
          id: "a",
          prompt: "p",
          validators: [
            { type: "command_check", command: "true" },
            { type: "regex_match", path: "x.ts", pattern: "foo" },
          ],
        },
      ],
    });
    const v0 = ds.cases[0]!.validators[0]!;
    expect(v0.type).toBe("command_check");
    if (v0.type === "command_check") expect(v0.expected_exit_code).toBe(0);
  });
});
