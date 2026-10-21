import { describe, expect, it } from "vitest";
import { HarnessError, parseHarness, type HarnessFiles } from "./harness.ts";
import { STAGES, type Stage } from "./stage.ts";

function skillText(header: string, body = "Текст скилла."): string {
  return `---\n${header}\n---\n\n${body}\n`;
}

function stageSkill(stage: Stage, metadata = `  stage: ${stage}\n  title: Этап ${stage}`): string {
  return skillText(`name: ${stage}-stage\ndescription: Делает ${stage}.\nmetadata:\n${metadata}`);
}

function principlesSkill(): string {
  return skillText(
    "name: principles\ndescription: Принципы.\nmetadata:\n  always-on: safety",
    "- [Безопасность](references/safety.md)\n- [Архитектура](references/architecture.md)",
  );
}

function harnessFiles(): Record<string, string> {
  const stages = Object.fromEntries(
    STAGES.map((stage) => [`skills/${stage}-stage/SKILL.md`, stageSkill(stage)]),
  );

  return {
    ...stages,
    "skills/feature/SKILL.md": skillText("name: feature\ndescription: Ведёт задачу.", "Ведущий."),
    "skills/principles/SKILL.md": principlesSkill(),
    "skills/principles/references/safety.md": "## Безопасность\n",
    "skills/principles/references/architecture.md": "## Архитектура\n",
    "workflows/default.json": JSON.stringify({ name: "default", stages: [...STAGES] }),
  };
}

describe("parseHarness", () => {
  it("собирает ведущего, скиллы, принципы и процессы", () => {
    const files: HarnessFiles = harnessFiles();

    const harness = parseHarness(files);

    expect({
      lead: harness.lead.body,
      skills: harness.skills.map(({ name }) => name),
      principles: harness.principles,
      workflows: harness.workflows.map(({ name }) => name),
    }).toEqual({
      lead: "Ведущий.",
      skills: [
        "implementation-stage",
        "planning-stage",
        "principles",
        "record-stage",
        "review-stage",
        "verification-stage",
      ],
      principles: [
        { name: "architecture", text: "## Архитектура", isAlwaysOn: false },
        { name: "safety", text: "## Безопасность", isAlwaysOn: true },
      ],
      workflows: ["default"],
    });
  });

  it("берёт этап, название, роль и доступ из metadata скилла этапа", () => {
    const files = {
      ...harnessFiles(),
      "skills/review-stage/SKILL.md": stageSkill(
        "review",
        "  stage: review\n  title: Ревью\n  role: reviewer\n  access: read",
      ),
    };

    const harness = parseHarness(files);

    expect(harness.stages.review).toEqual({
      stage: "review",
      title: "Ревью",
      description: "Делает review.",
      role: { name: "reviewer", access: "read" },
      body: "Текст скилла.",
      skill: "review-stage",
    });
  });

  it("читает этап без роли", () => {
    const files = harnessFiles();

    const harness = parseHarness(files);

    expect(harness.stages.record.role).toBeUndefined();
  });

  it("отклоняет harness без скилла этапа", () => {
    const files = harnessFiles();

    delete files["skills/review-stage/SKILL.md"];

    const act = () => parseHarness(files);

    expect(act).toThrow(/review has no skill/);
  });

  it("отклоняет два скилла одного этапа", () => {
    const files = {
      ...harnessFiles(),
      "skills/review-again/SKILL.md": skillText(
        "name: review-again\ndescription: Ещё ревью.\nmetadata:\n  stage: review\n  title: Ревью",
      ),
    };

    const act = () => parseHarness(files);

    expect(act).toThrow(/more than one skill/);
  });

  it("отклоняет неизвестный этап", () => {
    const files = {
      ...harnessFiles(),
      "skills/deploy-stage/SKILL.md": stageSkill("deploy" as Stage),
    };

    const act = () => parseHarness(files);

    expect(act).toThrow(/unknown stage deploy/);
  });

  it("отклоняет роль без доступа", () => {
    const files = {
      ...harnessFiles(),
      "skills/implementation-stage/SKILL.md": stageSkill(
        "implementation",
        "  stage: implementation\n  title: Код\n  role: coder",
      ),
    };

    const act = () => parseHarness(files);

    expect(act).toThrow(/access/);
  });

  it("отклоняет имя роли не латиницей", () => {
    const files = {
      ...harnessFiles(),
      "skills/implementation-stage/SKILL.md": stageSkill(
        "implementation",
        "  stage: implementation\n  title: Код\n  role: Кодер\n  access: write",
      ),
    };

    const act = () => parseHarness(files);

    expect(act).toThrow(/role/);
  });

  it("отклоняет скилл, имя которого не совпадает с каталогом", () => {
    const files = {
      ...harnessFiles(),
      "skills/other/SKILL.md": skillText("name: another\ndescription: Другое."),
    };

    const act = () => parseHarness(files);

    expect(act).toThrow(/directory name/);
  });

  it("отклоняет каталог скилла без SKILL.md", () => {
    const files = { ...harnessFiles(), "skills/empty/references/note.md": "Заметка." };

    const act = () => parseHarness(files);

    expect(act).toThrow(/empty: no SKILL.md/);
  });

  it("отклоняет файл скилла не в Markdown", () => {
    const files = { ...harnessFiles(), "skills/feature/scripts/run.sh": "echo" };

    const act = () => parseHarness(files);

    expect(act).toThrow(/scripts\/run.sh/);
  });

  it("отклоняет harness без скилла ведущего", () => {
    const files = harnessFiles();

    delete files["skills/feature/SKILL.md"];

    const act = () => parseHarness(files);

    expect(act).toThrow(/no skill feature/);
  });

  it("отклоняет принцип, на который не ссылаются инструкции скилла", () => {
    const files = { ...harnessFiles(), "skills/principles/references/scope.md": "## Объём\n" };

    const act = () => parseHarness(files);

    expect(act).toThrow(/references\/scope.md/);
  });

  it("отклоняет always-on с именем, которого нет среди принципов", () => {
    const files = {
      ...harnessFiles(),
      "skills/principles/SKILL.md": principlesSkill().replace("always-on: safety", "always-on: x"),
    };

    const act = () => parseHarness(files);

    expect(act).toThrow(/always-on names no principle x/);
  });

  it("отклоняет ошибку формата SKILL.md с именем каталога", () => {
    const files = { ...harnessFiles(), "skills/broken/SKILL.md": "Без шапки." };

    const act = () => parseHarness(files);

    expect(act).toThrow(HarnessError);
    expect(act).toThrow(/skill broken/);
  });

  it("отклоняет процесс, имя которого не совпадает с именем файла", () => {
    const files = {
      ...harnessFiles(),
      "workflows/short.json": JSON.stringify({ name: "long", stages: ["implementation"] }),
    };

    const act = () => parseHarness(files);

    expect(act).toThrow(/short/);
  });
});
