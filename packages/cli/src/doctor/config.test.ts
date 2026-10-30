import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { configCheck } from "./config.ts";
import { connectedProject, messages } from "./fixtures.ts";

describe("configCheck", () => {
  it("находит проект и называет его id и версию harness", async () => {
    const project = await connectedProject();

    const outcome = await configCheck(project.root, messages);

    expect(outcome.result).toEqual({
      status: "passed",
      summary: `${PROJECT_CONFIG_FILE}: project shop, harness ${project.config.harness}`,
    });
    expect(outcome.project?.root).toBe(project.root);
  });

  it("вне проекта называет каталог и зовёт init", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cyberzavod-doctor-none-"));

    onTestFinished(() => rm(directory, { recursive: true, force: true }));

    const outcome = await configCheck(directory, messages);

    expect(outcome).toEqual({
      result: {
        status: "failed",
        problem: `no Cyberzavod project found from ${directory}`,
        fix: "run npx cyberzavod init in the project root",
      },
      project: undefined,
    });
  });

  it("при битом конфиге печатает диагностику и просит исправить файл", async () => {
    const project = await connectedProject();

    await writeFile(path.join(project.root, PROJECT_CONFIG_FILE), "{ not json");

    const outcome = await configCheck(project.root, messages);

    expect(outcome.project).toBeUndefined();
    expect(outcome.result).toMatchObject({
      status: "failed",
      fix: `correct ${PROJECT_CONFIG_FILE} following the message above`,
    });
    expect(outcome.result).toHaveProperty("problem", expect.stringContaining("the project config"));
  });

  it("с неизвестным агентом среди подключённых не находит проект и зовёт исправить agents", async () => {
    const project = await connectedProject();
    const agents = {
      claude: { implementation: { provider: "anthropic" } },
      gemini: { review: { provider: "google" } },
    };

    await writeFile(
      path.join(project.root, PROJECT_CONFIG_FILE),
      JSON.stringify({ ...project.config, schemaVersion: 2, agents }),
    );

    const outcome = await configCheck(project.root, messages);

    expect(outcome).toEqual({
      result: {
        status: "failed",
        problem:
          "the agents in the project config cannot be used: the agent “gemini” is not supported: available are claude, codex",
        fix: `edit agents in ${PROJECT_CONFIG_FILE}`,
      },
      project: undefined,
    });
  });
});
