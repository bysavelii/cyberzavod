import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { adaptersWithCodexHome } from "./agents/fixtures.ts";
import { runCli } from "./cli.ts";
import { initProject } from "./commands/init.ts";
import { HARNESS_VERSION, readInstallation } from "./installation/installation.ts";
import { CLI_MESSAGES } from "./messages/catalog.ts";
import type { Environment } from "./messages/language.ts";

const HUMAN_CONFIG = '# my codex\nmodel = "gpt"  # keep\n\n[tui]\ntheme = "dark"\n';
const HOOKS_FILE = ".codex/hooks.json";
const PREVIOUS_VERSION = "0.8.0";

let workspace: string;
let root: string;
let codexHome: string;
let env: Environment;

function printedLog(): string {
  return vi.mocked(console.log).mock.calls.join("\n");
}

function printedError(): string {
  return vi.mocked(console.error).mock.calls.join("\n");
}

function configFile(): string {
  return path.join(codexHome, "config.toml");
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

async function humanConfig(text: string): Promise<void> {
  await mkdir(codexHome, { recursive: true });
  await writeFile(configFile(), text);
}

async function configText(): Promise<string> {
  return readFile(configFile(), "utf8");
}

function approvedHooksIn(text: string): number {
  return text.match(/^trusted_hash = /gm)?.length ?? 0;
}

async function projectConfig(): Promise<{ agents: Record<string, Record<string, object>> }> {
  return JSON.parse(await readFile(path.join(root, PROJECT_CONFIG_FILE), "utf8"));
}

async function initCodex(): Promise<number> {
  return runCli(["init", "--yes", "--agent", "codex", "--check", "node --version"], root, env);
}

// A project whose hooks are from an earlier version and approved by the human, as an earlier
// Cyberzavod left it.
async function projectWithEarlierApprovedHooks(): Promise<void> {
  const hooks = path.join(root, HOOKS_FILE);
  const earlier = (await readFile(hooks, "utf8")).replaceAll(HARNESS_VERSION, PREVIOUS_VERSION);

  await writeFile(hooks, earlier);

  const plan = await adaptersWithCodexHome(codexHome).codex.userConfig?.planConnect({
    root,
    version: PREVIOUS_VERSION,
  });

  await plan?.apply();
}

describe("runCli", () => {
  beforeEach(async () => {
    workspace = await realpath(await mkdtemp(path.join(tmpdir(), "cyberzavod-codex-cli-")));
    root = path.join(workspace, "project");
    codexHome = path.join(workspace, "codex-home");
    env = {
      PATH: process.env.PATH,
      XDG_CONFIG_HOME: path.join(workspace, "config"),
      CODEX_HOME: codexHome,
    };
    await mkdir(root, { recursive: true });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(workspace, { recursive: true, force: true });
  });

  describe("init --agent codex", () => {
    it("подключает проект к Codex: файлы Codex, агент в конфиге, ни следа Claude", async () => {
      const code = await initCodex();

      expect(code).toBe(0);
      expect((await projectConfig()).agents.codex?.implementation).toMatchObject({
        provider: "openai",
      });
      expect(await exists(path.join(root, ".codex/config.toml"))).toBe(true);
      expect(await exists(path.join(root, ".agents/skills/feature/SKILL.md"))).toBe(true);
      expect(await exists(path.join(root, HOOKS_FILE))).toBe(true);
      expect(await exists(path.join(root, "CLAUDE.md"))).toBe(false);
      expect(await exists(path.join(root, ".claude"))).toBe(false);
    });

    it("в сводке называет доверие, а после согласия записывает его в config.toml человека", async () => {
      await humanConfig(HUMAN_CONFIG);

      await initCodex();

      expect(await configText()).toContain(
        `[projects."${root}"]\ntrust_level = "trusted" # added by cyberzavod`,
      );
      expect(approvedHooksIn(await configText())).toBe(9);
      expect((await configText()).startsWith(HUMAN_CONFIG)).toBe(true);
      expect(printedLog()).toContain("Trust: the project will be marked trusted in");
      expect(printedLog()).toContain("Trust: the project hooks will be approved in");
      expect(printedLog()).toContain("Next: open Codex and run $setup, then $feature <task>.");
    });

    it("при неизвестном агенте выходит с 1 и ничего не пишет", async () => {
      const code = await runCli(["init", "--yes", "--agent", "gemini"], root, env);

      expect(code).toBe(1);
      expect(printedError()).toContain("unknown agent gemini");
      expect(printedError()).toContain("claude, codex");
      expect(await exists(path.join(root, ".cyberzavod"))).toBe(false);
    });

    it("при config.toml, который не разобрать, выходит с 1 до любой записи", async () => {
      await humanConfig("[broken");

      const code = await initCodex();

      expect(code).toBe(1);
      expect(printedError()).toContain("cannot be parsed as TOML");
      expect(await exists(path.join(root, ".cyberzavod"))).toBe(false);
      expect(await exists(path.join(root, ".codex"))).toBe(false);
      expect(await readFile(configFile(), "utf8")).toBe("[broken");
    });

    it("при config.toml со встроенной таблицей называет строки для ручной вставки", async () => {
      await humanConfig(`projects = { "${root}" = { trust_level = "untrusted" } }\n`);

      const code = await initCodex();

      expect(code).toBe(1);
      expect(printedError()).toContain("add these lines yourself");
      expect(printedError()).toContain(`[projects."${root}"]`);
      expect(await exists(path.join(root, ".cyberzavod"))).toBe(false);
    });

    it("после отказа не пишет ни в проект, ни в config.toml человека", async () => {
      await humanConfig(HUMAN_CONFIG);

      await initProject(root, {
        confirm: () => Promise.resolve(false),
        overrides: {},
        installation: await readInstallation(),
        messages: CLI_MESSAGES.en,
        adapters: adaptersWithCodexHome(codexHome),
        agent: "codex",
      });

      expect(await configText()).toBe(HUMAN_CONFIG);
      expect(await exists(path.join(root, ".cyberzavod"))).toBe(false);
      expect(printedLog()).toContain(CLI_MESSAGES.en.init.cancelled);
    });

    it("в проекте, подключённом к Codex, не принимает --agent claude", async () => {
      await initCodex();
      vi.mocked(console.error).mockClear();

      const code = await runCli(["init", "--yes", "--agent", "claude"], root, env);

      expect(code).toBe(1);
      expect(printedError()).toContain("already set up for codex, not claude");
    });
  });

  describe("sync", () => {
    it("переносит одобрение хуков на новые хуки и сообщает об этом", async () => {
      await initCodex();
      await projectWithEarlierApprovedHooks();
      vi.mocked(console.log).mockClear();

      const code = await runCli(["sync"], root, env);

      expect(code).toBe(0);
      expect(await adaptersWithCodexHome(codexHome).codex.userConfig?.inspect(root)).toMatchObject({
        kind: "ready",
      });
      expect(printedLog()).toContain("Hook approval in");
      expect(await readFile(path.join(root, HOOKS_FILE), "utf8")).toContain(HARNESS_VERSION);
    });

    it("не выдаёт доверие, которого человек не давал", async () => {
      await initCodex();
      await rm(codexHome, { recursive: true, force: true });
      await writeFile(
        path.join(root, HOOKS_FILE),
        (await readFile(path.join(root, HOOKS_FILE), "utf8")).replaceAll(
          HARNESS_VERSION,
          PREVIOUS_VERSION,
        ),
      );

      const code = await runCli(["sync"], root, env);

      expect(code).toBe(0);
      expect(await exists(configFile())).toBe(false);
    });

    it("не одобряет хук, одобрение которого человек снял", async () => {
      await initCodex();
      await projectWithEarlierApprovedHooks();
      await humanConfig(
        (await configText()).replace(
          /\[hooks\.state\.[^\]]*:pre_tool_use:0:0"\]\ntrusted_hash = "[^"]*"\n\n?/,
          "",
        ),
      );

      const code = await runCli(["sync"], root, env);

      expect(code).toBe(0);
      expect(approvedHooksIn(await configText())).toBe(8);
    });

    it("в режиме проверки не смотрит в config.toml человека", async () => {
      await initCodex();
      await rm(codexHome, { recursive: true, force: true });

      const code = await runCli(["sync", "--check"], root, env);

      expect(code).toBe(0);
      expect(await exists(configFile())).toBe(false);
    });
  });

  describe("doctor", () => {
    async function trustCheck(): Promise<{ status: string; fix?: string; message: string }> {
      vi.mocked(console.log).mockClear();
      await runCli(["doctor", "--json"], root, env);

      const report = JSON.parse(printedLog()) as {
        checks: { id: string; status: string; message: string; fix?: string }[];
      };
      const check = report.checks.find(({ id }) => id === "trust");

      if (check === undefined) throw new Error("в отчёте нет проверки trust");

      return check;
    }

    it("проверка trust проходит после init", async () => {
      await initCodex();

      const check = await trustCheck();

      expect(check.status).toBe("passed");
    });

    it("без доверия к проекту проверка trust падает и отправляет в Codex", async () => {
      await initCodex();
      await rm(codexHome, { recursive: true, force: true });

      const check = await trustCheck();

      expect(check.status).toBe("failed");
      expect(check.message).toContain("the project is not trusted");
      expect(check.fix).toContain("open Codex in the project and trust it");
      expect(check.fix).toContain(`[projects.${JSON.stringify(root)}]`);
    });

    it("без одобрения хуков проверка trust называет события", async () => {
      await initCodex();
      await humanConfig(`[projects."${root}"]\ntrust_level = "trusted"\n`);

      const check = await trustCheck();

      expect(check.status).toBe("failed");
      expect(check.message).toContain("SessionStart");
      expect(check.fix).toContain("/hooks");
    });

    it("битый .codex/hooks.json делает проверку trust ошибкой, а остальные проверки идут дальше", async () => {
      await initCodex();
      await writeFile(path.join(root, HOOKS_FILE), '{"hooks":{"Stop":[{"matcher":"x"}]}}');
      vi.mocked(console.log).mockClear();

      const code = await runCli(["doctor", "--json"], root, env);

      const { checks } = JSON.parse(printedLog()) as { checks: { id: string; status: string }[] };

      expect(code).toBe(1);
      expect(checks.find(({ id }) => id === "trust")?.status).toBe("failed");
      expect(checks.map(({ id }) => id)).toContain("gitignore");
    });

    it("hooks.json не JSON тоже не обрывает doctor", async () => {
      await initCodex();
      await writeFile(path.join(root, HOOKS_FILE), "{broken");
      vi.mocked(console.log).mockClear();

      const code = await runCli(["doctor", "--json"], root, env);

      const { checks } = JSON.parse(printedLog()) as { checks: { id: string; status: string }[] };

      expect(code).toBe(1);
      expect(checks.find(({ id }) => id === "trust")?.status).toBe("failed");
      expect(checks.map(({ id }) => id)).toContain("gitignore");
    });

    it("в отчёте есть проверка codex вместо claude-code, и нехватка программы — не ошибка", async () => {
      await initCodex();
      vi.mocked(console.log).mockClear();

      await runCli(["doctor", "--json"], root, { ...env, PATH: "" });

      const { checks } = JSON.parse(printedLog()) as { checks: { id: string; status: string }[] };
      const codex = checks.find(({ id }) => id === "codex");

      expect(codex?.status).toBe("notice");
      expect(checks.map(({ id }) => id)).not.toContain("claude-code");
    });
  });

  describe("disconnect", () => {
    it("убирает файлы Codex и доверие, а config.toml человека возвращает байт в байт", async () => {
      await humanConfig(HUMAN_CONFIG);
      await initCodex();

      const code = await runCli(["disconnect", "--yes"], root, env);

      expect(code).toBe(0);
      expect(await readFile(configFile(), "utf8")).toBe(HUMAN_CONFIG);
      expect(await exists(path.join(root, ".codex"))).toBe(false);
      expect(await exists(path.join(root, ".agents"))).toBe(false);
      expect(await exists(path.join(root, PROJECT_CONFIG_FILE))).toBe(false);
      expect(printedLog()).not.toContain("CLAUDE.md");
    });

    it("возвращает trust_level, который init заменил, байт в байт", async () => {
      const original = `[projects."${root}"]\ntrust_level = "untrusted"\n`;

      await humanConfig(original);
      await initCodex();

      await runCli(["disconnect", "--yes"], root, env);

      expect(await configText()).toBe(original);
    });

    it("оставляет доверие проекту, которое человек дал сам, и называет его в плане", async () => {
      await humanConfig(`[projects."${root}"]\ntrust_level = "trusted"\n`);
      await initCodex();
      vi.mocked(console.log).mockClear();

      await runCli(["disconnect", "--yes"], root, env);

      expect(await configText()).toBe(`[projects."${root}"]\ntrust_level = "trusted"\n`);
      expect(printedLog()).toContain("the trust you gave the project in");
    });

    it("при config.toml, который не разобрать, ничего не меняет", async () => {
      await initCodex();
      await humanConfig("[broken");

      const code = await runCli(["disconnect", "--yes"], root, env);

      expect(code).toBe(1);
      expect(await exists(path.join(root, PROJECT_CONFIG_FILE))).toBe(true);
      expect(await exists(path.join(root, ".codex/config.toml"))).toBe(true);
    });
  });

  describe("draft и publish", () => {
    it("draft без журналов сессии ищет их в каталоге Codex", async () => {
      await initCodex();

      const code = await runCli(["draft"], root, env);

      expect(code).toBe(1);
      expect(printedError()).toContain("capture/codex/raw");
    });

    it("draft собирает черновик из сырого журнала Codex", async () => {
      await initCodex();
      const raw = path.join(root, ".cyberzavod/journal/capture/codex/raw");
      const events = [
        { ts: Date.UTC(2026, 9, 4, 10), kind: "session_start" },
        { ts: Date.UTC(2026, 9, 4, 10, 0, 1), kind: "prompt", text: "Add a counter" },
      ];

      await mkdir(raw, { recursive: true });
      await writeFile(
        path.join(raw, "0123456789abcdef.jsonl"),
        events.map((event) => JSON.stringify(event)).join("\n"),
      );

      const code = await runCli(["draft"], root, env);

      expect(code).toBe(0);
      expect(
        await exists(
          path.join(root, ".cyberzavod/journal/capture/codex/drafts/2026-10-04-01234567.json"),
        ),
      ).toBe(true);
    });

    it("publish без черновиков просит сначала собрать черновик", async () => {
      await initCodex();

      const code = await runCli(["publish"], root, env);

      expect(code).toBe(1);
      expect(printedError()).toContain("no drafts yet");
    });
  });
});
