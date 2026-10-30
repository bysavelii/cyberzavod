import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { GENERATED_MARK } from "@cyberzavod/adapter-kit";
import type { Harness, StageGuide } from "@cyberzavod/core";
import { CodexGenerateError } from "./codex.ts";
import { CONFIG_FILE, codexFiles, type CodexProject } from "./files.ts";
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

function codexProject(): CodexProject {
  return {
    config: {
      projectId: "lab",
      harness: "0.3.0",
      workflow: "default",
      journal: "journal",
      agents: {},
      verification: { commands: ["pnpm test"], paths: [] },
    },
    harness: harness(),
    workflow: { name: "default", stages: ["planning", "implementation", "record"] },
    capture: { raw: "journal/capture/codex/raw", drafts: "journal/capture/codex/drafts" },
    cli: "npx cyberzavod@0.3.0",
    templates: {
      setup: "---\nname: setup\n---\n{{generated}}\n{{cli}} sync",
      publishRecording: "---\nname: publish-recording\n---\n{{generated}}\n{{recordingRules}}",
      recordingFragments: { rules: "Rules for {{feature}}.", editor: "Edit {{drafts}}." },
    },
  };
}

function fileOf(project: CodexProject, filePath: string): string {
  const file = codexFiles(project).find(({ path }) => path === filePath);

  if (file === undefined) throw new Error(`нет файла ${filePath}`);

  return file.content;
}

describe("codexFiles: запись сессии", () => {
  it("зовёт скилл процесса как $feature и называет роль редактора и способ её вызова", async () => {
    const project = { ...codexProject(), templates: await realTemplates() };

    const skill = fileOf(project, ".agents/skills/publish-recording/SKILL.md");

    expect(skill).toContain("name: publish-recording");
    expect(skill).toContain("several `$feature` runs");
    expect(skill).toContain('`agent_type: "recording-editor"`');
    expect(skill).toContain("`spawn_agent`");
    expect(skill).toContain("`write_stdin`");
    expect(skill).toContain("the human's words after the automation stops remain interventions");
  });

  it("называет агента в командах черновика и публикации", async () => {
    const project = { ...codexProject(), templates: await realTemplates() };

    const skill = fileOf(project, ".agents/skills/publish-recording/SKILL.md");

    expect(skill).toContain("`npx cyberzavod@0.3.0 draft --agent codex`");
    expect(skill).toContain("`npx cyberzavod@0.3.0 publish --agent codex`");
  });

  it("отсылает редактора к скиллу записи Codex и к черновикам журнала", async () => {
    const project = { ...codexProject(), templates: await realTemplates() };

    const editor = parse(fileOf(project, ".codex/agents/recording-editor.toml"));

    expect(editor.developer_instructions).toEqual(
      expect.stringContaining("`journal/capture/codex/drafts/<id>.json`"),
    );
    expect(editor.developer_instructions).toEqual(
      expect.stringContaining("`.agents/skills/publish-recording/SKILL.md`"),
    );
  });

  it("не оставляет в скилле и у редактора неподставленных мест", async () => {
    const project = { ...codexProject(), templates: await realTemplates() };

    const texts = [
      fileOf(project, ".agents/skills/publish-recording/SKILL.md"),
      fileOf(project, ".codex/agents/recording-editor.toml"),
    ];

    expect(texts.filter((text) => text.includes("{{"))).toEqual([]);
  });
});

