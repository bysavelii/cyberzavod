import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEGACY_TOOL_FILE } from "@cyberzavod/storage";
import { connectedProject, projectContext } from "./fixtures.ts";
import { adapters } from "../agents/fixtures.ts";
import { hooksCheckFor } from "./hooks.ts";

const SETTINGS = ".claude/settings.json";
const hooksCheck = hooksCheckFor(adapters.claude);
const SYNC_FIX = "run npx cyberzavod sync";

async function rewriteSettings(
  root: string,
  change: (settings: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const file = path.join(root, SETTINGS);
  const settings = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;

  await writeFile(file, JSON.stringify(change(settings)));
}

describe("hooksCheckFor", () => {
  it("видит хуки, которые поставил init", async () => {
    const project = await connectedProject();

    const result = await hooksCheck.run(await projectContext(project));

    expect(result).toEqual({
      status: "passed",
      summary: `agent hooks are installed for ${project.config.harness}`,
    });
  });

  it("без обработчиков адаптера в настройках просит выполнить sync", async () => {
    const project = await connectedProject();

    await writeFile(path.join(project.root, SETTINGS), "{}");

    const result = await hooksCheck.run(await projectContext(project));

    expect(result).toEqual({
      status: "failed",
      problem: `agent hooks are not installed in ${SETTINGS}`,
      fix: SYNC_FIX,
    });
  });

  it("называет версию, если хуки поставлены другой версией", async () => {
    const project = await connectedProject();

    await rewriteSettings(project.root, (settings) =>
      JSON.parse(
        JSON.stringify(settings).replaceAll(
          `cyberzavod@${project.config.harness}`,
          "cyberzavod@0.7.0",
        ),
      ),
    );

    const result = await hooksCheck.run(await projectContext(project));

    expect(result).toEqual({
      status: "failed",
      problem: `agent hooks in ${SETTINGS} are for 0.7.0, but the config says ${project.config.harness}`,
      fix: SYNC_FIX,
    });
  });

  it("называет вшитый CLI прежних версий по его файлу", async () => {
    const project = await connectedProject();

    await rewriteSettings(project.root, () => ({
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: `node ${LEGACY_TOOL_FILE} hook stop` }] }],
      },
    }));

    const result = await hooksCheck.run(await projectContext(project));

    expect(result).toMatchObject({
      status: "failed",
      problem: expect.stringContaining(`are for ${LEGACY_TOOL_FILE}`) as string,
      fix: SYNC_FIX,
    });
  });

  it("называет событие, у которого не хватает обработчика", async () => {
    const project = await connectedProject();

    await rewriteSettings(project.root, (settings) => {
      const hooks = Object.entries(settings.hooks as Record<string, unknown>);

      return {
        ...settings,
        hooks: Object.fromEntries(hooks.filter(([event]) => event !== "Stop")),
      };
    });

    const result = await hooksCheck.run(await projectContext(project));

    expect(result).toEqual({
      status: "failed",
      problem: "agent hooks are incomplete: nothing is set for Stop",
      fix: SYNC_FIX,
    });
  });

  it("просит исправить JSON, если настройки не разобрать", async () => {
    const project = await connectedProject();

    await mkdir(path.join(project.root, ".claude"), { recursive: true });
    await writeFile(path.join(project.root, SETTINGS), "{ not json");

    const result = await hooksCheck.run(await projectContext(project));

    expect(result).toMatchObject({
      status: "failed",
      fix: `fix the JSON in ${SETTINGS}, then run npx cyberzavod sync`,
    });
    expect(result).toHaveProperty(
      "problem",
      expect.stringContaining(`agent hooks cannot be checked: ${SETTINGS} cannot be parsed`),
    );
  });
});
