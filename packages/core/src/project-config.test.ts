import { describe, expect, it } from "vitest";
import { parseProjectConfig, ProjectConfigError } from "./project-config.ts";

function validConfig(): Record<string, unknown> {
  return {
    projectId: "lab",
    harness: "0.3.0",
    workflow: "default",
    journal: "../lab.cyberzavod",
    schemaVersion: 2,
    agents: { claude: { planning: { provider: "anthropic", model: "default" } } },
    verification: { commands: ["pnpm test", "pnpm lint"], paths: ["src"] },
    stack: { languages: ["typescript"], frameworks: ["react"], packageManager: "pnpm" },
  };
}

function legacyConfig(agents: Record<string, unknown>): Record<string, unknown> {
  return { ...validConfig(), schemaVersion: 1, agents };
}

describe("parseProjectConfig", () => {
  it("принимает полный конфиг", () => {
    const raw = validConfig();

    const config = parseProjectConfig(raw);

    expect(config).toEqual({ ...raw, schemaVersion: undefined });
  });

  it("сохраняет порядок агентов", () => {
    const raw = { ...validConfig(), agents: { codex: {}, claude: {} } };

    const config = parseProjectConfig(raw);

    expect(Object.keys(config.agents)).toEqual(["codex", "claude"]);
  });

  it("читает конфиг версии 1 с одним агентом как агента с этапами без поля agent", () => {
    const raw = legacyConfig({
      planning: { provider: "openai", agent: "codex", model: "default" },
      review: { agent: "codex" },
    });

    const config = parseProjectConfig(raw);

    expect(config.agents).toEqual({
      codex: { planning: { provider: "openai", model: "default" }, review: {} },
    });
  });

  it("читает конфиг без версии как версию 1", () => {
    const raw = { ...legacyConfig({ planning: { agent: "claude" } }), schemaVersion: undefined };

    const config = parseProjectConfig(raw);

    expect(config.agents).toEqual({ claude: { planning: {} } });
  });

  it("читает конфиг версии 1 без названного агента как конфиг без агентов", () => {
    const raw = legacyConfig({ planning: { model: "default" } });

    const config = parseProjectConfig(raw);

    expect(config.agents).toEqual({});
  });

  it("без agents и verification даёт пустые значения", () => {
    const raw = validConfig();

    delete raw.agents;
    delete raw.verification;
    delete raw.stack;

    const config = parseProjectConfig(raw);

    expect(config).toMatchObject({ agents: {}, verification: { commands: [], paths: [] } });
    expect(config.stack).toBeUndefined();
  });

  it.each([
    ["projectId с пробелом", { projectId: "my lab" }, /projectId/],
    ["версия формата новее известной", { schemaVersion: 3 }, /schemaVersion 3/],
    ["имя агента с переводом строки", { agents: { "cla\nude": {} } }, /agent name/],
    ["агент не объектом", { agents: { claude: "planning" } }, /agents\.claude must be an object/],
    ["agents не объектом", { agents: "claude" }, /agents must be an object/],
    ["без harness", { harness: undefined }, /harness/],
    ["без workflow", { workflow: "" }, /workflow/],
    ["без journal", { journal: undefined }, /journal/],
    [
      "агент неизвестного этапа",
      { agents: { claude: { deploy: {} } } },
      /agents\.claude: unknown stage deploy/,
    ],
    [
      "агент с неверной моделью",
      { agents: { claude: { review: { model: 5 } } } },
      /agents\.claude\.review: model/,
    ],
    ["команды проверки не строками", { verification: { commands: [1] } }, /commands/],
    ["пути проверки не списком", { verification: { paths: "src" } }, /paths/],
    ["языки не списком", { stack: { languages: "ts", frameworks: [] } }, /languages/],
    ["пустой менеджер пакетов", { stack: { packageManager: "" } }, /packageManager/],
  ])("отклоняет конфиг: %s", (_name, override, message) => {
    const raw = { ...validConfig(), ...override };

    const act = () => parseProjectConfig(raw);

    expect(act).toThrow(message);
    expect(act).toThrow(ProjectConfigError);
  });

  it.each([
    [
      "версия 1 с двумя агентами",
      legacyConfig({ planning: { agent: "claude" }, review: { agent: "codex" } }),
      /one agent.*claude, codex/,
    ],
    ["версия 1 с неверным именем агента", legacyConfig({ review: { agent: 5 } }), /agent must be/],
    ["версия 1 с неизвестным этапом", legacyConfig({ deploy: {} }), /agents: unknown stage deploy/],
  ])("отклоняет прежний конфиг: %s", (_name, raw, message) => {
    const act = () => parseProjectConfig(raw);

    expect(act).toThrow(message);
    expect(act).toThrow(ProjectConfigError);
  });
});
