import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { parseProjectConfig, type ProjectConfig } from "@cyberzavod/core";
import { MARKER_DIRECTORY, PROJECT_CONFIG_FILE, writeProjectConfig } from "@cyberzavod/storage";
import { adapters } from "./fixtures.ts";
import { adapterAt, adapterFor, hostAgentOf } from "./host-agent.ts";

function configWith(agents: Record<string, object>): ProjectConfig {
  return parseProjectConfig({
    projectId: "shop",
    schemaVersion: 2,
    harness: "0.9.1",
    workflow: "default",
    journal: ".cyberzavod/journal",
    agents,
    verification: { commands: [], paths: [] },
  });
}

describe("hostAgentOf", () => {
  it("без агентов в конфиге возвращает агента по умолчанию", () => {
    const config = configWith({});

    expect(hostAgentOf(config)).toBe("claude");
  });

  it("берёт подключённого агента", () => {
    const config = configWith({ claude: { implementation: {}, review: {} } });

    expect(hostAgentOf(config)).toBe("claude");
  });

  it("берёт агента, у которого этап без модели", () => {
    const config = configWith({ claude: { implementation: { provider: "anthropic" } } });

    expect(hostAgentOf(config)).toBe("claude");
  });

  it("берёт codex, если он подключён", () => {
    const config = configWith({ codex: { implementation: {}, review: {} } });

    expect(hostAgentOf(config)).toBe("codex");
  });

  it("отклоняет неизвестного агента и перечисляет поддерживаемых", () => {
    const config = configWith({ gemini: { implementation: {} } });

    const act = () => hostAgentOf(config);

    expect(act).toThrow("the agent “gemini” is not supported: available are claude, codex");
  });

  it("отклоняет смешанных агентов и называет их", () => {
    const config = configWith({ claude: { implementation: {} }, gemini: { review: {} } });

    const act = () => hostAgentOf(config);

    expect(act).toThrow(
      ".cyberzavod/project.json names several agents (claude, gemini): a project is driven by one agent",
    );
  });
});

describe("adapterFor", () => {
  it("возвращает адаптер codex для проекта с codex", () => {
    const config = configWith({ codex: { implementation: {} } });

    expect(adapterFor(config, adapters).name).toBe("codex");
  });

  it("возвращает адаптер агента проекта", () => {
    const config = configWith({ claude: { implementation: {} } });

    expect(adapterFor(config, adapters).name).toBe("claude");
  });
});

describe("adapterAt", () => {
  async function directory(): Promise<string> {
    const created = await mkdtemp(path.join(tmpdir(), "cyberzavod-host-agent-"));

    onTestFinished(() => rm(created, { recursive: true, force: true }));

    return created;
  }

  it("вне проекта возвращает адаптер по умолчанию", async () => {
    const adapter = await adapterAt(await directory(), adapters);

    expect(adapter.name).toBe("claude");
  });

  it("с неподходящим агентом в конфиге возвращает адаптер по умолчанию", async () => {
    const root = await directory();

    await writeProjectConfig(root, configWith({ gemini: { implementation: {} } }));

    const adapter = await adapterAt(root, adapters);

    expect(adapter.name).toBe("claude");
  });

  it("с нечитаемым конфигом возвращает адаптер по умолчанию", async () => {
    const root = await directory();

    await mkdir(path.join(root, MARKER_DIRECTORY));
    await writeFile(path.join(root, PROJECT_CONFIG_FILE), "{ not json");

    const adapter = await adapterAt(root, adapters);

    expect(adapter.name).toBe("claude");
  });
});
