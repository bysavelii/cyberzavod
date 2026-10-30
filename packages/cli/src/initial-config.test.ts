import { describe, expect, it } from "vitest";
import type { Stage } from "@cyberzavod/core";
import { claudeAdapter } from "./agents/claude.ts";
import type { DetectedProject } from "./detect.ts";
import {
  DEFAULT_WORKFLOW,
  initialConfigOf,
  stageAgentsOf,
  type InitOverrides,
} from "./initial-config.ts";
import { CommandError } from "./errors.ts";
import { HARNESS_VERSION, readInstallation } from "./installation/installation.ts";
import { CLI_MESSAGES } from "./messages/catalog.ts";

function detected(): DetectedProject {
  return {
    name: "@acme/shop",
    languages: ["typescript"],
    frameworks: ["react"],
    packageManager: "pnpm",
    git: true,
    scripts: ["test"],
    verification: ["pnpm run lint", "pnpm run test"],
  };
}

async function configWith(overrides: InitOverrides) {
  const { harness } = await readInstallation();

  return initialConfigOf({
    detected: detected(),
    harness,
    overrides,
    identity: claudeAdapter.identity,
  });
}

describe("initialConfigOf", () => {
  it("по умолчанию берёт найденное: имя, проверки, журнал в .cyberzavod", async () => {
    const config = await configWith({});

    expect({
      projectId: config.projectId,
      harness: config.harness,
      workflow: config.workflow,
      journal: config.journal,
      commands: config.verification.commands,
      agents: config.agents,
      stack: config.stack,
    }).toEqual({
      projectId: "acme-shop",
      harness: HARNESS_VERSION,
      workflow: "default",
      journal: ".cyberzavod/journal",
      commands: ["pnpm run lint", "pnpm run test"],
      agents: {
        claude: {
          planning: { provider: "anthropic", model: "default" },
          implementation: { provider: "anthropic", model: "default" },
          review: { provider: "anthropic", model: "default" },
          verification: { provider: "anthropic", model: "default" },
        },
      },
      stack: { languages: ["typescript"], frameworks: ["react"], packageManager: "pnpm" },
    });
  });

  it("нормализует --id до идентификатора записи", async () => {
    const config = await configWith({ projectId: "My Shop" });

    expect(config.projectId).toBe("my-shop");
  });

  it("заменяет найденные проверки заданными через --check", async () => {
    const config = await configWith({ checks: ["make check", "make e2e"] });

    expect(config.verification.commands).toEqual(["make check", "make e2e"]);
  });

  it.each([
    ["./lab/", "lab"],
    ["lab", "lab"],
    ["lab\\notes\\", "lab/notes"],
    ["../shop.cyberzavod", "../shop.cyberzavod"],
  ])("приводит --journal %j к пути от корня проекта %j", async (journal, expected) => {
    const config = await configWith({ journal });

    expect(config.journal).toBe(expected);
  });

  it("обрезает пробелы вокруг значений флагов", async () => {
    const config = await configWith({
      projectId: " lab ",
      checks: [" make check "],
      journal: " lab ",
    });

    expect({
      projectId: config.projectId,
      commands: config.verification.commands,
      journal: config.journal,
    }).toEqual({ projectId: "lab", commands: ["make check"], journal: "lab" });
  });

  it.each([".", "./", "lab/.."])("отклоняет --journal %j: это корень проекта", async (journal) => {
    const act = () => configWith({ journal });

    await expect(act).rejects.toThrow(/is the project root/);
  });

  it.each([
    ["--id", { projectId: "  " }],
    ["--check", { checks: ["make check", ""] }],
    ["--journal", { journal: "" }],
  ])("отклоняет пустой %s", async (option, overrides) => {
    const act = () => configWith(overrides);

    await expect(act).rejects.toThrow(new RegExp(`${option} is empty`));
  });

  it.each(["/var/journal", "C:\\journal", "\\\\server\\share"])(
    "отклоняет абсолютный --journal %j",
    async (journal) => {
      const act = () => configWith({ journal });

      await expect(act).rejects.toThrow(CommandError);
      await expect(act).rejects.toThrow(/not an absolute one/);
    },
  );

  it("называет ошибку флага на языке сообщений", async () => {
    const error = await configWith({ journal: "" }).catch((err: unknown) => err);

    expect(error instanceof CommandError && error.describe(CLI_MESSAGES.ru)).toBe(
      "--journal пуст: укажите значение",
    );
  });
});

describe("stageAgentsOf", () => {
  it("даёт настройки агента этапам процесса, у которых в harness есть роль", async () => {
    const { harness } = await readInstallation();

    const stages = stageAgentsOf(harness, DEFAULT_WORKFLOW, claudeAdapter.identity);

    const withRole = Object.keys(stages).every((stage) => harness.stages[stage as Stage].role);

    expect({ withRole, settings: Object.values(stages) }).toEqual({
      withRole: true,
      settings: Object.values(stages).map(() => ({ provider: "anthropic", model: "default" })),
    });
  });
});
