import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseProjectConfig, RULES_TODO_MARK } from "@cyberzavod/core";
import { LEGACY_TOOL_FILE, PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { runCli } from "./cli.ts";
import { HARNESS_VERSION } from "./installation/installation.ts";
import { CLI_MESSAGES } from "./messages/catalog.ts";
import { COMMAND_NAMES } from "./messages/cli-messages.ts";
import type { Environment } from "./messages/language.ts";
import { SECRET_TOKEN } from "./sharing/fixtures.ts";
import { credentialsFile, FileCredentialsStore } from "./sharing/settings.ts";

const SESSION_ID = "cli-test-hook-language";
const EN_TITLE = "Cyberzavod — a local-first development harness for AI coding agents.";
const RU_TITLE = "Cyberzavod — локальный harness разработки с ИИ-агентами.";
// The help must fit a default terminal screen.
const SCREEN_ROWS = 24;
const SCREEN_COLUMNS = 80;

// Everything init puts into the project is written in English: only the CLI picks the human's
// language.
const CYRILLIC = /\p{Script=Cyrillic}/u;

// An environment without language variables: messages are in English.
const NO_LOCALE: Environment = {};

let workspace: string;
let root: string;

async function initialized(): Promise<void> {
  await runCli(["init", "--yes"], root, NO_LOCALE);
}

function stdinWith(payload: object): typeof process.stdin {
  return Readable.from([Buffer.from(JSON.stringify(payload))]) as typeof process.stdin;
}

function printedLog(): string {
  return vi.mocked(console.log).mock.calls.join("\n");
}

function printedError(): string {
  return vi.mocked(console.error).mock.calls.join("\n");
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

async function journalFiles(collection: string): Promise<string[]> {
  return readdir(path.join(root, ".cyberzavod/journal", collection));
}

async function rewriteAgents(agents: Record<string, object>): Promise<void> {
  const file = path.join(root, PROJECT_CONFIG_FILE);
  const config = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;

  await writeFile(file, JSON.stringify({ ...config, agents }));
}

describe("runCli", () => {
  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "cyberzavod-cli-"));
    root = path.join(workspace, "shop");
    await mkdir(root);
    await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "x" } }));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(workspace, { recursive: true, force: true });
  });

  it("без команды печатает справку и выходит с успехом", async () => {
    const code = await runCli([], root, NO_LOCALE);

    expect(code).toBe(0);
  });

  it("--version печатает версию пакета", async () => {
    const code = await runCli(["--version"], root, NO_LOCALE);

    expect({ code, log: printedLog() }).toEqual({ code: 0, log: HARNESS_VERSION });
  });

  it("на неизвестную команду без подсказки сообщает об ошибке и зовёт --help", async () => {
    const code = await runCli(["deploy"], root, NO_LOCALE);

    expect({ code, error: printedError(), log: printedLog() }).toEqual({
      code: 1,
      error: "cyberzavod: unknown command “deploy”: all commands — npx cyberzavod --help",
      log: "",
    });
  });

  it("на опечатку подсказывает ближайшую команду", async () => {
    const code = await runCli(["stats"], root, NO_LOCALE);

    expect({ code, error: printedError(), log: printedLog() }).toEqual({
      code: 1,
      error:
        "cyberzavod: unknown command “stats”: did you mean npx cyberzavod status? All commands: npx cyberzavod --help",
      log: "",
    });
  });

  it("подсказывает на языке сообщений", async () => {
    await runCli(["stats"], root, { CYBERZAVOD_LANG: "ru" });

    expect(printedError()).toBe(
      "cyberzavod: неизвестная команда «stats»: может быть, npx cyberzavod status? Все команды: npx cyberzavod --help",
    );
  });

  it("не подсказывает служебную команду", async () => {
    const code = await runCli(["publsh"], root, NO_LOCALE);

    expect({ code, error: printedError() }).toEqual({
      code: 1,
      error: "cyberzavod: unknown command “publsh”: all commands — npx cyberzavod --help",
    });
  });

  it.each(["constructor", "__proto__", "toString"])(
    "имя %s из прототипа объекта — неизвестная команда: ошибка и код 1",
    async (name) => {
      const code = await runCli([name], root, NO_LOCALE);

      expect({
        code,
        error: printedError().startsWith("cyberzavod: unknown command"),
        log: printedLog(),
      }).toEqual({
        code: 1,
        error: true,
        log: "",
      });
    },
  );

  it("справка по умолчанию английская и называет флаг языка", async () => {
    await runCli(["--help"], root, NO_LOCALE);

    const help = printedLog();

    expect(help).toContain("Cyberzavod — a local-first development harness");
    expect(help).toContain("--lang en|ru");
  });

  it("справка по локали системы — русская", async () => {
    await runCli(["--help"], root, { LANG: "ru_RU.UTF-8" });

    const help = printedLog();

    expect(help).toContain("локальный harness разработки");
    expect(help).toContain("--lang en|ru");
  });

  it.each([
    ["--lang перекрывает локаль", ["--help", "--lang", "en"], { LANG: "ru_RU.UTF-8" }, EN_TITLE],
    ["--lang=язык перед командой", ["--lang=en", "--help"], { CYBERZAVOD_LANG: "ru" }, EN_TITLE],
    [
      "CYBERZAVOD_LANG перекрывает локаль",
      ["--help"],
      { LANG: "en_US.UTF-8", CYBERZAVOD_LANG: "ru" },
      RU_TITLE,
    ],
    ["LC_ALL важнее LANG", ["--help"], { LC_ALL: "ru_RU.UTF-8", LANG: "en_US.UTF-8" }, RU_TITLE],
  ] as const)("%s", async (_name, argv, env, title) => {
    await runCli([...argv], root, env);

    const [firstLine] = printedLog().split("\n");

    expect(firstLine).toBe(title);
  });

  it("--lang с неподдерживаемым языком — ошибка на языке без флага", async () => {
    const code = await runCli(["--help", "--lang", "de"], root, { LANG: "ru_RU.UTF-8" });

    expect({ code, error: printedError() }).toEqual({
      code: 1,
      error: "cyberzavod: язык «de» не поддерживается: доступны en, ru",
    });
  });

  it("--lang без значения — ошибка", async () => {
    const code = await runCli(["status", "--lang"], root, NO_LOCALE);

    expect({ code, error: printedError() }).toEqual({
      code: 1,
      error: "cyberzavod: --lang has no value: give a language, for example --lang en",
    });
  });

  it.each([
    [
      "по переменной окружения",
      ["status"],
      { CYBERZAVOD_LANG: "ru" },
      (root: string) =>
        `cyberzavod status: ${root} не в проекте Cyberzavod: сначала npx cyberzavod init`,
    ],
    [
      "по флагу поверх переменной",
      ["status", "--lang", "en"],
      { CYBERZAVOD_LANG: "ru" },
      (root: string) =>
        `cyberzavod status: ${root} is not in a Cyberzavod project: run npx cyberzavod init first`,
    ],
  ])("ошибка команды печатается на выбранном языке %s", async (_name, argv, env, expected) => {
    await runCli(argv, root, env);

    expect(printedError()).toBe(expected(root));
  });

  it.each([
    ["без русской локали — английское сообщение агенту", {}, "The config"],
    ["с русской локалью — русское сообщение агенту", { LANG: "ru_RU.UTF-8" }, "Конфиг"],
  ])("хук stop %s", async (_name, locale, start) => {
    await mkdir(path.join(root, ".cyberzavod"));
    await writeFile(path.join(root, PROJECT_CONFIG_FILE), "{ broken");
    vi.spyOn(process, "stdin", "get").mockReturnValue(stdinWith({ session_id: SESSION_ID }));
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runCli(["hook", "stop"], root, { ...locale, CLAUDE_PROJECT_DIR: root });

    const [written] = stdout.mock.calls[0] ?? [];
    const { systemMessage } = JSON.parse(String(written)) as { systemMessage: string };

    expect(systemMessage.startsWith(start)).toBe(true);
  });

  describe("hook --agent", () => {
    const CODEX_SESSION = "cli-test-codex-hook";

    function codexStdin(extra: object): void {
      const payload = { session_id: CODEX_SESSION, cwd: root, ...extra };

      vi.spyOn(process, "stdin", "get").mockReturnValue(stdinWith(payload));
    }

    it("запускает хук Codex: stop при битом конфиге отпускает с сообщением, проект ищется по cwd из нагрузки", async () => {
      await mkdir(path.join(root, ".cyberzavod"));
      await writeFile(path.join(root, PROJECT_CONFIG_FILE), "{ broken");
      codexStdin({ hook_event_name: "Stop" });
      const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const code = await runCli(["hook", "stop", "--agent", "codex"], workspace, NO_LOCALE);

      const [written] = stdout.mock.calls[0] ?? [];

      expect(code).toBe(0);
      expect(String(written)).toContain("The config");
    });

    it("запускает защиту Codex: отказывает на чтении .env", async () => {
      codexStdin({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "cat .env" },
      });
      const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      await runCli(["hook", "guard", "--agent", "codex"], root, NO_LOCALE);

      const [written] = stdout.mock.calls[0] ?? [];

      expect(String(written)).toContain('"permissionDecision":"deny"');
    });

    it("пишет событие Codex в capture/codex/raw", async () => {
      await initialized();
      codexStdin({ hook_event_name: "UserPromptSubmit", prompt: "Сделай цех" });

      await runCli(["hook", "record", "--agent", "codex"], root, NO_LOCALE);

      const raw = path.join(
        root,
        ".cyberzavod/journal/capture/codex/raw",
        `${CODEX_SESSION}.jsonl`,
      );

      expect(await readFile(raw, "utf8")).toContain("Сделай цех");
    });

    it("без флага пишет событие Claude в capture/claude/raw по CLAUDE_PROJECT_DIR", async () => {
      const CLAUDE_SESSION = "cli-test-claude-hook";

      await initialized();
      vi.spyOn(process, "stdin", "get").mockReturnValue(
        stdinWith({
          session_id: CLAUDE_SESSION,
          hook_event_name: "UserPromptSubmit",
          prompt: "Привет",
        }),
      );

      await runCli(["hook", "record"], workspace, { CLAUDE_PROJECT_DIR: root });

      const raw = path.join(
        root,
        ".cyberzavod/journal/capture/claude/raw",
        `${CLAUDE_SESSION}.jsonl`,
      );

      expect(await readFile(raw, "utf8")).toContain("Привет");
    });

    it("без флага хук идёт к Claude, и хука Codex среди его хуков нет", async () => {
      codexStdin({ hook_event_name: "PreToolUse" });

      const code = await runCli(["hook", "guard"], root, NO_LOCALE);

      expect({ code, error: printedError() }).toEqual({
        code: 1,
        error: "cyberzavod hook: no hook named guard",
      });
    });

    it("неизвестный агент — ошибка с перечнем поддерживаемых", async () => {
      const code = await runCli(["hook", "stop", "--agent", "gemini"], root, NO_LOCALE);

      expect({ code, error: printedError() }).toEqual({
        code: 1,
        error:
          "cyberzavod hook: unknown agent gemini in --agent: supported agents are claude, codex",
      });
    });

    it("справка хука называет флаг --agent и хуки обоих агентов", async () => {
      await runCli(["hook", "--help"], root, NO_LOCALE);

      const help = printedLog();

      expect(help).toContain("hook <record|turn-start|stop|guard> [--agent <agent>]");
      expect(help).toContain("--agent <agent>");
    });
  });

  it("справка называет видимые команды по разделам и не называет служебные", async () => {
    await runCli(["--help"], root, NO_LOCALE);

    const lines = printedLog().split("\n");
    const listed = lines
      .filter((line) => line.startsWith("  "))
      .map((line) => line.trim().split(" ")[0]);

    expect(listed).toEqual([
      "init",
      "status",
      "decision",
      "note",
      "view",
      "login",
      "logout",
      "share",
      "unshare",
      "gallery",
      "sync",
      "doctor",
      "disconnect",
    ]);
  });

  it("справка говорит, с чего начать", async () => {
    await runCli(["--help"], root, NO_LOCALE);

    const help = printedLog();

    expect(help).toContain("npx cyberzavod init");
    expect(help).toContain("/setup");
    expect(help).toContain("/feature");
  });

  it.each([
    ["en", NO_LOCALE],
    ["ru", { CYBERZAVOD_LANG: "ru" }],
  ] as const)("общая справка (%s) помещается в экран", async (_language, env) => {
    await runCli(["--help"], root, env);

    const lines = printedLog().split("\n");
    const longestLine = Math.max(...lines.map((line) => line.length));

    expect({ rows: lines.length <= SCREEN_ROWS, columns: longestLine <= SCREEN_COLUMNS }).toEqual({
      rows: true,
      columns: true,
    });
  });

  it.each(COMMAND_NAMES)("%s --help печатает справку команды и не запускает её", async (name) => {
    const stdin = vi.spyOn(process, "stdin", "get");

    const code = await runCli([name, "--help"], root, NO_LOCALE);

    const [firstLine] = printedLog().split("\n");

    expect({ code, firstLine, readsStdin: stdin.mock.calls.length }).toEqual({
      code: 0,
      firstLine: `npx cyberzavod ${CLI_MESSAGES.en.commands[name].usage}`,
      readsStdin: 0,
    });
  });

  it.each(["en", "ru"] as const)(
    "справка каждой команды (%s) укладывается в ширину экрана",
    async (language) => {
      const longestLines: Record<string, number> = {};

      for (const name of COMMAND_NAMES) {
        vi.mocked(console.log).mockClear();
        await runCli([name, "--help"], root, { CYBERZAVOD_LANG: language });

        const lines = printedLog().split("\n");

        longestLines[name] = Math.max(...lines.map((line) => line.length));
      }

      const tooWide = Object.entries(longestLines).filter(([, width]) => width > SCREEN_COLUMNS);

      expect(tooWide).toEqual([]);
    },
  );

  it("-h после аргументов команды тоже печатает справку", async () => {
    const code = await runCli(["decision", "text", "-h"], root, NO_LOCALE);

    expect({ code, started: await exists(path.join(root, ".cyberzavod")) }).toEqual({
      code: 0,
      started: false,
    });
  });

  it("doctor --help называет --run-checks", async () => {
    await runCli(["doctor", "--help"], root, NO_LOCALE);

    expect(printedLog()).toContain("--run-checks");
  });

  describe("doctor", () => {
    // The settings directory is in a temporary folder: tests do not read the real ~/.config.
    function isolatedConfig(): string {
      return path.join(workspace, "config");
    }

    async function healthyEnvironment(checks: string): Promise<Environment> {
      const env: Environment = {
        PATH: process.env.PATH,
        XDG_CONFIG_HOME: isolatedConfig(),
      };
      const credentials = credentialsFile({
        env,
        platform: process.platform,
        homeDirectory: homedir(),
      });

      await runCli(["init", "--yes", "--check", checks], root, env);
      await writeFile(path.join(root, "AGENTS.md"), "# Rules\n");
      await new FileCredentialsStore(credentials).save(SECRET_TOKEN);
      vi.mocked(console.log).mockClear();

      return env;
    }

    it("вне проекта печатает проверки машины, зовёт init и выходит с 1", async () => {
      const code = await runCli(["doctor"], root, {
        PATH: process.env.PATH,
        XDG_CONFIG_HOME: isolatedConfig(),
      });

      expect({
        code,
        init: printedLog().includes("run npx cyberzavod init"),
        problems: printedLog().endsWith("Problems: 1."),
      }).toEqual({
        code: 1,
        init: true,
        problems: true,
      });
    });

    it("в исправном проекте выходит с 0 и не печатает токен", async () => {
      const env = await healthyEnvironment("node --version");

      const code = await runCli(["doctor"], root, env);

      expect({
        code,
        last: printedLog().split("\n").at(-1),
        hasToken: printedLog().includes(SECRET_TOKEN),
      }).toEqual({
        code: 0,
        last: "All good.",
        hasToken: false,
      });
    });

    it("с --run-checks выходит с 1, если команда проверки упала", async () => {
      const env = await healthyEnvironment('node -e "process.exit(3)"');

      const code = await runCli(["doctor", "--run-checks"], root, env);

      expect({ code, problem: printedLog().includes("(exit 3)") }).toEqual({
        code: 1,
        problem: true,
      });
    });

    it("без --run-checks упавшую команду не запускает", async () => {
      const env = await healthyEnvironment('node -e "process.exit(3)"');

      const code = await runCli(["doctor"], root, env);

      expect(code).toBe(0);
    });

    it("печатает по-русски", async () => {
      const code = await runCli(["doctor"], root, {
        PATH: process.env.PATH,
        XDG_CONFIG_HOME: isolatedConfig(),
        CYBERZAVOD_LANG: "ru",
      });

      expect({
        code,
        text: printedLog().includes("Как починить: выполните npx cyberzavod init"),
      }).toEqual({
        code: 1,
        text: true,
      });
    });
  });

  it("view --help называет --no-open и переменную с пакетом цеха", async () => {
    await runCli(["view", "--help"], root, NO_LOCALE);

    const help = printedLog();

    expect(help).toContain("view [--no-open]");
    expect(help).toContain("CYBERZAVOD_VIEWER_PACKAGE");
  });

  it("view вне проекта сообщает, что проект не найден, и не ищет пакет цеха", async () => {
    const code = await runCli(["view", "--no-open"], workspace, NO_LOCALE);

    expect({ code, error: printedError() }).toEqual({
      code: 1,
      error: `cyberzavod view: ${CLI_MESSAGES.en.errors.projectNotFound(workspace)}`,
    });
  });

  it("gallery --help перечисляет флаги доступа", async () => {
    await runCli(["gallery", "--help"], root, NO_LOCALE);

    const help = printedLog();

    expect(help).toContain("--public");
    expect(help).toContain("--private");
  });

  it.each([["sync"], ["sync", "--check"]])(
    "%s на hooks не того вида печатает одну строку и выходит с 1",
    async (...argv) => {
      await initialized();
      await writeFile(path.join(root, ".claude/settings.json"), JSON.stringify({ hooks: [] }));

      const code = await runCli(argv, root, NO_LOCALE);

      expect({ code, error: printedError() }).toEqual({
        code: 1,
        error: "cyberzavod sync: .claude/settings.json cannot be parsed: hooks must be an object",
      });
    },
  );

  it("sync с неизвестным агентом в конфиге выходит с 1 и называет поддерживаемых", async () => {
    await initialized();
    await rewriteAgents({ gemini: { implementation: { provider: "google" } } });

    const code = await runCli(["sync"], root, NO_LOCALE);

    expect({ code, error: printedError() }).toEqual({
      code: 1,
      error: "cyberzavod sync: the agent “gemini” is not supported: available are claude, codex",
    });
  });

  it("sync со смешанными агентами в конфиге выходит с 1 и называет агентов", async () => {
    await initialized();
    await rewriteAgents({
      claude: { implementation: { provider: "anthropic" } },
      gemini: { review: { provider: "google" } },
    });

    const code = await runCli(["sync"], root, NO_LOCALE);

    expect({ code, error: printedError() }).toEqual({
      code: 1,
      error:
        "cyberzavod sync: .cyberzavod/project.json names several agents (claude, gemini): a project is driven by one agent",
    });
  });

  it("--help после -- — аргумент команды, а не запрос справки", async () => {
    const code = await runCli(["note", "--", "--help"], root, NO_LOCALE);

    expect({ code, error: printedError().startsWith("cyberzavod note:") }).toEqual({
      code: 1,
      error: true,
    });
  });

  it("share и unshare без id выходят с ошибкой до обращения в сеть", async () => {
    const codes = await Promise.all([
      runCli(["share"], root, NO_LOCALE),
      runCli(["unshare"], root, NO_LOCALE),
    ]);

    expect(codes).toEqual([1, 1]);
  });

  it("gallery с --public и --private вместе выходит с ошибкой", async () => {
    const code = await runCli(["gallery", "--public", "--private"], root, NO_LOCALE);

    expect(code).toBe(1);
  });

  it("init --yes пишет конфиг, AGENTS.md и тонкий CLAUDE.md", async () => {
    const code = await runCli(["init", "--yes"], root, NO_LOCALE);

    const configText = await readFile(path.join(root, PROJECT_CONFIG_FILE), "utf8");
    const config = parseProjectConfig(JSON.parse(configText));
    const rules = await readFile(path.join(root, "AGENTS.md"), "utf8");
    const entrypoint = await readFile(path.join(root, "CLAUDE.md"), "utf8");

    expect({
      code,
      projectId: config.projectId,
      commands: config.verification.commands,
      rules: rules.includes("`npm run test`"),
      imports: entrypoint.includes("@AGENTS.md"),
    }).toEqual({
      code: 0,
      projectId: "shop",
      commands: ["npm run test"],
      rules: true,
      imports: true,
    });
  });

  it("init кладёт скилл /setup с отметкой генерации, отметкой заглушки и командой /feature", async () => {
    const code = await runCli(["init", "--yes"], root, NO_LOCALE);

    const skill = await readFile(path.join(root, ".claude/skills/setup/SKILL.md"), "utf8");

    expect({
      code,
      generated: skill.includes("Generated by `cyberzavod sync`"),
      manual: skill.includes("disable-model-invocation: true"),
      pinnedSync: skill.includes(`npx cyberzavod@${HARNESS_VERSION} sync`),
      todoMark: skill.includes(RULES_TODO_MARK),
      feature: skill.includes("/feature"),
    }).toEqual({
      code: 0,
      generated: true,
      manual: true,
      pinnedSync: true,
      todoMark: true,
      feature: true,
    });
  });

  it("init пишет файлы без кириллицы", async () => {
    // Without package.json no checks are found, and the starterRules placeholder goes into
    // AGENTS.md.
    await rm(path.join(root, "package.json"));

    const code = await runCli(["init", "--yes"], root, { CYBERZAVOD_LANG: "ru" });

    const files = await filesUnder(root);
    const contents = await Promise.all(
      files.map(async (file) => ({ file, text: await readFile(file, "utf8") })),
    );
    const withCyrillic = contents
      .filter(({ text }) => CYRILLIC.test(text))
      .map(({ file }) => path.relative(root, file));

    expect({ code, hasRules: await exists(path.join(root, "AGENTS.md")), withCyrillic }).toEqual({
      code: 0,
      hasRules: true,
      withCyrillic: [],
    });
  });

  it("init с флагами --id, --check и --journal пишет заданное и не создаёт .gitignore", async () => {
    const code = await runCli(
      [
        "init",
        "--id",
        "lab",
        "--check",
        "make check",
        "--check",
        "make e2e",
        "--journal",
        "../shop.cyberzavod",
      ],
      root,
      NO_LOCALE,
    );

    const configText = await readFile(path.join(root, PROJECT_CONFIG_FILE), "utf8");
    const config = parseProjectConfig(JSON.parse(configText));

    expect({
      code,
      projectId: config.projectId,
      commands: config.verification.commands,
      journal: config.journal,
      gitignore: await exists(path.join(root, ".gitignore")),
    }).toEqual({
      code: 0,
      projectId: "lab",
      commands: ["make check", "make e2e"],
      journal: "../shop.cyberzavod",
      gitignore: false,
    });
  });

  it("init без --yes вне терминала подключает проект без вопроса", async () => {
    const code = await runCli(["init"], root, NO_LOCALE);

    expect({
      code,
      connected: await exists(path.join(root, PROJECT_CONFIG_FILE)),
      asked: printedLog().includes(CLI_MESSAGES.en.init.confirm),
    }).toEqual({ code: 0, connected: true, asked: false });
  });

  it.each([
    ["--id", ["init", "--id", ""]],
    ["--check", ["init", "--check", " "]],
    ["--journal", ["init", "--journal", ""]],
    ["--journal", ["init", "--journal", "/var/journal"]],
  ])("init с неверным %s выходит с кодом 1 и ничего не пишет", async (option, args) => {
    const code = await runCli(args, root, NO_LOCALE);

    expect({
      code,
      error: printedError().startsWith(`cyberzavod init: ${option}`),
      created: await exists(path.join(root, ".cyberzavod")),
    }).toEqual({ code: 1, error: true, created: false });
  });

  it("init --yes в итоге зовёт закоммитить файлы и запустить /setup", async () => {
    await runCli(["init", "--yes"], root, NO_LOCALE);

    const output = printedLog();

    expect(output).toContain("Commit: .cyberzavod/, AGENTS.md, CLAUDE.md, .claude/, .gitignore");
    expect(output).toContain("/setup");
  });

  it("init прячет от git сырые журналы", async () => {
    await runCli(["init", "--yes"], root, NO_LOCALE);

    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");

    expect(gitignore).toBe("/.cyberzavod/journal/capture/\n");
  });

  it("init не кладёт CLI в проект, а хуки зовут его через npx", async () => {
    await runCli(["init", "--yes"], root, NO_LOCALE);

    const settings = await readFile(path.join(root, ".claude/settings.json"), "utf8");

    expect({
      binDirectory: await exists(path.join(root, ".cyberzavod/bin")),
      hooks: settings.includes(`cyberzavod@${HARNESS_VERSION} hook record`),
    }).toEqual({ binDirectory: false, hooks: true });
  });

  it("переносит написанный человеком CLAUDE.md в AGENTS.md", async () => {
    await writeFile(path.join(root, "CLAUDE.md"), "# Мои правила\n");

    await runCli(["init", "--yes"], root, NO_LOCALE);

    const rules = await readFile(path.join(root, "AGENTS.md"), "utf8");

    expect(rules).toBe("# Мои правила\n");
  });

  it("второй init ничего не меняет и говорит, что делать нечего", async () => {
    await initialized();

    const code = await runCli(["init", "--yes"], root, NO_LOCALE);

    expect({ code, output: printedLog() }).toMatchObject({
      code: 0,
      output: expect.stringContaining("Nothing to do.") as string,
    });
  });

  it("второй init в устаревшем проекте зовёт sync и выходит с 1", async () => {
    await initialized();
    await rm(path.join(root, ".claude/agents/coder.md"));

    const code = await runCli(["init", "--yes"], root, NO_LOCALE);

    expect({ code, output: printedLog() }).toMatchObject({
      code: 1,
      output: expect.stringContaining("npx cyberzavod sync") as string,
    });
  });

  it("sync --check после init не находит расхождений, а после правки — находит", async () => {
    await initialized();
    const clean = await runCli(["sync", "--check"], root, NO_LOCALE);

    await writeFile(path.join(root, ".claude/agents/coder.md"), "правка\n");

    const stale = await runCli(["sync", "--check"], root, NO_LOCALE);

    expect([clean, stale]).toEqual([0, 1]);
  });

  it("sync восстанавливает сгенерированные файлы", async () => {
    await initialized();
    await rm(path.join(root, ".claude/agents/coder.md"));

    await runCli(["sync"], root, NO_LOCALE);

    const code = await runCli(["sync", "--check"], root, NO_LOCALE);

    expect(code).toBe(0);
  });

  it("sync --check находит CLI прежних версий", async () => {
    await initialized();
    const legacyFile = path.join(root, ...LEGACY_TOOL_FILE.split("/"));

    await mkdir(path.dirname(legacyFile), { recursive: true });
    await writeFile(legacyFile, "// cyberzavod прежних версий\n");

    const code = await runCli(["sync", "--check"], root, NO_LOCALE);

    expect({ code, reported: printedLog().includes(LEGACY_TOOL_FILE) }).toEqual({
      code: 1,
      reported: true,
    });
  });

  it("sync удаляет CLI прежних версий и пустой каталог bin", async () => {
    await initialized();
    const legacyFile = path.join(root, ...LEGACY_TOOL_FILE.split("/"));

    await mkdir(path.dirname(legacyFile), { recursive: true });
    await writeFile(legacyFile, "// cyberzavod прежних версий\n");

    await runCli(["sync"], root, NO_LOCALE);

    expect({
      binDirectory: await exists(path.dirname(legacyFile)),
      reported: printedLog().includes(LEGACY_TOOL_FILE),
    }).toEqual({ binDirectory: false, reported: true });
  });

  it("sync не трогает каталог bin, если в нём лежит чужой файл", async () => {
    await initialized();
    const legacyFile = path.join(root, ...LEGACY_TOOL_FILE.split("/"));
    const foreignFile = path.join(path.dirname(legacyFile), "other.sh");

    await mkdir(path.dirname(legacyFile), { recursive: true });
    await writeFile(legacyFile, "// cyberzavod прежних версий\n");
    await writeFile(foreignFile, "echo\n");

    await runCli(["sync"], root, NO_LOCALE);

    expect({ legacy: await exists(legacyFile), foreign: await exists(foreignFile) }).toEqual({
      legacy: false,
      foreign: true,
    });
  });

  it("sync поднимает версию в конфиге и хуках", async () => {
    await initialized();
    const configFile = path.join(root, PROJECT_CONFIG_FILE);
    const settingsFile = path.join(root, ".claude/settings.json");
    const config = JSON.parse(await readFile(configFile, "utf8")) as object;
    const settings = await readFile(settingsFile, "utf8");

    await writeFile(configFile, JSON.stringify({ ...config, harness: "0.7.1" }));
    await writeFile(
      settingsFile,
      settings.replaceAll(`cyberzavod@${HARNESS_VERSION}`, "cyberzavod@0.7.1"),
    );

    await runCli(["sync"], root, NO_LOCALE);

    const synced = parseProjectConfig(JSON.parse(await readFile(configFile, "utf8")));
    const syncedSettings = await readFile(settingsFile, "utf8");

    expect({
      harness: synced.harness,
      hooks: syncedSettings.includes(`cyberzavod@${HARNESS_VERSION} hook record`),
      stale: syncedSettings.includes("cyberzavod@0.7.1"),
    }).toEqual({ harness: HARNESS_VERSION, hooks: true, stale: false });
  });

  it("decision и note пишут записи в журнал проекта", async () => {
    await initialized();

    const codes = [
      await runCli(
        ["decision", "Храним", "журнал", "рядом", "--why", "Чистый репозиторий"],
        root,
        NO_LOCALE,
      ),
      await runCli(["note", "Первая заметка"], root, NO_LOCALE),
    ];

    const decisions = await journalFiles("decisions");
    const notes = await journalFiles("notes");

    expect({ codes, decisions: decisions.length, notes: notes.length }).toEqual({
      codes: [0, 0],
      decisions: 1,
      notes: 1,
    });
  });

  it("decision без текста выходит с ошибкой", async () => {
    await initialized();

    const code = await runCli(["decision"], root, NO_LOCALE);

    expect(code).toBe(1);
  });

  it("команды проекта вне проекта выходят с ошибкой", async () => {
    const codes = await Promise.all(
      ["status", "note", "sync"].map((name) => runCli([name, "x"], root, NO_LOCALE)),
    );

    expect(codes).toEqual([1, 1, 1]);
  });

  it("неизвестный флаг — ошибка, а не падение", async () => {
    const code = await runCli(["sync", "--nope"], root, NO_LOCALE);

    expect(code).toBe(1);
  });

  it("status описывает подключённый проект", async () => {
    await initialized();

    const code = await runCli(["status"], root, NO_LOCALE);

    expect(code).toBe(0);
  });

  it("status --json печатает стабильный документ без цветов", async () => {
    await initialized();
    vi.mocked(console.log).mockClear();

    const code = await runCli(["status", "--json"], root, NO_LOCALE);

    const document = JSON.parse(printedLog()) as Record<string, unknown>;

    expect({ code, keys: Object.keys(document) }).toEqual({
      code: 0,
      keys: [
        "schemaVersion",
        "command",
        "status",
        "project",
        "harness",
        "workflow",
        "checks",
        "journal",
      ],
    });
  });

  it("sync --check --json после init говорит current и выходит с 0", async () => {
    await initialized();
    vi.mocked(console.log).mockClear();

    const code = await runCli(["sync", "--check", "--json"], root, NO_LOCALE);

    const document = JSON.parse(printedLog()) as { status: string; files: object };

    expect({ code, status: document.status, files: document.files }).toEqual({
      code: 0,
      status: "current",
      files: { added: [], updated: [], removed: [], conflicts: [], edited: [] },
    });
  });

  it("sync --diff показывает, что изменится, ничего не меняет и выходит с 0", async () => {
    await initialized();
    await rm(path.join(root, ".claude/agents/coder.md"));
    vi.mocked(console.log).mockClear();

    const code = await runCli(["sync", "--diff"], root, NO_LOCALE);

    expect({
      code,
      listed: printedLog().includes("Will add:\n  .claude/agents/coder.md"),
      restored: await exists(path.join(root, ".claude/agents/coder.md")),
    }).toEqual({ code: 0, listed: true, restored: false });
  });

  it("sync не трогает сгенерированный файл, исправленный руками, и не меняет конфиг", async () => {
    await initialized();
    const coder = path.join(root, ".claude/agents/coder.md");

    await writeFile(coder, `${await readFile(coder, "utf8")}\nmine\n`);
    const config = await readFile(path.join(root, PROJECT_CONFIG_FILE), "utf8");

    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ dependencies: { vue: "3" } }),
    );

    const code = await runCli(["sync"], root, NO_LOCALE);

    expect({
      code,
      coder: (await readFile(coder, "utf8")).endsWith("mine\n"),
      config: await readFile(path.join(root, PROJECT_CONFIG_FILE), "utf8"),
    }).toEqual({ code: 1, coder: true, config });
  });

  it("init при файле человека на месте CLAUDE.md ничего не пишет и говорит, как починить", async () => {
    await writeFile(path.join(root, "AGENTS.md"), "# Rules\n");
    await writeFile(path.join(root, "CLAUDE.md"), "# Mine\n");

    const code = await runCli(["init", "--yes"], root, NO_LOCALE);

    expect({
      code,
      config: await exists(path.join(root, PROJECT_CONFIG_FILE)),
      gitignore: await exists(path.join(root, ".gitignore")),
      error: printedError(),
    }).toMatchObject({
      code: 1,
      config: false,
      gitignore: false,
      error: expect.stringContaining("Nothing was changed.") as string,
    });
  });

  it("disconnect --yes убирает Cyberzavod и оставляет код, AGENTS.md и журнал", async () => {
    await initialized();
    await runCli(["note", "keep me"], root, NO_LOCALE);

    const code = await runCli(["disconnect", "--yes"], root, NO_LOCALE);

    expect({
      code,
      config: await exists(path.join(root, PROJECT_CONFIG_FILE)),
      claudeMd: await exists(path.join(root, "CLAUDE.md")),
      claude: await exists(path.join(root, ".claude")),
      rules: await exists(path.join(root, "AGENTS.md")),
      packageJson: await exists(path.join(root, "package.json")),
      notes: (await journalFiles("notes")).length,
    }).toEqual({
      code: 0,
      config: false,
      claudeMd: false,
      claude: false,
      rules: true,
      packageJson: true,
      notes: 1,
    });
  });

  it("disconnect без терминала и без --yes показывает план и ничего не меняет", async () => {
    await initialized();
    vi.mocked(console.log).mockClear();

    const code = await runCli(["disconnect"], root, NO_LOCALE);

    expect({
      code,
      config: await exists(path.join(root, PROJECT_CONFIG_FILE)),
      plan: printedLog().includes("Cyberzavod will remove:"),
    }).toEqual({ code: 1, config: true, plan: true });
  });

  it("битый package.json — понятная ошибка: ничего не изменено", async () => {
    await writeFile(path.join(root, "package.json"), "{ not json");

    const code = await runCli(["init", "--yes"], root, NO_LOCALE);

    expect({ code, error: printedError() }).toMatchObject({
      code: 1,
      error: expect.stringContaining("package.json is not valid JSON") as string,
    });
  });

  it("неожиданная ошибка — сообщение без трассы стека и подсказка, как её увидеть", async () => {
    await writeFile(path.join(root, ".claude"), "a file where a directory goes");

    const code = await runCli(["init", "--yes"], root, NO_LOCALE);

    expect({ code, error: printedError() }).toMatchObject({
      code: 1,
      error: expect.stringMatching(/unexpected error[^]*CYBERZAVOD_DEBUG=1/) as string,
    });
    expect(printedError()).not.toMatch(/\n\s+at /);
  });
});
