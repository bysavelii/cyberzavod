import { parseSkillDocument, type HarnessSkill } from "@cyberzavod/core";
import { describe, expect, it } from "vitest";
import { GENERATED_MARK } from "./marks.ts";
import { harnessSkillFiles } from "./skill-files.ts";

function principlesSkill(): HarnessSkill {
  return {
    name: "principles",
    description: "The principles. Use before: writing code.",
    metadata: { "always-on": "safety" },
    body: "- [Safety](references/safety.md)",
    files: [{ path: "references/safety.md", text: "## Safety" }],
  };
}

const PLACEMENT = { directory: ".skills", agentFields: { "user-invocable": "false" } };

describe("harnessSkillFiles", () => {
  it("кладёт SKILL.md и файлы рядом в каталог скилла", () => {
    const files = harnessSkillFiles([principlesSkill()], PLACEMENT);

    expect(files.map(({ path }) => path)).toEqual([
      ".skills/principles/SKILL.md",
      ".skills/principles/references/safety.md",
    ]);
  });

  it("пишет поля агента после описания", () => {
    const [main] = harnessSkillFiles([principlesSkill()], PLACEMENT);

    expect(main?.content).toContain(
      'description: "The principles. Use before: writing code."\nuser-invocable: false\nmetadata:',
    );
  });

  it("пишет скилл, который читается обратно тем же, с отметкой после шапки", () => {
    const [main] = harnessSkillFiles([principlesSkill()], { ...PLACEMENT, agentFields: {} });

    expect(parseSkillDocument(main?.content ?? "")).toEqual({
      name: "principles",
      description: "The principles. Use before: writing code.",
      metadata: { "always-on": "safety" },
      body: `<!-- ${GENERATED_MARK} from harness and .cyberzavod/project.json: do not edit by hand. Project rules live in AGENTS.md. -->\n\n- [Safety](references/safety.md)`,
    });
  });

  it("ставит отметку генерации в начало файла рядом с SKILL.md", () => {
    const files = harnessSkillFiles([principlesSkill()], PLACEMENT);

    const reference = files.at(-1)?.content ?? "";

    expect(reference.startsWith(`<!-- ${GENERATED_MARK}`)).toBe(true);
    expect(reference.endsWith("## Safety\n")).toBe(true);
  });
});