describe("codexFiles", () => {
  it("пишет config.toml, роли процесса, оба скилла и их политику вызова", () => {
    const paths = codexFiles(codexProject()).map(({ path }) => path);

    expect(paths).toEqual([
      ".codex/config.toml",
      ".codex/agents/analyst.toml",
      ".codex/agents/coder.toml",
      ".agents/skills/principles/SKILL.md",
      ".agents/skills/principles/references/safety.md",
      ".agents/skills/principles/references/scope.md",
      ".agents/skills/feature/SKILL.md",
      ".agents/skills/feature/agents/openai.yaml",
      ".agents/skills/setup/SKILL.md",
      ".agents/skills/setup/agents/openai.yaml",
      ".agents/skills/publish-recording/SKILL.md",
      ".agents/skills/publish-recording/agents/openai.yaml",
      ".codex/agents/recording-editor.toml",
    ]);
  });

  it("не кладёт файлов рядом с AGENTS.md и корневого AGENTS.override.md", () => {
    const paths = codexFiles(codexProject()).map(({ path }) => path);

    expect(paths.some((path) => path.includes("AGENTS") || path.endsWith("CLAUDE.md"))).toBe(false);
  });

  it("каждый TOML-файл разбирается настоящим парсером", () => {
    const tomlFiles = codexFiles(codexProject()).filter(({ path }) => path.endsWith(".toml"));

    const parsed = tomlFiles.map(({ content }) => parse(content));

    expect(parsed).toHaveLength(4);
  });

  it("config.toml несёт отметку, бюджет документов и правила работы с принципами", () => {
    const config = parse(fileOf(codexProject(), CONFIG_FILE));

    expect(fileOf(codexProject(), CONFIG_FILE)).toContain(GENERATED_MARK);
    expect(config.project_doc_max_bytes).toBe(262144);
    expect(config.developer_instructions).toEqual(expect.stringContaining("## Safety"));
    expect(config.developer_instructions).toEqual(expect.stringContaining("`pnpm test`"));
    expect(config.developer_instructions).toEqual(expect.stringContaining("$feature <task>"));
  });

  it("роль несёт те же правила работы, текст своего этапа и модель этапа", () => {
    const project = codexProject();
    const rules = parse(fileOf(project, CONFIG_FILE)).developer_instructions as string;

    const role = parse(fileOf(project, ".codex/agents/coder.toml"));

    expect(role).toMatchObject({
      name: "coder",
      model: "gpt-6.1-sol",
      model_reasoning_effort: "high",
    });
    expect(role.developer_instructions).toEqual(expect.stringContaining(rules));
    expect(role.developer_instructions).toEqual(expect.stringContaining("Stage text Code."));
  });

  it("config.toml оставляет прочие принципы в скилле и называет его", () => {
    const project = codexProject();

    const rules = parse(fileOf(project, CONFIG_FILE)).developer_instructions as string;

    expect(rules).not.toContain("## Scope");
    expect(rules).toContain("`.agents/skills/principles/SKILL.md`");
  });

  it("роль несёт принципы, которых нет в правилах работы", () => {
    const project = codexProject();

    const role = parse(fileOf(project, ".codex/agents/coder.toml"));

    expect(role.developer_instructions).toEqual(expect.stringContaining("## Scope"));
  });

  it("кладёт скиллы harness как есть, без полей агента и политики вызова", () => {
    const project = codexProject();
    const paths = codexFiles(project).map(({ path }) => path);

    const content = fileOf(project, ".agents/skills/principles/SKILL.md");

    expect(content).toContain("name: principles\ndescription: The principles.\nmetadata:");
    expect(paths).not.toContain(".agents/skills/principles/agents/openai.yaml");
  });

  it("берёт модель этапа из конфига", () => {
    const project = codexProject();
    const configured: CodexProject = {
      ...project,
      config: { ...project.config, agents: { codex: { planning: { model: "gpt-custom" } } } },
    };

    const role = parse(fileOf(configured, ".codex/agents/analyst.toml"));

    expect(role.model).toBe("gpt-custom");
  });

  it("не читает настройки этапов других агентов проекта", () => {
    const project = codexProject();
    const shared: CodexProject = {
      ...project,
      config: {
        ...project.config,
        agents: { claude: { planning: { provider: "anthropic", model: "opus" } } },
      },
    };

    const role = parse(fileOf(shared, ".codex/agents/analyst.toml"));

    expect(role.model).toBe("gpt-6-astra");
  });

  it("скилл feature несёт таблицу этапов, правила ведущего и способ вызова станции", () => {
    const skill = fileOf(codexProject(), ".agents/skills/feature/SKILL.md");

    expect(skill).toContain("name: feature");
    expect(skill).toContain("Lead rules.");
    expect(skill).toContain("`spawn_agent`");
    expect(skill).toContain("`wait_agent`");
    expect(skill).toContain('`fork_turns: "none"`');
    expect(skill).toContain("`task_name`");
    expect(skill).toContain("`unknown agent_type`");
    expect(skill).toContain("gpt-6-astra");
    expect(skill).toContain("`$ARGUMENTS`");
    expect(skill).toContain(GENERATED_MARK);
  });

  it("скилл feature называет роли и тексты этапов без роли", () => {
    const skill = fileOf(codexProject(), ".agents/skills/feature/SKILL.md");

    expect(skill).toContain("analyst");
    expect(skill).toContain("Stage text Record.");
  });

  it("отключает неявный вызов скиллов", () => {
    const policy = fileOf(codexProject(), ".agents/skills/feature/agents/openai.yaml");

    expect(policy).toContain("allow_implicit_invocation: false");
  });

  it("скилл setup собирается из шаблона с подстановками", () => {
    const skill = fileOf(codexProject(), ".agents/skills/setup/SKILL.md");

    expect(skill).toContain(GENERATED_MARK);
    expect(skill).toContain("npx cyberzavod@0.3.0 sync");
  });

  it("скилл записи собирается из шаблона и общих правил записи", () => {
    const skill = fileOf(codexProject(), ".agents/skills/publish-recording/SKILL.md");

    expect(skill).toContain(GENERATED_MARK);
    expect(skill).toContain("Rules for $feature.");
  });

  it("роль редактора записи несёт общие указания редактора, модель и отметку", () => {
    const text = fileOf(codexProject(), ".codex/agents/recording-editor.toml");

    expect(text).toContain(GENERATED_MARK);
    expect(parse(text)).toMatchObject({
      name: "recording-editor",
      model: "gpt-6.1-sol",
      model_reasoning_effort: "medium",
      developer_instructions: expect.stringContaining(
        "Edit journal/capture/codex/drafts.",
      ) as unknown,
    });
  });

  it("скилл записи велит гонять сетевые команды с повышенными правами", async () => {
    const project = { ...codexProject(), templates: await realTemplates() };

    const skill = fileOf(project, ".agents/skills/publish-recording/SKILL.md");

    expect(skill).toContain('`sandbox_permissions: "require_escalated"`');
    expect(skill).toContain("`justification`");
  });

  it("отключает неявный вызов скилла записи", () => {
    const policy = fileOf(codexProject(), ".agents/skills/publish-recording/agents/openai.yaml");

    expect(policy).toContain("allow_implicit_invocation: false");
  });

  it("отвергает этап, отданный другому провайдеру", () => {
    const project = codexProject();
    const other: CodexProject = {
      ...project,
      config: {
        ...project.config,
        agents: { codex: { planning: { provider: "anthropic" } } },
      },
    };

    const act = () => codexFiles(other);

    expect(act).toThrow(CodexGenerateError);
  });
});
