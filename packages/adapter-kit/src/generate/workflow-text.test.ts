import type { Harness, ProjectConfig, StageGuide } from "@cyberzavod/core";
import { describe, expect, it } from "vitest";
import {
  ownStageSections,
  rolePrinciples,
  stageGuidesOf,
  stageTable,
  workingRulesParagraphs,
} from "./workflow-text.ts";

function guide(stage: StageGuide["stage"], title: string, role?: string): StageGuide {
  const base = {
    stage,
    title,
    description: `${title}.`,
    body: `Text of ${title}.`,
    skill: `${stage}-stage`,
  };

  return role === undefined ? base : { ...base, role: { name: role, access: "read" } };
}

function harness(): Harness {
  return {
    lead: { name: "feature", description: "Lead.", metadata: {}, body: "Lead.", files: [] },
    skills: [],
    principles: [
      { name: "change-scope", text: "## Change scope", isAlwaysOn: false },
      { name: "safety", text: "## Safety", isAlwaysOn: true },
    ],
    stages: {
      planning: guide("planning", "Plan", "analyst"),
      implementation: guide("implementation", "Code", "coder"),
      review: guide("review", "Review", "reviewer"),
      verification: guide("verification", "Verify", "tester"),
      record: guide("record", "Record"),
    },
    workflows: [],
  };
}

function config(commands: string[]): ProjectConfig {
  return {
    projectId: "lab",
    harness: "1.0.0",
    workflow: "default",
    journal: "j",
    agents: {},
    verification: { commands, paths: [] },
  };
}

const WORKFLOW = { name: "default", stages: ["planning", "implementation", "record"] } as const;

describe("stageGuidesOf", () => {
  it("берёт тексты этапов в порядке процесса", () => {
    const guides = stageGuidesOf(harness(), { ...WORKFLOW, stages: [...WORKFLOW.stages] });

    expect(guides.map(({ title }) => title)).toEqual(["Plan", "Code", "Record"]);
  });
});

describe("workingRulesParagraphs", () => {
  const source = (commands: string[]) => ({
    config: config(commands),
    harness: harness(),
    workflow: { ...WORKFLOW, stages: [...WORKFLOW.stages] },
    featureCall: "/feature <task>",
    agentsDirectory: ".agents/",
    skillsDirectory: ".skills/",
  });

  it("называет маршрут, вызов задачи, каталог ролей и версию harness", () => {
    const [, process] = workingRulesParagraphs(source(["npm test"]));

    expect(process).toContain("harness 1.0.0");
    expect(process).toContain("Plan → Code → Record");
    expect(process).toContain("`/feature <task>`");
    expect(process).toContain("`.agents/`");
  });

  it("перечисляет проверки проекта, затем принципы, которые действуют всегда", () => {
    const paragraphs = workingRulesParagraphs(source(["npm test", "npm run lint"]));

    expect(paragraphs[2]).toContain("- `npm test`\n- `npm run lint`");
    expect(paragraphs[3]).toBe("## Safety");
    expect(paragraphs).not.toContain("## Change scope");
  });

  it("говорит, в каком скилле остальные принципы", () => {
    const paragraphs = workingRulesParagraphs(source([]));

    expect(paragraphs.at(-1)).toContain("change scope");
    expect(paragraphs.at(-1)).toContain("`.skills/principles/SKILL.md`");
  });

  it("не ссылается на скилл, если все принципы действуют всегда", () => {
    const allAlwaysOn = harness().principles.map((principle) => ({
      ...principle,
      isAlwaysOn: true,
    }));

    const paragraphs = workingRulesParagraphs({
      ...source([]),
      harness: { ...harness(), principles: allAlwaysOn },
    });

    expect(paragraphs.at(-1)).toBe("## Safety");
  });

  it("без проверок говорит, куда их добавить", () => {
    const paragraphs = workingRulesParagraphs(source([]));

    expect(paragraphs[2]).toContain("verification.commands");
    expect(paragraphs[2]).toContain("not set");
  });
});

describe("rolePrinciples", () => {
  it("отдаёт роли принципы, которых нет в постоянных правилах", () => {
    const principles = rolePrinciples(harness());

    expect(principles).toEqual(["## Change scope"]);
  });
});

describe("stageTable", () => {
  it("называет роль и модель, а этап без роли отдаёт ведущему", () => {
    const guides = stageGuidesOf(harness(), { ...WORKFLOW, stages: [...WORKFLOW.stages] });

    const table = stageTable(guides, () => "model-x");

    expect(table).toContain("| Plan | `analyst` | model-x |");
    expect(table).toContain("| Record | the lead itself | — |");
  });
});

describe("ownStageSections", () => {
  it("даёт разделы только этапов без роли", () => {
    const guides = stageGuidesOf(harness(), { ...WORKFLOW, stages: [...WORKFLOW.stages] });

    const sections = ownStageSections(guides);

    expect(sections).toEqual(["## Record stage\n\nText of Record."]);
  });
});
