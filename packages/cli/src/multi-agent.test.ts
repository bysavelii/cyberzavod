import {
  access,
  appendFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncReport } from "@cyberzavod/adapter-kit";
import { PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { adaptersWithCodexHome } from "./agents/fixtures.ts";
import { runCli } from "./cli.ts";
import { initProject } from "./commands/init.ts";
import { readInstallation } from "./installation/installation.ts";
import { CLI_MESSAGES } from "./messages/catalog.ts";
import type { Environment } from "./messages/language.ts";

const CLAUDE_FILE = ".claude/settings.json";
const CODEX_FILE = ".codex/hooks.json";
const MANIFEST_FILE = ".cyberzavod/generated.json";
const PREVIOUS_HARNESS = "1.0.0";

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

async function exists(file: string): Promise<boolean> {
  return access(path.join(root, file)).then(
    () => true,
    () => false,
  );
}

// A project driven by Claude Code and Codex at once: Codex was added by a second `init`.
async function connectBothAgents(): Promise<void> {
  await runCli(["init", "--yes"], root, env);
  await runCli(["init", "--yes", "--agent", "codex"], root, env);
  vi.mocked(console.log).mockClear();
}

async function connectClaude(): Promise<void> {
  await runCli(["init", "--yes"], root, env);
  vi.mocked(console.log).mockClear();
}

async function readText(file: string): Promise<string> {
  return readFile(path.join(root, file), "utf8");
}

// Every file of the project by path, to see what a command left untouched.
async function projectFiles(directory = "."): Promise<Record<string, string>> {
  const entries = await readdir(path.join(root, directory), {
    recursive: true,
    withFileTypes: true,
  });
  const files = entries.filter((entry) => entry.isFile());
  const paths = files.map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));
  const texts = await Promise.all(paths.map((file) => readText(file)));

  return Object.fromEntries(paths.map((file, index) => [file, texts[index] ?? ""]));
}

async function humanCodexConfig(): Promise<string | undefined> {
  return readFile(path.join(codexHome, "config.toml"), "utf8").catch(() => undefined);
}

async function projectAgents(): Promise<string[]> {
  const config = JSON.parse(await readText(PROJECT_CONFIG_FILE)) as { agents: object };

  return Object.keys(config.agents);
}

async function manifestAgents(): Promise<string[]> {
  const manifest = JSON.parse(await readText(MANIFEST_FILE)) as { agents: object };

  return Object.keys(manifest.agents);
}

async function schemaVersionOf(file: string): Promise<unknown> {
  const document = JSON.parse(await readText(file)) as { schemaVersion: unknown };

  return document.schemaVersion;
}

// What `sync --check --json` reports about the files, the way scripts read it.
async function filesReportedBySyncCheck(): Promise<SyncReport> {
  vi.mocked(console.log).mockClear();
  await runCli(["sync", "--check", "--json"], root, env);

  const document = JSON.parse(printedLog()) as { files: SyncReport };

  return document.files;
}

interface Version2Config {
  agents: Record<string, Record<string, object>>;
}

interface Version2Manifest {
  agents: Record<string, { files: object; settings: object }>;
}

// A Claude Code project as Cyberzavod 1.x left it: the config names the agent on each stage, the
// manifest has no sections.
async function connectClaudeOfVersion1(): Promise<void> {
  await connectClaude();

  const config = JSON.parse(await readText(PROJECT_CONFIG_FILE)) as Version2Config;
  const stages = Object.entries(config.agents.claude ?? {}).map(
    ([stage, settings]) => [stage, { ...settings, agent: "claude" }] as const,
  );
  const configOfVersion1 = {
    ...config,
    schemaVersion: 1,
    harness: PREVIOUS_HARNESS,
    agents: Object.fromEntries(stages),
  };
  const manifest = JSON.parse(await readText(MANIFEST_FILE)) as Version2Manifest;
  const manifestOfVersion1 = { schemaVersion: 1, ...manifest.agents.claude };

  await writeFile(path.join(root, PROJECT_CONFIG_FILE), JSON.stringify(configOfVersion1));
  await writeFile(path.join(root, MANIFEST_FILE), JSON.stringify(manifestOfVersion1));
}

