import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RULES_TODO_MARK } from "@cyberzavod/core";
import { PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { adapters, adaptersWithCodexHome } from "../agents/fixtures.ts";
import type { Confirmation } from "../confirmation.ts";
import { readInstallation, type Installation } from "../installation/installation.ts";
import { CLI_MESSAGES } from "../messages/catalog.ts";
import { initProject } from "./init.ts";

const MAX_SUMMARY_LINES = 12;
const MAX_SUMMARY_COLUMNS = 80;
const messages = CLI_MESSAGES.ru;

let root: string;
let installation: Installation;

function printed(): string {
  return vi
    .mocked(console.log)
    .mock.calls.map((call) => call.join(" "))
    .join("\n");
}

async function exists(file: string): Promise<boolean> {
  return access(path.join(root, file)).then(
    () => true,
    () => false,
  );
}

// Remembers what was printed by the time of the question and replies with a prepared answer.
function answering(isConfirmed: boolean): {
  confirm: Confirmation;
  asked: string[];
  seen: string[];
} {
  const asked: string[] = [];
  const seen: string[] = [];
  const confirm: Confirmation = (question) => {
    asked.push(question);
    seen.push(printed());

    return Promise.resolve(isConfirmed);
  };

  return { confirm, asked, seen };
}

describe("initProject", () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "cyberzavod-init-"));
    installation = await readInstallation();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("после отказа ничего не пишет и сообщает об отмене", async () => {
    await writeFile(path.join(root, "CLAUDE.md"), "# Мои правила\n");
    const { confirm } = answering(false);

    await initProject(root, { confirm, overrides: {}, installation, messages, adapters });

    expect({
      cancelled: printed().includes(messages.init.cancelled),
      done: printed().includes(messages.init.done),
      created: await Promise.all(
        [PROJECT_CONFIG_FILE, "AGENTS.md", ".claude", ".gitignore"].map(exists),
      ),
      entrypoint: await readFile(path.join(root, "CLAUDE.md"), "utf8"),
    }).toEqual({
      cancelled: true,
      done: false,
      created: [false, false, false, false],
      entrypoint: "# Мои правила\n",
    });
  });

  it("спрашивает один раз «Продолжить?» и после согласия подключает проект", async () => {
    const { confirm, asked } = answering(true);

    await initProject(root, { confirm, overrides: {}, installation, messages, adapters });

    expect({ asked, connected: await exists(PROJECT_CONFIG_FILE) }).toEqual({
      asked: [messages.init.confirm],
      connected: true,
    });
  });

  it("печатает сводку до вопроса, не длиннее 12 строк", async () => {
    await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "x" } }));
    const { confirm, seen } = answering(true);

    await initProject(root, { confirm, overrides: {}, installation, messages, adapters });

    const [summary = ""] = seen;

    expect({
      lines: summary.split("\n").length <= MAX_SUMMARY_LINES,
      names: summary.includes("npm run test") && summary.includes(".cyberzavod/journal"),
    }).toEqual({ lines: true, names: true });
  });

  it("без проверок сводка отправляет к /setup", async () => {
    const { confirm, seen } = answering(true);

    await initProject(root, { confirm, overrides: {}, installation, messages, adapters });

    expect(seen[0]).toContain(
      messages.init.checksMissing({
        file: ".cyberzavod/project.json",
        terms: adapters.claude.terms,
      }),
    );
    expect(seen[0]).toContain("/setup");
  });

  it.each([
    { commands: ["npm run test"], marked: 3 },
    { commands: [], marked: 4 },
  ])(
    "отмечает каждую заглушку заготовки AGENTS.md ($marked отметки при проверках: $commands)",
    async ({ commands, marked }) => {
      const { confirm } = answering(true);

      await initProject(root, {
        confirm,
        overrides: { checks: commands },
        installation,
        messages,
        adapters,
      });

      const rules = await readFile(path.join(root, "AGENTS.md"), "utf8");
      const lines = rules.split("\n");
      const markedLines = lines.filter((line) => line.includes(RULES_TODO_MARK));
      const commandLines = lines.filter((line) => line.includes("`npm run test`"));

      expect({
        marked: markedLines.length,
        commandsMarked: commandLines.some((line) => line.includes(RULES_TODO_MARK)),
        hasPlaceholder: rules.includes("{{"),
      }).toEqual({ marked, commandsMarked: false, hasPlaceholder: false });
    },
  );

  it.each(["en", "ru"] as const)("сводка (%s) укладывается в 80 колонок", async (language) => {
    const { confirm, seen } = answering(true);

    await initProject(root, {
      confirm,
      overrides: {},
      installation,
      messages: CLI_MESSAGES[language],
      adapters,
    });

    const [summary = ""] = seen;
    const widest = Math.max(...summary.split("\n").map((line) => line.length));

    expect(widest).toBeLessThanOrEqual(MAX_SUMMARY_COLUMNS);
  });

  it("итог называет верхние каталоги и файлы для коммита без повторов", async () => {
    const { confirm } = answering(true);

    await initProject(root, { confirm, overrides: {}, installation, messages, adapters });

    expect(printed()).toContain(
      "Закоммитьте: .cyberzavod/, AGENTS.md, CLAUDE.md, .claude/, .gitignore",
    );
  });

  it("не называет в итоге AGENTS.md, если он уже был, и .gitignore, если журнал вне проекта", async () => {
    await writeFile(path.join(root, "AGENTS.md"), "# Правила\n");
    const { confirm } = answering(true);

    await initProject(root, {
      confirm,
      overrides: { journal: "../shop.cyberzavod" },
      installation,
      messages,
      adapters,
    });

    expect(printed()).toContain("Закоммитьте: .cyberzavod/, CLAUDE.md, .claude/\n");
  });

  it("называет в сводке перенос написанного человеком CLAUDE.md", async () => {
    await writeFile(path.join(root, "CLAUDE.md"), "# Мои правила\n");
    const { confirm, seen } = answering(true);

    await initProject(root, { confirm, overrides: {}, installation, messages, adapters });

    expect(seen[0]).toContain(messages.init.rulesMoved({ from: "CLAUDE.md", to: "AGENTS.md" }));
  });

  it("отклоняет неверный флаг до вопроса и ничего не пишет", async () => {
    const { confirm, asked } = answering(true);

    const act = () =>
      initProject(root, {
        confirm,
        overrides: { projectId: "" },
        installation,
        messages,
        adapters,
      });

    await expect(act).rejects.toThrow(/--id is empty/);
    expect({ asked, connected: await exists(PROJECT_CONFIG_FILE) }).toEqual({
      asked: [],
      connected: false,
    });
  });

  describe("добавление агента в подключённый проект", () => {
    async function connectedWithoutAgents(): Promise<void> {
      const { confirm } = answering(true);

      await initProject(root, { confirm, overrides: {}, installation, messages, adapters });

      const file = path.join(root, PROJECT_CONFIG_FILE);
      const config = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;

      await writeFile(file, JSON.stringify({ ...config, agents: {} }));
    }

    it("печатает сводку с файлами и спрашивает один раз", async () => {
      await connectedWithoutAgents();
      vi.mocked(console.log).mockClear();
      const { confirm, asked, seen } = answering(true);

      await initProject(root, {
        confirm,
        overrides: {},
        installation,
        messages,
        adapters: adaptersWithCodexHome(path.join(root, ".codex-home")),
        agent: "codex",
      });

      expect({ asked, summary: seen[0] }).toEqual({
        asked: [messages.init.confirm],
        summary: expect.stringContaining(messages.init.addAgentTitle(adapters.codex.terms)),
      });
    });

    it("в проекте без агентов в конфиге оставляет подразумеваемого Claude Code подключённым", async () => {
      await connectedWithoutAgents();
      const { confirm } = answering(true);

      await initProject(root, {
        confirm,
        overrides: {},
        installation,
        messages,
        adapters: adaptersWithCodexHome(path.join(root, ".codex-home")),
        agent: "codex",
      });

      const config = JSON.parse(await readFile(path.join(root, PROJECT_CONFIG_FILE), "utf8")) as {
        agents: object;
      };

      expect(Object.keys(config.agents)).toEqual(["claude", "codex"]);
    });
  });
});
