import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { runCli } from "./cli.ts";
import type { Environment } from "./messages/language.ts";

const CLAUDE_FILE = ".claude/settings.json";
const CODEX_FILE = ".codex/hooks.json";
const STAGE = { provider: "stub" };

let workspace: string;
let root: string;
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

async function addAgentToConfig(name: string, provider: string): Promise<void> {
  const file = path.join(root, PROJECT_CONFIG_FILE);
  const config = JSON.parse(await readFile(file, "utf8")) as { agents: Record<string, object> };
  const stages = { implementation: { ...STAGE, provider }, review: { ...STAGE, provider } };

  await writeFile(
    file,
    JSON.stringify({ ...config, agents: { ...config.agents, [name]: stages } }),
  );
}

// A project driven by Claude Code and Codex at once.
async function connectBothAgents(): Promise<void> {
  await runCli(["init", "--yes"], root, env);
  await addAgentToConfig("codex", "openai");
  await runCli(["sync"], root, env);
  vi.mocked(console.log).mockClear();
}

describe("runCli с двумя агентами в проекте", () => {
  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "cyberzavod-multi-"));
    root = path.join(workspace, "shop");
    env = { CODEX_HOME: path.join(workspace, "codex-home") };
    await mkdir(root);
    await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "x" } }));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(workspace, { recursive: true, force: true });
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
  });
});
