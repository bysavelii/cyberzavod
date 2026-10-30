import { describe, expect, it } from "vitest";
import { RULES_TODO_MARK, type Harness, type StageGuide } from "@cyberzavod/core";
import { GENERATED_MARK } from "@cyberzavod/adapter-kit";
import { claudeFiles, renderTemplate, type ClaudeProject } from "./files.ts";
import { realTemplates } from "./templates.fixtures.ts";

function guide(stage: StageGuide["stage"], title: string, role?: string): StageGuide {
  const base = {
    stage,
    title,
    description: `${title}.`,
    body: `Stage text ${title}.`,
    skill: `${stage}-stage`,
  };

  return role === undefined ? base : { ...base, role: { name: role, access: "read" } };
}

function harness(): Harness {
  return {
    lead: { name: "feature", description: "Lead.", metadata: {}, body: "Lead rules.", files: [] },
    skills: [
      {
        name: "principles",
        description: "The principles.",
        metadata: { "always-on": "safety" },
        body: "- [Scope](references/scope.md)\n- [Safety](references/safety.md)",
        files: [
          { path: "references/safety.md", text: "## Safety\n\nNo secrets." },
          { path: "references/scope.md", text: "## Scope\n\nOnly the task." },
        ],
      },
    ],
    principles: [
      { name: "safety", text: "## Safety\n\nNo secrets.", isAlwaysOn: true },
      { name: "scope", text: "## Scope\n\nOnly the task.", isAlwaysOn: false },
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

function claudeProject(): ClaudeProject {
  return {
    config: {
      projectId: "lab",
      harness: "0.3.0",
      workflow: "default",
      journal: "journal",
      agents: { claude: { implementation: { model: "opus" } } },
      verification: { commands: ["pnpm test"], paths: [] },
    },
    harness: harness(),
    workflow: { name: "default", stages: ["planning", "implementation", "record"] },
    rules: ["", "apps/web"],
    capture: { raw: "journal/capture/claude/raw", drafts: "journal/capture/claude/drafts" },
    cli: "cyberzavod",
    templates: {
      publishRecording: "{{generated}}\n{{cli}} draft",
      recordingEditor: "{{drafts}}",
      setup: "{{generated}}\n{{todo}}",
      recordingFragments: { rules: "", editor: "" },
    },
  };
}

function fileOf(project: ClaudeProject, filePath: string): string {
  const file = claudeFiles(project).find(({ path }) => path === filePath);

  if (file === undefined) throw new Error(`нет файла ${filePath}`);

  return file.content;
}

describe("claudeFiles", () => {
  it("пишет CLAUDE.md рядом с каждым AGENTS.md, агентов ролей процесса и скиллы", () => {
    const project = claudeProject();

    const paths = claudeFiles(project).map(({ path }) => path);

    expect(paths).toEqual([
      "CLAUDE.md",
      "apps/web/CLAUDE.md",
      ".claude/agents/analyst.md",
      ".claude/agents/coder.md",
      ".claude/skills/principles/SKILL.md",
      ".claude/skills/principles/references/safety.md",
      ".claude/skills/principles/references/scope.md",
      ".claude/skills/feature/SKILL.md",
      ".claude/skills/setup/SKILL.md",
      ".claude/skills/publish-recording/SKILL.md",
      ".claude/agents/recording-editor.md",
    ]);
  });

  it("не читает настройки этапов других агентов проекта", () => {
    const project = claudeProject();
    const shared: ClaudeProject = {
      ...project,
      config: {
        ...project.config,
        agents: { codex: { implementation: { provider: "openai", model: "gpt-custom" } } },
      },
    };

    const content = fileOf(shared, ".claude/agents/coder.md");

    expect(content).toContain("model: sonnet");
  });

  it("корневой CLAUDE.md несёт отметку, маршрут, проверки, принципы и импорт AGENTS.md", () => {
    const project = claudeProject();

    const content = fileOf(project, "CLAUDE.md");

    expect([
      content.includes(GENERATED_MARK),
      content.includes("Plan → Code → Record"),
      content.includes("- `pnpm test`"),
      content.includes("## Safety"),
      content.trimEnd().endsWith("@AGENTS.md"),
    ]).toEqual([true, true, true, true, true]);
  });

  it("корневой CLAUDE.md оставляет прочие принципы в скилле и называет его", () => {
    const project = claudeProject();

    const content = fileOf(project, "CLAUDE.md");

    expect(content).not.toContain("## Scope");
    expect(content).toContain("`.claude/skills/principles/SKILL.md`");
  });

  it("агент роли несёт текст этапа и принципы, которых нет в CLAUDE.md", () => {
    const project = claudeProject();

    const content = fileOf(project, ".claude/agents/coder.md");

    expect(content).toContain("Stage text Code.\n\n## Scope\n\nOnly the task.");
    expect(content).not.toContain("## Safety");
  });

  it("кладёт скиллы harness как есть и прячет их из меню команд", () => {
    const project = claudeProject();

    const content = fileOf(project, ".claude/skills/principles/SKILL.md");

    expect(content).toContain(
      "name: principles\ndescription: The principles.\nuser-invocable: false",
    );
    expect(content).toContain("metadata:\n  always-on: safety\n---\n<!-- ");
    expect(content.trimEnd().endsWith("- [Safety](references/safety.md)")).toBe(true);
  });

  it("вложенный CLAUDE.md только импортирует AGENTS.md", () => {
    const project = claudeProject();

    const content = fileOf(project, "apps/web/CLAUDE.md");

    expect(content.trimEnd().split("\n").at(-1)).toBe("@AGENTS.md");
  });

  it("берёт модель роли из конфига, а без неё — по умолчанию адаптера", () => {
    const project = claudeProject();

    const models = ["analyst", "coder"].map(
      (role) => /model: (\S+)/.exec(fileOf(project, `.claude/agents/${role}.md`))?.[1],
    );

    expect(models).toEqual(["opus", "opus"]);
  });

  it("кладёт в скилл процесса текст этапа без роли", () => {
    const project = claudeProject();

    const content = fileOf(project, ".claude/skills/feature/SKILL.md");

    expect(content).toContain("## Record stage\n\nStage text Record.");
  });

  it("кладёт скилл настройки с отметкой генерации", () => {
    const project = claudeProject();

    const content = fileOf(project, ".claude/skills/setup/SKILL.md");

    expect(content).toContain(GENERATED_MARK);
  });
});

describe("claudeFiles: запись сессии", () => {
  it("зовёт скилл процесса как /feature и ответ через AskUserQuestion в правилах записи", async () => {
    const project = { ...claudeProject(), templates: await realTemplates() };

    const skill = fileOf(project, ".claude/skills/publish-recording/SKILL.md");

    expect(skill).toContain("several `/feature` runs");
    expect(skill).toContain(
      "an answer to a question through `AskUserQuestion` and the human's word after the automation stops remain interventions",
    );
  });

  it("называет агента в командах черновика и публикации", async () => {
    const project = { ...claudeProject(), templates: await realTemplates() };

    const skill = fileOf(project, ".claude/skills/publish-recording/SKILL.md");

    expect(skill).toContain("`cyberzavod draft --agent claude`");
    expect(skill).toContain("`cyberzavod publish --agent claude`");
  });

  it("отсылает редактора к скиллу записи Claude Code и к черновикам журнала", async () => {
    const project = { ...claudeProject(), templates: await realTemplates() };

    const editor = fileOf(project, ".claude/agents/recording-editor.md");

    expect(editor).toContain("`journal/capture/claude/drafts/<id>.json`");
    expect(editor).toContain("`.claude/skills/publish-recording/SKILL.md`");
  });

  it("не оставляет в скилле и у редактора неподставленных мест", async () => {
    const project = { ...claudeProject(), templates: await realTemplates() };

    const texts = [
      fileOf(project, ".claude/skills/publish-recording/SKILL.md"),
      fileOf(project, ".claude/agents/recording-editor.md"),
    ];

    expect(texts.filter((text) => text.includes("{{"))).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("подставляет команду CLI и каталоги журнала", () => {
    const project = claudeProject();

    const text = renderTemplate("{{cli}} draft {{raw}} {{drafts}}", project);

    expect(text).toBe("cyberzavod draft journal/capture/claude/raw journal/capture/claude/drafts");
  });

  it("подставляет отметку заглушки заготовки", () => {
    const project = claudeProject();

    const text = renderTemplate("line {{todo}}", project);

    expect(text).toBe(`line ${RULES_TODO_MARK}`);
  });

  it("отклоняет неизвестную подстановку", () => {
    const act = () => renderTemplate("{{secret}}", claudeProject());

    expect(act).toThrow(/\{\{secret\}\}/);
  });
});
