import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { parseProjectConfig, type ProjectConfig } from "@cyberzavod/core";
import { MARKER_DIRECTORY, PROJECT_CONFIG_FILE, writeProjectConfig } from "@cyberzavod/storage";
import { adapters } from "./fixtures.ts";
import {
  adapterNamed,
  adaptersAt,
  agentNamesOf,
  connectedAdaptersOf,
  connectedAgentsOf,
} from "./host-agent.ts";

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

describe("connectedAgentsOf", () => {
  it("без агентов в конфиге возвращает агента по умолчанию", () => {
    const config = configWith({});

    expect(connectedAgentsOf(config)).toEqual(["claude"]);
  });

  it("возвращает подключённых агентов в порядке подключения", () => {
    const config = configWith({ codex: { implementation: {} }, claude: { review: {} } });

    expect(connectedAgentsOf(config)).toEqual(["codex", "claude"]);
  });

  it("отклоняет неизвестного агента и перечисляет поддерживаемых", () => {
    const config = configWith({ claude: { implementation: {} }, gemini: { review: {} } });

    const act = () => connectedAgentsOf(config);

    expect(act).toThrow("the agent “gemini” is not supported: available are claude, codex");
  });
});

describe("agentNamesOf", () => {
  it("не проверяет имена: неизвестный агент попадает в список", () => {
    const config = configWith({ gemini: { implementation: {} } });

    expect(agentNamesOf(config)).toEqual(["gemini"]);
  });

  it("без агентов называет агента по умолчанию", () => {
    expect(agentNamesOf(configWith({}))).toEqual(["claude"]);
  });
});

describe("connectedAdaptersOf", () => {
  it("возвращает адаптеры подключённых агентов", () => {
    const config = configWith({ claude: { implementation: {} }, codex: { implementation: {} } });

    const connected = connectedAdaptersOf(config, adapters);

    expect(connected.map((adapter) => adapter.name)).toEqual(["claude", "codex"]);
  });
});

describe("adapterNamed", () => {
  const bothAgents = () =>
    configWith({ claude: { implementation: {} }, codex: { implementation: {} } });

  it("без флага возвращает единственного агента", () => {
    const config = configWith({ codex: { implementation: {} } });

    expect(adapterNamed(config, adapters, undefined).name).toBe("codex");
  });

  it("без флага и без агентов в конфиге возвращает агента по умолчанию", () => {
    expect(adapterNamed(configWith({}), adapters, undefined).name).toBe("claude");
  });

  it("по флагу возвращает названного агента из нескольких", () => {
    expect(adapterNamed(bothAgents(), adapters, "codex").name).toBe("codex");
  });

  it("без флага при нескольких агентах просит назвать одного", () => {
    const act = () => adapterNamed(bothAgents(), adapters, undefined);

    expect(act).toThrow("several agents are connected (claude, codex): name one with --agent");
  });

  it("отклоняет агента, который не подключён, и перечисляет подключённых", () => {
    const config = configWith({ claude: { implementation: {} } });

    const act = () => adapterNamed(config, adapters, "codex");

    expect(act).toThrow("the agent codex is not connected to this project (connected: claude)");
  });

  it("отклоняет неизвестное имя агента", () => {
    const act = () => adapterNamed(bothAgents(), adapters, "gemini");

    expect(act).toThrow("unknown agent gemini in --agent");
  });
});

describe("adaptersAt", () => {
  async function directory(): Promise<string> {
    const created = await mkdtemp(path.join(tmpdir(), "cyberzavod-host-agent-"));

    onTestFinished(() => rm(created, { recursive: true, force: true }));

    return created;
  }

  it("вне проекта возвращает адаптер по умолчанию", async () => {
    const found = await adaptersAt(await directory(), adapters);

    expect(found.map((adapter) => adapter.name)).toEqual(["claude"]);
  });

  it("с неподходящим агентом в конфиге возвращает адаптер по умолчанию", async () => {
    const root = await directory();

    await writeProjectConfig(root, configWith({ gemini: { implementation: {} } }));

    const found = await adaptersAt(root, adapters);

    expect(found.map((adapter) => adapter.name)).toEqual(["claude"]);
  });

  it("с нечитаемым конфигом возвращает адаптер по умолчанию", async () => {
    const root = await directory();

    await mkdir(path.join(root, MARKER_DIRECTORY));
    await writeFile(path.join(root, PROJECT_CONFIG_FILE), "{ not json");

    const found = await adaptersAt(root, adapters);

    expect(found.map((adapter) => adapter.name)).toEqual(["claude"]);
  });

  it("в проекте с двумя агентами возвращает адаптеры обоих", async () => {
    const root = await directory();

    await writeProjectConfig(
      root,
      configWith({ codex: { implementation: {} }, claude: { implementation: {} } }),
    );

    const found = await adaptersAt(root, adapters);

    expect(found.map((adapter) => adapter.name)).toEqual(["codex", "claude"]);
  });
});