describe("runCli с двумя агентами в проекте", () => {
  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "cyberzavod-multi-"));
    root = path.join(workspace, "shop");
    codexHome = path.join(workspace, "codex-home");
    env = { CODEX_HOME: codexHome };
    await mkdir(root);
    await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "x" } }));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(workspace, { recursive: true, force: true });
  });

  describe("init --agent", () => {
    it("добавляет Codex в проект Claude Code: файлы, доверие, агент в конфиге", async () => {
      await connectClaude();

      const code = await runCli(["init", "--yes", "--agent", "codex"], root, env);

      expect({
        code,
        codexHooks: await exists(CODEX_FILE),
        codexSkills: await exists(".agents/skills"),
        trust: await humanCodexConfig(),
        agents: await projectAgents(),
        manifest: await manifestAgents(),
      }).toEqual({
        code: 0,
        codexHooks: true,
        codexSkills: true,
        trust: expect.stringContaining(root),
        agents: ["claude", "codex"],
        manifest: ["claude", "codex"],
      });
    });

    it("не меняет файлы Claude Code и оставляет sync --check зелёным", async () => {
      await connectClaude();

      const before = await projectFiles(".claude");

      await runCli(["init", "--yes", "--agent", "codex"], root, env);

      const check = await runCli(["sync", "--check"], root, env);

      expect({ claude: await projectFiles(".claude"), check }).toEqual({
        claude: before,
        check: 0,
      });
    });

    it("называет в итоге, что закоммитить и что делать дальше в Codex", async () => {
      await connectClaude();

      await runCli(["init", "--yes", "--agent", "codex"], root, env);

      expect(printedLog()).toContain("Next: open Codex and run $setup");
    });

    it("повторный init --agent codex и init без флага ничего не пишут", async () => {
      await connectBothAgents();

      const before = await projectFiles();
      const humanBefore = await humanCodexConfig();

      const again = await runCli(["init", "--yes", "--agent", "codex"], root, env);
      const bare = await runCli(["init", "--yes"], root, env);

      expect({
        codes: [again, bare],
        files: await projectFiles(),
        human: await humanCodexConfig(),
      }).toEqual({ codes: [0, 0], files: before, human: humanBefore });
    });

    it("после отказа в вопросе ничего не пишет", async () => {
      await connectClaude();

      const before = await projectFiles();

      await initProject(root, {
        confirm: () => Promise.resolve(false),
        overrides: {},
        installation: await readInstallation(),
        messages: CLI_MESSAGES.en,
        adapters: adaptersWithCodexHome(codexHome),
        agent: "codex",
      });

      expect({ files: await projectFiles(), human: await humanCodexConfig() }).toEqual({
        files: before,
        human: undefined,
      });
    });

    it("с чужим .codex/config.toml отказывает и ничего не записывает", async () => {
      await connectClaude();
      await mkdir(path.join(root, ".codex"));
      await writeFile(path.join(root, ".codex/config.toml"), "# mine\n");

      const before = await projectFiles();

      const code = await runCli(["init", "--yes", "--agent", "codex"], root, env);

      expect({ code, error: printedError(), files: await projectFiles() }).toEqual({
        code: 1,
        error: expect.stringContaining(".codex/config.toml"),
        files: before,
      });
    });

    it("добавляет Codex рядом с исправленным руками файлом Claude Code и не прячет его", async () => {
      await connectClaude();
      await appendFile(path.join(root, "CLAUDE.md"), "\nmy own line\n");

      const code = await runCli(["init", "--yes", "--agent", "codex"], root, env);

      expect({
        code,
        agents: await projectAgents(),
        codex: await exists(CODEX_FILE),
        edited: (await filesReportedBySyncCheck()).edited,
      }).toEqual({
        code: 0,
        agents: ["claude", "codex"],
        codex: true,
        edited: ["CLAUDE.md"],
      });
    });

    it("в проекте прежней версии просит сначала sync и ничего не меняет", async () => {
      await connectClaudeOfVersion1();

      const before = await projectFiles();

      const code = await runCli(["init", "--yes", "--agent", "codex"], root, env);

      expect({
        code,
        error: printedError(),
        files: await projectFiles(),
        human: await humanCodexConfig(),
      }).toEqual({
        code: 1,
        error: expect.stringContaining("npx cyberzavod sync"),
        files: before,
        human: undefined,
      });
    });

    it("после sync проекта прежней версии добавляет Codex, не меняя файлов Claude Code", async () => {
      await connectClaudeOfVersion1();
      await runCli(["sync"], root, env);

      const claudeBefore = await projectFiles(".claude");

      const code = await runCli(["init", "--yes", "--agent", "codex"], root, env);

      expect({
        code,
        claude: await projectFiles(".claude"),
        agents: await projectAgents(),
        manifest: await manifestAgents(),
        check: await runCli(["sync", "--check"], root, env),
      }).toEqual({
        code: 0,
        claude: claudeBefore,
        agents: ["claude", "codex"],
        manifest: ["claude", "codex"],
        check: 0,
      });
    });

    it("добавляет Claude Code в проект Codex", async () => {
      await runCli(["init", "--yes", "--agent", "codex"], root, env);

      const code = await runCli(["init", "--yes", "--agent", "claude"], root, env);

      expect({
        code,
        agents: await projectAgents(),
        claude: await exists(CLAUDE_FILE),
        manifest: await manifestAgents(),
      }).toEqual({
        code: 0,
        agents: ["codex", "claude"],
        claude: true,
        manifest: ["codex", "claude"],
      });
    });
  });

  describe("sync", () => {
    it("пишет файлы обоих агентов, и sync --check после этого выходит с 0", async () => {
      await connectBothAgents();

      const code = await runCli(["sync", "--check"], root, env);

      expect({
        code,
        claude: await exists(CLAUDE_FILE),
        codex: await exists(CODEX_FILE),
      }).toEqual({ code: 0, claude: true, codex: true });
    });

    it("повторный sync не удаляет файлы ни одного агента", async () => {
      await connectBothAgents();

      const code = await runCli(["sync"], root, env);

      expect({
        code,
        claude: await exists(CLAUDE_FILE),
        codex: await exists(CODEX_FILE),
        log: printedLog(),
      }).toEqual({ code: 0, claude: true, codex: true, log: "Up to date: nothing to change." });
    });

    it("переводит конфиг и манифест версии 1 на версию 2 и оставляет файлы Claude Code своими", async () => {
      await connectClaudeOfVersion1();

      const code = await runCli(["sync"], root, env);

      expect({
        code,
        config: await schemaVersionOf(PROJECT_CONFIG_FILE),
        agents: await projectAgents(),
        manifest: await schemaVersionOf(MANIFEST_FILE),
        sections: await manifestAgents(),
        check: await runCli(["sync", "--check"], root, env),
      }).toEqual({
        code: 0,
        config: 2,
        agents: ["claude"],
        manifest: 2,
        sections: ["claude"],
        check: 0,
      });
    });

    it("называет общий манифест один раз, хотя его обновят оба агента", async () => {
      await connectBothAgents();

      const manifest = await readText(MANIFEST_FILE);

      await writeFile(path.join(root, MANIFEST_FILE), JSON.stringify(JSON.parse(manifest)));

      const files = await filesReportedBySyncCheck();

      expect(files.updated).toEqual([MANIFEST_FILE]);
    });

    it("sync --diff говорит, что не тронет, по строке на агента", async () => {
      await connectBothAgents();

      await runCli(["sync", "--diff"], root, env);

      const lines = printedLog().split("\n");

      expect(lines.filter((line) => line.startsWith("Never touched:"))).toEqual([
        "Never touched: AGENTS.md, your own Claude Code settings and hooks, the journal, your code.",
        "Never touched: AGENTS.md, your own Codex settings and hooks, the journal, your code.",
      ]);
    });
  });

  describe("status", () => {
    it("называет исполнителей этапа через запятую", async () => {
      await connectBothAgents();

      await runCli(["status"], root, env);

      expect(printedLog()).toContain("claude · default, codex · default");
    });

    it("status --json отдаёт исполнителей этапа, а у ведущего — пустой список", async () => {
      await connectBothAgents();

      await runCli(["status", "--json"], root, env);

      const document = JSON.parse(printedLog()) as {
        schemaVersion: number;
        workflow: { stages: { stage: string; performers: object[] }[] };
      };
      const performers = Object.fromEntries(
        document.workflow.stages.map(({ stage, performers }) => [stage, performers]),
      );

      expect({
        schemaVersion: document.schemaVersion,
        implementation: performers.implementation,
        planning: performers.planning,
      }).toEqual({
        schemaVersion: 2,
        implementation: [
          { agent: "claude", model: "default" },
          { agent: "codex", model: "default" },
        ],
        planning: [
          { agent: "claude", model: "default" },
          { agent: "codex", model: "default" },
        ],
      });
    });
  });

  describe("doctor", () => {
    it("проверяет программу и хуки каждого агента и помечает их полем agent", async () => {
      await connectBothAgents();

      await runCli(["doctor", "--json"], root, env);

      const document = JSON.parse(printedLog()) as { checks: { id: string; agent?: string }[] };
      const agentChecks = document.checks
        .filter((check) => check.agent !== undefined)
        .map(({ id, agent }) => `${agent}:${id}`);

      expect(agentChecks).toEqual([
        "claude:claude-code",
        "codex:codex",
        "claude:hooks",
        "codex:hooks",
        "codex:trust",
      ]);
    });
  });

  describe("draft", () => {
    it("без --agent просит назвать агента и ничего не собирает", async () => {
      await connectBothAgents();

      const code = await runCli(["draft"], root, env);

      expect({ code, error: printedError() }).toEqual({
        code: 1,
        error:
          "cyberzavod draft: several agents are connected (claude, codex): name one with --agent <agent>",
      });
    });

    it("с неподключённым агентом называет подключённых", async () => {
      await runCli(["init", "--yes"], root, env);

      const code = await runCli(["draft", "--agent", "codex"], root, env);

      expect({ code, error: printedError() }).toEqual({
        code: 1,
        error:
          "cyberzavod draft: the agent codex is not connected to this project (connected: claude): npx cyberzavod init --agent codex adds it",
      });
    });

    it("с --agent codex ищет сырые журналы Codex", async () => {
      await connectBothAgents();

      const code = await runCli(["draft", "--agent", "codex"], root, env);

      expect({ code, error: printedError() }).toEqual({
        code: 1,
        error: expect.stringContaining("capture/codex/raw"),
      });
    });
  });

  describe("publish", () => {
    it("без --agent при двух агентах просит назвать одного", async () => {
      await connectBothAgents();

      const code = await runCli(["publish"], root, env);

      expect({ code, error: printedError() }).toEqual({
        code: 1,
        error: expect.stringContaining("several agents are connected (claude, codex)"),
      });
    });

    it("с --agent claude идёт дальше выбора агента: черновиков ещё нет", async () => {
      await connectBothAgents();

      const code = await runCli(["publish", "--agent", "claude"], root, env);

      expect({ code, error: printedError() }).toEqual({
        code: 1,
        error: "cyberzavod publish: no drafts yet: run npx cyberzavod draft first",
      });
    });
  });

  describe("disconnect", () => {
    it("без --agent убирает файлы обоих агентов и конфиг", async () => {
      await connectBothAgents();

      const code = await runCli(["disconnect", "--yes"], root, env);

      expect({
        code,
        claude: await exists(CLAUDE_FILE),
        codex: await exists(CODEX_FILE),
        manifest: await exists(".cyberzavod/generated.json"),
        config: await exists(PROJECT_CONFIG_FILE),
      }).toEqual({ code: 0, claude: false, codex: false, manifest: false, config: false });
    });

    it("--agent codex убирает только Codex: файлы, доверие и запись в конфиге", async () => {
      await connectBothAgents();

      const code = await runCli(["disconnect", "--agent", "codex", "--yes"], root, env);

      expect({
        code,
        codexHooks: await exists(CODEX_FILE),
        codexSkills: await exists(".agents/skills"),
        trust: (await humanCodexConfig()) ?? "",
        claude: await exists(CLAUDE_FILE),
        agents: await projectAgents(),
        manifest: await manifestAgents(),
      }).toEqual({
        code: 0,
        codexHooks: false,
        codexSkills: false,
        trust: expect.not.stringContaining(root),
        claude: true,
        agents: ["claude"],
        manifest: ["claude"],
      });
    });

    it("после --agent codex проект снова проходит sync --check", async () => {
      await connectBothAgents();
      await runCli(["disconnect", "--agent", "codex", "--yes"], root, env);

      const code = await runCli(["sync", "--check"], root, env);

      expect(code).toBe(0);
    });

    it("добавление Codex и его отключение возвращают проект Claude Code к исходному виду", async () => {
      await connectClaude();

      const before = await projectFiles();

      await runCli(["init", "--yes", "--agent", "codex"], root, env);
      await runCli(["disconnect", "--agent", "codex", "--yes"], root, env);

      expect(await projectFiles()).toEqual(before);
    });

    it("--agent codex не убирает агента, который не подключён", async () => {
      await connectClaude();

      const code = await runCli(["disconnect", "--agent", "codex", "--yes"], root, env);

      expect({ code, error: printedError(), agents: await projectAgents() }).toEqual({
        code: 1,
        error: expect.stringContaining("the agent codex is not connected to this project"),
        agents: ["claude"],
      });
    });

    it("--agent единственного агента убирает проект целиком", async () => {
      await connectClaude();

      const code = await runCli(["disconnect", "--agent", "claude", "--yes"], root, env);

      expect({ code, config: await exists(PROJECT_CONFIG_FILE) }).toEqual({
        code: 0,
        config: false,
      });
    });

    it("в плане называет, что останется: остальных агентов", async () => {
      await connectBothAgents();

      await runCli(["disconnect", "--agent", "codex", "--yes"], root, env);

      expect(printedLog()).toContain("the other agents and their files: claude");
    });
  });
});
