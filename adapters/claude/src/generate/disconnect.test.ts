import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GENERATED_MARK, MANIFEST_FILE } from "@cyberzavod/adapter-kit";
import { loadHarness, PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { disconnectClaude } from "./disconnect.ts";
import { syncClaude, type ClaudeInstallation } from "./sync.ts";
import { realTemplates } from "./templates.fixtures.ts";

const REPOSITORY = path.resolve(import.meta.dirname, "../../../..");
const USER_HOOK = { type: "command", command: "echo mine" };

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

async function installation(): Promise<ClaudeInstallation> {
  return {
    harness: await loadHarness(path.join(REPOSITORY, "harness")),
    templates: await realTemplates(),
  };
}

async function connectedProject(settings?: object): Promise<void> {
  const config = {
    projectId: "lab",
    harness: "0.3.0",
    workflow: "default",
    journal: ".cyberzavod/journal",
    verification: { commands: ["npm test"], paths: [] },
  };

  await writeProjectFile(PROJECT_CONFIG_FILE, JSON.stringify(config));
  await writeProjectFile("AGENTS.md", "# Rules\n");
  await writeProjectFile("src/AGENTS.md", "# Src rules\n");

  if (settings !== undefined) {
    await writeProjectFile(".claude/settings.json", JSON.stringify(settings));
  }

  await syncClaude({ projectDirectory: root, installation: await installation() });
}

async function settingsOnDisk(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(root, ".claude/settings.json"), "utf8"));
}

describe("disconnectClaude", () => {
  beforeEach(async () => {
    root = path.join(await mkdtemp(path.join(tmpdir(), "cyberzavod disconnect-")), "lab");
  });

  afterEach(async () => {
    await rm(path.dirname(root), { recursive: true, force: true });
  });

  it("убирает сгенерированные файлы, настройки и манифест, оставляя AGENTS.md", async () => {
    await connectedProject();

    const plan = await disconnectClaude({ projectDirectory: root });

    expect({
      claudeMd: await exists("CLAUDE.md"),
      nested: await exists("src/CLAUDE.md"),
      claudeDirectory: await exists(".claude"),
      manifest: await exists(MANIFEST_FILE),
      rules: await exists("AGENTS.md"),
      nestedRules: await exists("src/AGENTS.md"),
      settings: plan.settings,
    }).toEqual({
      claudeMd: false,
      nested: false,
      claudeDirectory: false,
      manifest: false,
      rules: true,
      nestedRules: true,
      settings: "removed",
    });
  });

  it("оставляет манифест с секцией другого агента и убирает только свою", async () => {
    await connectedProject();
    const manifest = JSON.parse(await readFile(path.join(root, MANIFEST_FILE), "utf8"));
    const otherSection = { files: { "other/file.md": "sha256:other" }, settings: { deny: [] } };

    await writeProjectFile(
      MANIFEST_FILE,
      JSON.stringify({ ...manifest, agents: { ...manifest.agents, codex: otherSection } }),
    );

    const plan = await disconnectClaude({ projectDirectory: root });

    const kept = JSON.parse(await readFile(path.join(root, MANIFEST_FILE), "utf8"));

    expect({ manifest: plan.manifest, agents: kept.agents }).toEqual({
      manifest: "updated",
      agents: { codex: otherSection },
    });
  });

  it("удаляет манифест, когда другого агента в нём нет", async () => {
    await connectedProject();

    const plan = await disconnectClaude({ projectDirectory: root });

    expect({ manifest: plan.manifest, exists: await exists(MANIFEST_FILE) }).toEqual({
      manifest: "removed",
      exists: false,
    });
  });

  it("в режиме проверки ничего не меняет", async () => {
    await connectedProject();

    const plan = await disconnectClaude({ projectDirectory: root, check: true });

    expect({ listed: plan.removed.includes("CLAUDE.md"), kept: await exists("CLAUDE.md") }).toEqual(
      { listed: true, kept: true },
    );
  });

  it("оставляет чужие хуки, прочие настройки и запреты человека", async () => {
    await connectedProject({
      model: "opus",
      permissions: { deny: ["Read(**/.env)", "Bash(rm:*)"] },
      hooks: { Stop: [{ hooks: [USER_HOOK] }] },
    });

    const plan = await disconnectClaude({ projectDirectory: root });

    expect({ plan: plan.settings, settings: await settingsOnDisk() }).toEqual({
      plan: "updated",
      settings: {
        model: "opus",
        permissions: { deny: ["Read(**/.env)", "Bash(rm:*)"] },
        hooks: { Stop: [{ hooks: [USER_HOOK] }] },
      },
    });
  });

  it("оставляет сгенерированный файл, исправленный руками, и свои файлы в .claude", async () => {
    await connectedProject();
    await writeProjectFile(".claude/agents/coder.md", `<!-- ${GENERATED_MARK} -->\nMine\n`);
    await writeProjectFile(".claude/agents/mine.md", "My agent\n");

    const plan = await disconnectClaude({ projectDirectory: root });

    expect({
      edited: plan.edited,
      coder: await exists(".claude/agents/coder.md"),
      mine: await exists(".claude/agents/mine.md"),
      reviewer: await exists(".claude/agents/reviewer.md"),
    }).toEqual({ edited: [".claude/agents/coder.md"], coder: true, mine: true, reviewer: false });
  });
});
