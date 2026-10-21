import path from "node:path";
import { describe, expect, it } from "vitest";
import { STAGES, type Harness } from "@cyberzavod/core";
import { loadHarness, workflowOf } from "./harness.ts";

const REPOSITORY_HARNESS = path.resolve(import.meta.dirname, "../../../harness");

function harnessWith(names: string[]): Harness {
  return {
    lead: { name: "feature", description: "Lead.", metadata: {}, body: "", files: [] },
    skills: [],
    principles: [],
    stages: {} as Harness["stages"],
    workflows: names.map((name) => ({ name, stages: ["implementation"] })),
  };
}

describe("loadHarness", () => {
  it("читает harness репозитория: процесс по умолчанию идёт по всем этапам по порядку", async () => {
    const harness = await loadHarness(REPOSITORY_HARNESS);

    const workflow = workflowOf(harness, "default");

    expect(workflow.stages).toEqual([...STAGES]);
  });

  it("читает принципы из скилла principles и этап для каждого из STAGES", async () => {
    const harness = await loadHarness(REPOSITORY_HARNESS);
    const principles = harness.principles.map(({ name }) => name);
    const stages = Object.keys(harness.stages);

    expect({ principles, stages }).toEqual({
      principles: ["architecture", "change-scope", "engineering", "readability", "safety"],
      stages: [...STAGES],
    });
  });
});

describe("workflowOf", () => {
  it("находит процесс по имени", () => {
    const harness = harnessWith(["default", "short"]);

    const workflow = workflowOf(harness, "short");

    expect(workflow.name).toBe("short");
  });

  it("называет известные процессы, если такого нет", () => {
    const harness = harnessWith(["default", "short"]);

    const act = () => workflowOf(harness, "long");

    expect(act).toThrow("process long is not in the harness; available: default, short");
  });
});
