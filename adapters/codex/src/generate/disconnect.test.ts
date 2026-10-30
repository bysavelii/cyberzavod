import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANIFEST_FILE } from "@cyberzavod/adapter-kit";
import { loadHarness, PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { disconnectCodex } from "./disconnect.ts";
import { HOOKS_FILE } from "./hooks-config.ts";
import { syncCodex, type CodexInstallation } from "./sync.ts";
import { realTemplates } from "./templates.fixtures.ts";

const REPOSITORY = path.resolve(import.meta.dirname, "../../../..");
const HUMAN_HOOK = { type: "command", command: "echo mine" };

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

async function installation(): Promise<CodexInstallation> {
  return {
    harness: await loadHarness(path.join(REPOSITORY, "harness")),
    templates: await realTemplates(),
  };
}

async function connectedProject(hooks?: object): Promise<void> {
  const config = {
    projectId: "lab",
    harness: "0.3.0",
    workflow: "default",
    journal: ".cyberzavod/journal",
    verification: { commands: ["npm test"], paths: [] },
  };

  await writeProjectFile(PROJECT_CONFIG_FILE, JSON.stringify(config));
  await writeProjectFile("AGENTS.md", "# Rules\n");

  if (hooks !== undefined) await writeProjectFile(HOOKS_FILE, JSON.stringify(hooks));

  await syncCodex({ projectDirectory: root, installation: await installation() });
}

describe("disconnectCodex", () => {
  beforeEach(async () => {
    root = path.join(await mkdtemp(path.join(tmpdir(), "cyberzavod-codex-disconnect-")), "lab");
  });

  afterEach(async () => {
    await rm(path.dirname(root), { recursive: true, force: true });
  });

  it("убирает сгенерированные файлы, хуки и манифест, оставляя AGENTS.md и пустых каталогов", async () => {
    await connectedProject();

    const plan = await disconnectCodex({ projectDirectory: root });

    expect(plan.removed).toContain(".codex/config.toml");
    expect(await exists(".codex")).toBe(false);
    expect(await exists(".agents")).toBe(false);
    expect(await exists(MANIFEST_FILE)).toBe(false);
    expect(await exists("AGENTS.md")).toBe(true);
  });

  it("оставляет манифест с секцией другого агента и убирает только свою", async () => {
    await connectedProject();
    const manifest = JSON.parse(await readFile(path.join(root, MANIFEST_FILE), "utf8"));
    const otherSection = { files: { "other/file.md": "sha256:other" }, settings: { deny: [] } };

    await writeProjectFile(
      MANIFEST_FILE,
      JSON.stringify({ ...manifest, agents: { ...manifest.agents, claude: otherSection } }),
    );

    const plan = await disconnectCodex({ projectDirectory: root });

    const kept = JSON.parse(await readFile(path.join(root, MANIFEST_FILE), "utf8"));

    expect({ manifest: plan.manifest, agents: kept.agents }).toEqual({
      manifest: "updated",
      agents: { claude: otherSection },
    });
  });

  it("удаляет манифест, когда другого агента в нём нет", async () => {
    await connectedProject();

    const plan = await disconnectCodex({ projectDirectory: root });

    expect({ manifest: plan.manifest, exists: await exists(MANIFEST_FILE) }).toEqual({
      manifest: "removed",
      exists: false,
    });
  });

  it("в режиме проверки только называет, что уберёт", async () => {
    await connectedProject();

    const plan = await disconnectCodex({ projectDirectory: root, check: true });

    expect(plan.removed).toContain(".codex/config.toml");
    expect(await exists(".codex/config.toml")).toBe(true);
  });

  it("оставляет чужие обработчики в hooks.json", async () => {
    await connectedProject({ hooks: { Stop: [{ hooks: [HUMAN_HOOK] }] } });

    await disconnectCodex({ projectDirectory: root });

    const hooks = JSON.parse(await readFile(path.join(root, HOOKS_FILE), "utf8"));

    expect(hooks).toEqual({ hooks: { Stop: [{ hooks: [HUMAN_HOOK] }] } });
  });

  it("оставляет сгенерированный файл, исправленный руками", async () => {
    await connectedProject();
    const coder = path.join(root, ".codex/agents/coder.toml");

    await writeFile(coder, `${await readFile(coder, "utf8")}# my edit\n`);

    const plan = await disconnectCodex({ projectDirectory: root });

    expect(plan.edited).toContain(".codex/agents/coder.toml");
    expect(await exists(".codex/agents/coder.toml")).toBe(true);
  });
});
