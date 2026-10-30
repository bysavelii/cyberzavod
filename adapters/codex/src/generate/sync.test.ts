import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GENERATED_MARK, KIT_MESSAGES, KitError, MANIFEST_FILE } from "@cyberzavod/adapter-kit";
import { parseProjectConfig } from "@cyberzavod/core";
import { loadHarness, PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { HOOKS_FILE } from "./hooks-config.ts";
import { previewCodex, syncCodex, type CodexInstallation, type SyncOptions } from "./sync.ts";
import { realTemplates } from "./templates.fixtures.ts";

const REPOSITORY = path.resolve(import.meta.dirname, "../../../..");
const HUMAN_HOOK = { type: "command", command: "echo mine" };

let root: string;

async function writeProjectFile(relative: string, content: string): Promise<void> {
  const file = path.join(root, relative);

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function readProjectFile(relative: string): Promise<string> {
  return readFile(path.join(root, relative), "utf8");
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

async function installation(): Promise<CodexInstallation> {
  return {
    harness: await loadHarness(path.join(REPOSITORY, "harness")),
    templates: await realTemplates(),
  };
}

async function sync(mode: Pick<SyncOptions, "check" | "force"> = {}) {
  return syncCodex({ projectDirectory: root, installation: await installation(), ...mode });
}

async function errorOf(act: () => Promise<unknown>): Promise<unknown> {
  return act().then(
    () => undefined,
    (err: unknown) => err,
  );
}

describe("syncCodex", () => {
  beforeEach(async () => {
    root = path.join(await mkdtemp(path.join(tmpdir(), "cyberzavod-codex-sync-")), "lab");
    await writeProjectFile(PROJECT_CONFIG_FILE, JSON.stringify(newConfig()));
    await writeProjectFile("AGENTS.md", "# Rules\n");
  });

  afterEach(async () => {
    await rm(path.dirname(root), { recursive: true, force: true });
  });

  it("пишет config.toml, роли, скиллы и хуки", async () => {
    const report = await sync();

    expect(report.added).toEqual(
      expect.arrayContaining([
        ".codex/config.toml",
        ".codex/agents/coder.toml",
        ".agents/skills/feature/SKILL.md",
        ".agents/skills/setup/SKILL.md",
        ".agents/skills/publish-recording/SKILL.md",
        ".codex/agents/recording-editor.toml",
        HOOKS_FILE,
        MANIFEST_FILE,
      ]),
    );
    expect(await readProjectFile(HOOKS_FILE)).toContain(
      "cyberzavod@0.3.0 hook record --agent codex",
    );
  });

  it("не трогает Claude: ни CLAUDE.md, ни .claude", async () => {
    await sync();

    expect([await exists("CLAUDE.md"), await exists(".claude")]).toEqual([false, false]);
  });

  it("зовёт в сгенерированных текстах CLI той версии, что в конфиге", async () => {
    await sync();

    const skill = await readProjectFile(".agents/skills/setup/SKILL.md");

    expect(skill).toContain("`npx cyberzavod@0.3.0 sync`");
  });

  it("в режиме проверки ничего не пишет и называет устаревшие файлы", async () => {
    const report = await sync({ check: true });

    expect(await exists(".codex")).toBe(false);
    expect(report.added.length).toBeGreaterThan(0);
  });

  it("после синхронизации проверка не находит расхождений", async () => {
    await sync();

    const report = await sync({ check: true });

    expect(report).toEqual({ added: [], updated: [], removed: [], conflicts: [], edited: [] });
  });

  it("не пишет поверх config.toml человека и ничего не меняет", async () => {
    await writeProjectFile(".codex/config.toml", 'model = "mine"\n');

    const error = await errorOf(() => sync());

    expect(error).toBeInstanceOf(KitError);
    expect((error as KitError).describe(KIT_MESSAGES.en)).toMatch(/config\.toml/);
    expect(await exists(HOOKS_FILE)).toBe(false);
  });

  it("с force пишет поверх config.toml человека", async () => {
    await writeProjectFile(".codex/config.toml", 'model = "mine"\n');

    await sync({ force: true });

    expect(await readProjectFile(".codex/config.toml")).toContain(GENERATED_MARK);
  });

  it("оставляет чужие обработчики и ключи в hooks.json и заменяет свои", async () => {
    await writeProjectFile(
      HOOKS_FILE,
      JSON.stringify({ description: "mine", hooks: { Stop: [{ hooks: [HUMAN_HOOK] }] } }),
    );

    await sync();

    const hooks = JSON.parse(await readProjectFile(HOOKS_FILE));

    expect(hooks.description).toBe("mine");
    expect(hooks.hooks.Stop[0].hooks[0]).toEqual(HUMAN_HOOK);
    expect(hooks.hooks.Stop).toHaveLength(2);
  });

  it("не пишет hooks.json в манифест: файл общий с человеком", async () => {
    await sync();

    const manifest = JSON.parse(await readProjectFile(MANIFEST_FILE));

    expect(manifest.agents.codex.files[HOOKS_FILE]).toBeUndefined();
    expect(typeof manifest.agents.codex.files[".codex/config.toml"]).toBe("string");
  });

  it("не трогает файлы и секцию манифеста другого агента", async () => {
    await sync();

    const otherSection = {
      files: { ".claude/agents/a.md": "sha256:other" },
      settings: { deny: [] },
    };
    const manifest = JSON.parse(await readProjectFile(MANIFEST_FILE));

    await writeProjectFile(
      MANIFEST_FILE,
      JSON.stringify({ ...manifest, agents: { claude: otherSection, ...manifest.agents } }),
    );
    await writeProjectFile("CLAUDE.md", `${GENERATED_MARK}\nother\n`);

    const report = await sync();

    const written = JSON.parse(await readProjectFile(MANIFEST_FILE));

    expect({
      removed: report.removed,
      otherFile: await readProjectFile("CLAUDE.md"),
      otherSection: written.agents.claude,
    }).toEqual({ removed: [], otherFile: `${GENERATED_MARK}\nother\n`, otherSection });
  });

  it("на hooks не того вида бросает ошибку с путём файла хуков", async () => {
    await writeProjectFile(HOOKS_FILE, JSON.stringify({ hooks: [] }));

    const error = await errorOf(() => sync({ check: true }));

    expect((error as KitError).describe(KIT_MESSAGES.en)).toBe(
      ".codex/hooks.json cannot be parsed: hooks must be an object",
    );
  });

  it("удаляет сгенерированную раньше роль, которой больше нет, и оставляет роль человека", async () => {
    await sync();
    await writeProjectFile(".codex/agents/old-role.toml", `# ${GENERATED_MARK}\n`);
    await writeProjectFile(".codex/agents/mine.toml", 'name = "mine"\n');

    const report = await sync();

    expect(report.removed).toEqual([".codex/agents/old-role.toml"]);
    expect(await exists(".codex/agents/mine.toml")).toBe(true);
  });

  it("не перезаписывает сгенерированный файл, исправленный руками", async () => {
    await sync();
    const coder = path.join(root, ".codex/agents/coder.toml");

    await writeFile(coder, `${await readFile(coder, "utf8")}# my edit\n`);
    await writeProjectFile(
      PROJECT_CONFIG_FILE,
      JSON.stringify({ ...newConfig(), harness: "0.4.0" }),
    );

    const error = await errorOf(() => sync());

    expect(error).toBeInstanceOf(KitError);
    expect(await readFile(coder, "utf8")).toContain("# my edit");
  });

  it("пишет каждый TOML-файл так, что парсер его читает", async () => {
    await sync();

    const config = parse(await readProjectFile(".codex/config.toml"));
    const role = parse(await readProjectFile(".codex/agents/coder.toml"));

    expect(config.project_doc_max_bytes).toBeGreaterThan(0);
    expect(role.name).toBe("coder");
  });
});

describe("previewCodex", () => {
  beforeEach(async () => {
    root = path.join(await mkdtemp(path.join(tmpdir(), "cyberzavod-codex-preview-")), "lab");
    await writeProjectFile("AGENTS.md", "# Rules\n");
  });

  afterEach(async () => {
    await rm(path.dirname(root), { recursive: true, force: true });
  });

  it("находит config.toml человека до того, как конфиг проекта записан, и ничего не пишет", async () => {
    await writeProjectFile(".codex/config.toml", 'model = "mine"\n');

    const report = await previewCodex(
      { root, config: parseProjectConfig(newConfig()) },
      await installation(),
    );

    expect(report.conflicts).toEqual([".codex/config.toml"]);
    expect(await exists(HOOKS_FILE)).toBe(false);
  });
});
