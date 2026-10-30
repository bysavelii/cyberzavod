import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { adapters } from "../agents/fixtures.ts";
import { commandsFoundCheck } from "../doctor/commands-found.ts";
import { commandsPassCheck } from "../doctor/commands-pass.ts";
import type { CommandRunner, Machine, ProjectCheck } from "../doctor/check.ts";
import { connectedProject, machine, messages } from "../doctor/fixtures.ts";
import { readInstallation } from "../installation/installation.ts";
import { memoryCredentials, SECRET_TOKEN } from "../sharing/fixtures.ts";
import { projectChecksWith, runDoctor, type DoctorOptions } from "./doctor.ts";

async function optionsWith(
  patch: {
    machine?: Machine;
    commandsCheck?: ProjectCheck;
    runCommand?: CommandRunner;
    isJson?: boolean;
  } = {},
): Promise<DoctorOptions> {
  const runCommand: CommandRunner = patch.runCommand ?? (() => ({ kind: "exited", code: 0 }));

  return {
    machine: patch.machine ?? machine(),
    projectChecks: projectChecksWith(patch.commandsCheck ?? commandsFoundCheck, [adapters.claude]),
    projectTools: { isProgramAvailable: async () => true, runCommand },
    installation: await readInstallation(),
    messages,
    adapters: [adapters.claude],
    language: "en",
    isJson: patch.isJson ?? false,
  };
}

function printedLines(): string[] {
  return vi
    .mocked(console.log)
    .mock.calls.map((call) => call.join(" "))
    .join("\n")
    .split("\n");
}

