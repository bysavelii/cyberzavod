import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GENERATED_MARK,
  KIT_MESSAGES,
  KitError,
  LEGACY_GENERATED_MARK,
  MANIFEST_FILE,
} from "@cyberzavod/adapter-kit";
import { parseProjectConfig } from "@cyberzavod/core";
import { loadHarness, PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { previewClaude, syncClaude, type ClaudeInstallation, type SyncOptions } from "./sync.ts";
import { realTemplates } from "./templates.fixtures.ts";

const REPOSITORY = path.resolve(import.meta.dirname, "../../../..");

let root: string;

async function writeProjectFile(relative: string, content: string): Promise<void> {
  const file = path.join(root, relative);

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function exists(relative: string): Promise<boolean> {
  return access(path.join(root, relative)).then(
    () => true,
    () => false,
  );
}

function newConfig() {
  return {
    projectId: "lab",
    harness: "0.3.0",
    workflow: "default",
    journal: ".cyberzavod/journal",
    verification: { commands: ["npm test"], paths: [] },
  };
}

async function newProject(): Promise<void> {
  await writeProjectFile(PROJECT_CONFIG_FILE, JSON.stringify(newConfig()));
  await writeProjectFile("AGENTS.md", "# Правила\n");
  await writeProjectFile("src/AGENTS.md", "# Правила src\n");
}

async function installation(): Promise<ClaudeInstallation> {
  return {
    harness: await loadHarness(path.join(REPOSITORY, "harness")),
    templates: await realTemplates(),
  };
}

async function sync(mode: Pick<SyncOptions, "check" | "force"> = {}) {
  return syncClaude({ projectDirectory: root, installation: await installation(), ...mode });
}

describe("syncClaude", () => {
  beforeEach(async () => {
    root = path.join(await mkdtemp(path.join(tmpdir(), "cyberzavod-sync-")), "lab");
    await newProject();
  });

  afterEach(async () => {
    await rm(path.dirname(root), { recursive: true, force: true });
  });

  it("пишет CLAUDE.md рядом с каждым AGENTS.md, агентов и хуки", async () => {
    const report = await sync();

    const settings = await readFile(path.join(root, ".claude/settings.json"), "utf8");

    expect({
      changed: report.added.includes("src/CLAUDE.md"),
      agent: await exists(".claude/agents/coder.md"),
      hook: settings.includes("cyberzavod@0.3.0 hook record"),
    }).toEqual({ changed: true, agent: true, hook: true });
  });

  it("зовёт в текстах CLI той версии, что в конфиге", async () => {
    await sync();

    const skill = await readFile(
      path.join(root, ".claude/skills/publish-recording/SKILL.md"),
      "utf8",
    );

    expect(skill).toContain("`npx cyberzavod@0.3.0 draft`");
  });

  it("скилл публикации ведёт запись в галерею той же версией CLI", async () => {
    await sync();

    const skill = await readFile(
      path.join(root, ".claude/skills/publish-recording/SKILL.md"),
      "utf8",
    );

    expect(skill).toContain("`npx cyberzavod@0.3.0 share");
    expect(skill).toContain("`npx cyberzavod@0.3.0 login`");
    expect(skill).toContain("`npx cyberzavod@0.3.0 gallery --public`");
    expect(skill).toContain("`npx cyberzavod@0.3.0 unshare");
  });

  it("кладёт скилл /setup, который зовёт CLI той версии, что в конфиге", async () => {
    await sync();

    const skill = await readFile(path.join(root, ".claude/skills/setup/SKILL.md"), "utf8");

    expect(skill).toContain("`npx cyberzavod@0.3.0 sync`");
  });

  it("в режиме проверки ничего не пишет и называет устаревшие файлы", async () => {
    const report = await sync({ check: true });

    expect({ claudeMd: await exists("CLAUDE.md"), changed: report.added.length > 0 }).toEqual({
      claudeMd: false,
      changed: true,
    });
  });

  it("после синхронизации проверка не находит расхождений", async () => {
    await sync();

    const report = await sync({ check: true });

    expect(report).toEqual({ added: [], updated: [], removed: [], conflicts: [], edited: [] });
  });

  it("не пишет поверх файла человека и не меняет ничего", async () => {
    await writeProjectFile("CLAUDE.md", "Мои правила\n");

    const act = () => sync();
    const error = await act().then(
      () => undefined,
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(KitError);
    expect((error as KitError).describe(KIT_MESSAGES.en)).toMatch(/CLAUDE\.md/);
    expect(await exists(".claude/settings.json")).toBe(false);
  });

  it("на hooks не того вида бросает ошибку адаптера с путём настроек", async () => {
    await writeProjectFile(".claude/settings.json", JSON.stringify({ hooks: [] }));

    const act = () => sync({ check: true });
    const error = await act().then(
      () => undefined,
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(KitError);
    expect((error as KitError).describe(KIT_MESSAGES.en)).toBe(
      ".claude/settings.json cannot be parsed: hooks must be an object",
    );
  });

  it("с force пишет поверх файла человека", async () => {
    await writeProjectFile("CLAUDE.md", "Мои правила\n");

    await sync({ force: true });

    expect(await readFile(path.join(root, "CLAUDE.md"), "utf8")).toContain(GENERATED_MARK);
  });

  it("удаляет сгенерированный раньше файл, который больше не нужен", async () => {
    await writeProjectFile(".claude/agents/old-role.md", `<!-- ${GENERATED_MARK} -->\n`);
    await writeProjectFile(".claude/agents/mine.md", "Мой агент\n");

    const report = await sync();

    expect({
      removed: report.removed,
      old: await exists(".claude/agents/old-role.md"),
      mine: await exists(".claude/agents/mine.md"),
    }).toEqual({ removed: [".claude/agents/old-role.md"], old: false, mine: true });
  });

  it("перезаписывает без force файл с прежней русской отметкой", async () => {
    await writeProjectFile("CLAUDE.md", `<!-- ${LEGACY_GENERATED_MARK} из harness -->\n`);

    await sync();

    expect(await readFile(path.join(root, "CLAUDE.md"), "utf8")).toContain(GENERATED_MARK);
  });

  it("удаляет без force ненужный файл с прежней русской отметкой", async () => {
    await writeProjectFile(".claude/agents/old-role.md", `<!-- ${LEGACY_GENERATED_MARK} -->\n`);

    const report = await sync();

    expect({ removed: report.removed, old: await exists(".claude/agents/old-role.md") }).toEqual({
      removed: [".claude/agents/old-role.md"],
      old: false,
    });
  });

  it("пишет манифест с отпечатками сгенерированных файлов", async () => {
    await sync();

    const manifest = JSON.parse(await readFile(path.join(root, MANIFEST_FILE), "utf8"));

    expect({
      schemaVersion: manifest.schemaVersion,
      claudeMd: typeof manifest.agents.claude.files["CLAUDE.md"],
      settings: manifest.agents.claude.files[".claude/settings.json"],
      deny: manifest.agents.claude.settings.deny.length > 0,
    }).toEqual({ schemaVersion: 2, claudeMd: "string", settings: undefined, deny: true });
  });

  it("не трогает файлы и секцию манифеста другого агента", async () => {
    await sync();

    const otherSection = {
      files: { ".codex/config.toml": "sha256:other" },
      settings: { deny: [] },
    };
    const manifestFile = path.join(root, MANIFEST_FILE);
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));

    await writeProjectFile(
      MANIFEST_FILE,
      JSON.stringify({ ...manifest, agents: { ...manifest.agents, codex: otherSection } }),
    );
    await writeProjectFile(".codex/config.toml", `${GENERATED_MARK}\nother\n`);

    const report = await sync();

    const written = JSON.parse(await readFile(manifestFile, "utf8"));

    expect({
      removed: report.removed,
      otherFile: await exists(".codex/config.toml"),
      otherSection: written.agents.codex,
    }).toEqual({ removed: [], otherFile: true, otherSection });
  });

  it("переводит манифест версии 1 в версию 2 с одной секцией Claude Code", async () => {
    await sync();
    const manifestFile = path.join(root, MANIFEST_FILE);
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    const { files, settings } = manifest.agents.claude;

    await writeProjectFile(MANIFEST_FILE, JSON.stringify({ schemaVersion: 1, files, settings }));

    const report = await sync();

    const written = JSON.parse(await readFile(manifestFile, "utf8"));

    expect({ conflicts: report.conflicts, edited: report.edited, written }).toEqual({
      conflicts: [],
      edited: [],
      written: manifest,
    });
  });

  it("не перезаписывает сгенерированный файл, исправленный руками", async () => {
    await sync();
    const coder = path.join(root, ".claude/agents/coder.md");

    await writeFile(coder, `${await readFile(coder, "utf8")}\nМоя правка\n`);
    await writeProjectFile(
      PROJECT_CONFIG_FILE,
      JSON.stringify({ ...newConfig(), harness: "0.4.0" }),
    );

    const act = () => sync();
    const error = await act().then(
      () => undefined,
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(KitError);
    expect(await readFile(coder, "utf8")).toContain("Моя правка");
  });

  it("в режиме проверки называет исправленный руками файл отдельно", async () => {
    await sync();
    await writeFile(path.join(root, "CLAUDE.md"), `<!-- ${GENERATED_MARK} -->\nМоё\n`);

    const report = await sync({ check: true });

    expect({ edited: report.edited, conflicts: report.conflicts }).toEqual({
      edited: ["CLAUDE.md"],
      conflicts: [],
    });
  });

  it("не считает исправлением перевод строк Windows", async () => {
    await sync();
    const coder = path.join(root, ".claude/agents/coder.md");

    await writeFile(coder, (await readFile(coder, "utf8")).replace(/\n/g, "\r\n"));

    const report = await sync({ check: true });

    expect(report.edited).toEqual([]);
  });

  it("помнит в манифесте только те запреты, которых не было до него", async () => {
    await writeProjectFile(
      ".claude/settings.json",
      JSON.stringify({ permissions: { deny: ["Read(**/.env)"] } }),
    );

    await sync();

    const manifest = JSON.parse(await readFile(path.join(root, MANIFEST_FILE), "utf8"));

    expect(manifest.agents.claude.settings.deny).not.toContain("Read(**/.env)");
  });
});

describe("previewClaude", () => {
  beforeEach(async () => {
    root = path.join(await mkdtemp(path.join(tmpdir(), "cyberzavod-preview-")), "lab");
    await writeProjectFile("AGENTS.md", "# Правила\n");
  });

  afterEach(async () => {
    await rm(path.dirname(root), { recursive: true, force: true });
  });

  it("находит файл человека до того, как конфиг записан, и ничего не пишет", async () => {
    await writeProjectFile("CLAUDE.md", "Мои правила\n");

    const report = await previewClaude(
      { root, config: parseProjectConfig(newConfig()) },
      await installation(),
    );

    expect({ conflicts: report.conflicts, settings: await exists(".claude") }).toEqual({
      conflicts: ["CLAUDE.md"],
      settings: false,
    });
  });
});