describe("runDoctor", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("в исправном проекте печатает только ✓ и –, итог и возвращает true", async () => {
    const project = await connectedProject();
    const options = await optionsWith();

    vi.mocked(console.log).mockClear();

    const isHealthy = await runDoctor(project.root, options);

    const [summary, ...results] = printedLines().reverse();

    expect({
      isHealthy,
      summary,
      resultSigns: results.map((line) => line[0]),
      resultCount: results.length,
    }).toEqual({
      isHealthy: true,
      summary: "All good.",
      resultSigns: Array<string>(10).fill("✓"),
      resultCount: 10,
    });
  });

  it("печатает пункты в порядке: Node, git, Claude Code, галерея, конфиг, хуки, файлы агента, правила, команды, .gitignore", async () => {
    const project = await connectedProject();
    const options = await optionsWith();

    vi.mocked(console.log).mockClear();

    await runDoctor(project.root, options);

    const lines = printedLines();

    expect(lines.slice(0, -1).map((line) => line.slice(2, 14))).toEqual([
      "Node.js 22.1",
      "git is insta",
      "Claude Code ",
      "gallery: sig",
      ".cyberzavod/",
      "agent hooks ",
      "agent files ",
      "AGENTS.md is",
      "programs mak",
      ".gitignore i",
    ]);
  });

  it("не печатает токен", async () => {
    const project = await connectedProject();
    const options = await optionsWith();

    vi.mocked(console.log).mockClear();

    await runDoctor(project.root, options);

    expect(printedLines().join("\n")).not.toContain(SECRET_TOKEN);
  });

  it("вне проекта печатает проверки машины и ошибку конфига, без проверок проекта", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cyberzavod-doctor-outside-"));

    onTestFinished(() => rm(directory, { recursive: true, force: true }));

    const isHealthy = await runDoctor(directory, await optionsWith());

    expect({ isHealthy, lines: printedLines() }).toEqual({
      isHealthy: false,
      lines: [
        "✓ Node.js 22.1.0",
        "✓ git is installed",
        "✓ Claude Code is installed",
        "✓ gallery: signed in",
        `✗ no Cyberzavod project found from ${directory}`,
        "    How to fix: run npx cyberzavod init in the project root",
        "Problems: 1.",
      ],
    });
  });

  it("с неизвестным агентом среди подключённых печатает ✗ конфига и пропускает проверки проекта", async () => {
    const project = await connectedProject();
    const agents = {
      claude: { implementation: { provider: "anthropic" } },
      gemini: { review: { provider: "google" } },
    };

    await writeFile(
      path.join(project.root, PROJECT_CONFIG_FILE),
      JSON.stringify({ ...project.config, schemaVersion: 2, agents }),
    );
    vi.mocked(console.log).mockClear();

    const isHealthy = await runDoctor(project.root, await optionsWith());

    expect({ isHealthy, lines: printedLines().slice(-4) }).toEqual({
      isHealthy: false,
      lines: [
        "✓ gallery: signed in",
        "✗ the agents in the project config cannot be used: the agent “gemini” is not supported: available are claude, codex",
        "    How to fix: edit agents in .cyberzavod/project.json",
        "Problems: 1.",
      ],
    });
  });

  it("считает ✗ и возвращает false", async () => {
    const project = await connectedProject();
    const options = await optionsWith({ machine: machine({ nodeVersion: "20.0.0" }) });

    await writeFile(path.join(project.root, "AGENTS.md"), "");
    await rm(path.join(project.root, ".gitignore"));
    vi.mocked(console.log).mockClear();

    const isHealthy = await runDoctor(project.root, options);

    const lines = printedLines();

    expect({ isHealthy, problems: lines.filter((line) => line.startsWith("✗")).length }).toEqual({
      isHealthy: false,
      problems: 2,
    });
    expect(lines.at(-1)).toBe("Problems: 2.");
  });

  it("не считает заметку проблемой", async () => {
    const project = await connectedProject();
    const options = await optionsWith({ machine: machine({ credentials: memoryCredentials() }) });

    vi.mocked(console.log).mockClear();

    const isHealthy = await runDoctor(project.root, options);

    const lines = printedLines();

    expect({ isHealthy, notice: lines[3], last: lines.at(-1) }).toEqual({
      isHealthy: true,
      notice: "– gallery: not signed in (needed only to publish recordings)",
      last: "All good.",
    });
  });

  it("под ✗ печатает подсказку с отступом", async () => {
    const project = await connectedProject();
    const options = await optionsWith({ machine: machine({ nodeVersion: "20.0.0" }) });

    vi.mocked(console.log).mockClear();

    await runDoctor(project.root, options);

    expect(printedLines().slice(0, 2)).toEqual([
      "✗ Node.js 20.0.0 is too old: 22 or newer is needed",
      "    How to fix: install Node.js 22 or newer",
    ]);
  });

  it("без проверки запуском не запускает ни одной команды", async () => {
    const project = await connectedProject();
    const runCommand = vi.fn<CommandRunner>(() => ({ kind: "exited", code: 0 }));
    const options = await optionsWith({ runCommand });

    await runDoctor(project.root, options);

    expect(runCommand).not.toHaveBeenCalled();
  });

  it("с проверкой запуском запускает команды проекта", async () => {
    const project = await connectedProject();
    const runCommand = vi.fn<CommandRunner>(() => ({ kind: "exited", code: 0 }));
    const options = await optionsWith({ commandsCheck: commandsPassCheck, runCommand });

    await runDoctor(project.root, options);

    expect(runCommand).toHaveBeenCalledWith("make check", project.root);
  });

  it("с isJson печатает один JSON-документ с кодами проверок", async () => {
    const project = await connectedProject();
    const options = await optionsWith({ isJson: true });

    vi.mocked(console.log).mockClear();

    const isHealthy = await runDoctor(project.root, options);

    const document = JSON.parse(printedLines().join("\n")) as {
      schemaVersion: number;
      command: string;
      status: string;
      checks: { id: string }[];
    };

    expect({
      isHealthy,
      schemaVersion: document.schemaVersion,
      command: document.command,
      status: document.status,
      ids: document.checks.map((check) => check.id),
    }).toEqual({
      isHealthy: true,
      schemaVersion: 2,
      command: "doctor",
      status: "ok",
      ids: [
        "node",
        "git",
        "claude-code",
        "gallery",
        "config",
        "hooks",
        "files",
        "rules",
        "commands",
        "gitignore",
      ],
    });
  });
});
