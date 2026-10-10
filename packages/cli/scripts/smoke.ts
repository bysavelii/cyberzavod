// Smoke check of the real npm package: `npm pack`, installing the archive into a temporary
// directory, and the human's path in a clean project: init, status, doctor, sync --check, repeated
// init, the capture hook, a decision in the journal, disconnect. After disconnect the human's code
// and files are in place, Cyberzavod files are removed, the journal stays. The path runs twice, for
// each agent the package supports: Claude Code, and Codex, which adds the trust in the human's
// Codex config, a session that starts in a subdirectory and the `.env` guard. Runs on Linux, macOS
// and Windows: Node API only, no shell, except the npm call, which on Windows is `npm.cmd`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PACKAGE = path.resolve(import.meta.dirname, "..");
const IS_WINDOWS = process.platform === "win32";
// A space in the project path catches commands that join a path into a string without quotes.
const PROJECT_NAME = "smoke project";
const CODEX_PROJECT_NAME = "smoke codex project";
const PUBLISHED_FILES = [
  "LICENSE",
  "README.md",
  "dist/THIRD_PARTY_LICENSES",
  "dist/cyberzavod.mjs",
  "package.json",
];
const SESSION_ID = "smoke-session";
// Colors and other terminal control sequences start with this character.
const ESCAPE = "\u001b";
const SUCCESS = 0;
const FAILURE = 1;

const SOURCE_FILES: Readonly<Record<string, string>> = {
  "package.json": `${JSON.stringify(
    { name: "smoke-project", private: true, scripts: { test: "node --test" } },
    null,
    2,
  )}\n`,
  "src/index.js": 'export const greeting = "hello";\n',
  "README.md": "# Smoke project\n\nA file the human wrote.\n",
};
const USER_GITIGNORE = "node_modules/\n";
const CAPTURE_IGNORE_ENTRY = "/.cyberzavod/journal/capture/";
const USER_SETTINGS = {
  permissions: { allow: ["Bash(npm test)"] },
  hooks: {
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo user-hook" }] }],
  },
};
const GENERATED_PATHS = [
  "CLAUDE.md",
  ".claude/agents",
  ".claude/skills",
  ".cyberzavod/project.json",
  ".cyberzavod/generated.json",
];

interface PackedPackage {
  filename: string;
  version: string;
  size: number;
  unpackedSize: number;
  files: { path: string }[];
}

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

interface Workspace {
  tool: string;
  project: string;
  cli: string;
  /** Environment of every command in the project, for example the Codex home of the run. */
  env: Readonly<Record<string, string>>;
}

function step(title: string): void {
  console.log(`✓ ${title}`);
}

// On Windows npm is the batch file `npm.cmd`, which only a shell can run. The npm arguments here
// are paths without spaces and flags, so letting the shell join them is safe.
function npm(args: readonly string[], cwd: string): string {
  const result = spawnSync("npm", args, { cwd, encoding: "utf8", shell: IS_WINDOWS });

  assert.equal(result.status, SUCCESS, `npm ${args.join(" ")}:\n${result.stderr}`);

  return result.stdout;
}

// INIT_CWD is set by pnpm, which runs this script: the CLI would take it for the project directory.
function childEnvironment(extra: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...extra, CYBERZAVOD_LANG: "en" };

  delete environment.INIT_CWD;

  return environment;
}

function cyberzavod(
  workspace: Workspace,
  args: readonly string[],
  options: { input?: string; env?: Readonly<Record<string, string>> } = {},
): Run {
  const result = spawnSync(process.execPath, [workspace.cli, ...args], {
    cwd: workspace.project,
    encoding: "utf8",
    input: options.input,
    env: childEnvironment({ ...workspace.env, ...options.env }),
  });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function expectExit(run: Run, status: number, command: string): void {
  assert.equal(run.status, status, `${command}:\n${run.stdout}\n${run.stderr}`);
}

function jsonOf(run: Run, command: string): Record<string, unknown> {
  assert.ok(!run.stdout.includes(ESCAPE), `${command}: terminal control characters in JSON`);

  return JSON.parse(run.stdout) as Record<string, unknown>;
}

// npm may print build script output before the JSON: the document starts at the first `[`.
function packPackage(destination: string): PackedPackage {
  const output = npm(["pack", "--json", "--pack-destination", destination], PACKAGE);
  const [packed] = JSON.parse(output.slice(output.indexOf("["))) as PackedPackage[];

  assert.ok(packed, "npm pack returned no archive");

  const packedFiles = packed.files.map((file) => file.path).sort();

  assert.deepEqual(packedFiles, PUBLISHED_FILES, "archive has extra or missing files");
  console.log(
    `  ${packed.filename}: ${packed.size} B packed, ${packed.unpackedSize} B unpacked, ` +
      `${packedFiles.length} files`,
  );

  return packed;
}

async function installPackage(tool: string, packed: PackedPackage): Promise<string> {
  npm(["install", "--no-audit", "--no-fund", `./${packed.filename}`], tool);

  const installed = path.join(tool, "node_modules", "cyberzavod");
  const manifest = JSON.parse(await readFile(path.join(installed, "package.json"), "utf8")) as {
    bin: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  const binName = IS_WINDOWS ? "cyberzavod.cmd" : "cyberzavod";
  const entry = manifest.bin.cyberzavod;

  assert.equal(manifest.dependencies, undefined, "package must have no dependencies");
  assert.ok(entry, "package.json has no cyberzavod bin");
  assert.ok(
    existsSync(path.join(tool, "node_modules", ".bin", binName)),
    "npm did not create the bin",
  );

  return path.join(installed, entry);
}

async function writeFiles(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [file, text] of Object.entries(files)) {
    const target = path.join(root, file);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  }
}

async function createProject(
  project: string,
  agentFiles: Readonly<Record<string, string>>,
): Promise<void> {
  await writeFiles(project, { ...SOURCE_FILES, ".gitignore": USER_GITIGNORE, ...agentFiles });

  const git = spawnSync("git", ["init", "-q"], { cwd: project, encoding: "utf8" });

  assert.equal(git.status, SUCCESS, `git init:\n${git.stderr}`);
}

async function readText(root: string, file: string): Promise<string> {
  return readFile(path.join(root, file), "utf8");
}

function countLines(text: string, line: string): number {
  return text.split(/\r?\n/).filter((candidate) => candidate === line).length;
}

function checkVersion(workspace: Workspace, packed: PackedPackage): void {
  const run = cyberzavod(workspace, ["--version"]);

  expectExit(run, SUCCESS, "--version");
  assert.equal(run.stdout.trim(), packed.version, "--version does not match the package version");
  step(`--version: ${packed.version}`);
}

async function checkInit(workspace: Workspace): Promise<void> {
  const run = cyberzavod(workspace, ["init", "--yes"]);

  expectExit(run, SUCCESS, "init --yes");

  for (const file of [...GENERATED_PATHS, "AGENTS.md"]) {
    assert.ok(existsSync(path.join(workspace.project, file)), `init did not create ${file}`);
  }

  const settings = await readText(workspace.project, ".claude/settings.json");

  assert.match(settings, /echo user-hook/, "init lost the user's hook");
  assert.match(
    settings,
    /cyberzavod@\d+\.\d+\.\d+ hook stop/,
    "init did not install the stop hook",
  );
  step("init --yes");
}

function checkStatus(workspace: Workspace): void {
  expectExit(cyberzavod(workspace, ["status"]), SUCCESS, "status");

  const run = cyberzavod(workspace, ["status", "--json"]);

  expectExit(run, SUCCESS, "status --json");

  const status = jsonOf(run, "status --json");

  assert.equal(status.schemaVersion, 1);
  assert.equal(status.command, "status");
  assert.equal(status.status, "connected");
  step("status, status --json");
}

// The doctor exit code is not checked here: the AGENTS.md starter waits for the setup skill, and the
// CI machine has no agent. What matters is that the checks named here pass and the JSON parses.
function checkDoctor(workspace: Workspace, ids: readonly string[]): void {
  const run = cyberzavod(workspace, ["doctor", "--json"]);
  const doctor = jsonOf(run, "doctor --json");
  const checks = doctor.checks as { id: string; status: string }[];
  const statusOf = (id: string) => checks.find((check) => check.id === id)?.status;

  assert.equal(doctor.schemaVersion, 1);

  for (const id of ids) {
    assert.equal(statusOf(id), "passed", `doctor: check ${id}\n${run.stdout}`);
  }

  step("doctor --json");
}

function checkSync(workspace: Workspace): void {
  expectExit(cyberzavod(workspace, ["sync", "--check"]), SUCCESS, "sync --check");

  const run = cyberzavod(workspace, ["sync", "--check", "--json"]);

  expectExit(run, SUCCESS, "sync --check --json");
  assert.equal(jsonOf(run, "sync --check --json").status, "current");
  step("sync --check, sync --check --json");
}

async function checkRepeatedInit(workspace: Workspace, files: readonly string[]): Promise<void> {
  const filesBefore = await snapshot(workspace.project, files);
  const run = cyberzavod(workspace, ["init", "--yes"]);

  expectExit(run, SUCCESS, "repeated init");
  assert.match(run.stdout, /Nothing to do/);

  const gitignore = await readText(workspace.project, ".gitignore");

  assert.deepEqual(
    await snapshot(workspace.project, files),
    filesBefore,
    "repeated init changed the files",
  );
  assert.equal(countLines(gitignore, CAPTURE_IGNORE_ENTRY), 1, "duplicate .gitignore line");
  step("repeated init changes nothing");
}

function checkJournal(workspace: Workspace): void {
  const payload = JSON.stringify({
    session_id: SESSION_ID,
    hook_event_name: "UserPromptSubmit",
    prompt: "Add dark mode",
  });
  const hook = cyberzavod(workspace, ["hook", "record"], {
    input: payload,
    env: { CLAUDE_PROJECT_DIR: workspace.project },
  });
  const rawLog = path.join(
    workspace.project,
    ".cyberzavod/journal/capture/claude/raw",
    `${SESSION_ID}.jsonl`,
  );

  expectExit(hook, SUCCESS, "hook record");
  assert.ok(existsSync(rawLog), "capture hook did not create the raw log");
  expectExit(cyberzavod(workspace, ["decision", "Smoke decision"]), SUCCESS, "decision");
  step("hook record, decision");
}

async function snapshot(root: string, files: readonly string[]): Promise<string[]> {
  return Promise.all(files.map((file) => readText(root, file)));
}

async function checkDisconnect(workspace: Workspace): Promise<void> {
  const { project } = workspace;
  const keptFiles = [...Object.keys(SOURCE_FILES), "AGENTS.md"];
  const before = await snapshot(project, keptFiles);

  expectExit(cyberzavod(workspace, ["disconnect"]), FAILURE, "disconnect without a terminal");
  assert.ok(
    existsSync(path.join(project, ".cyberzavod/project.json")),
    "refusal still deleted files",
  );
  expectExit(cyberzavod(workspace, ["disconnect", "--yes"]), SUCCESS, "disconnect --yes");

  for (const file of GENERATED_PATHS) {
    assert.ok(!existsSync(path.join(project, file)), `disconnect left ${file}`);
  }

  const settings = JSON.parse(await readText(project, ".claude/settings.json")) as unknown;
  const decisions = await readdir(path.join(project, ".cyberzavod/journal/decisions"));
  const gitignore = await readText(project, ".gitignore");

  assert.deepEqual(
    await snapshot(project, keptFiles),
    before,
    "disconnect changed the user's files",
  );
  assert.deepEqual(settings, USER_SETTINGS, "disconnect did not restore the user's settings");
  assert.equal(decisions.length, 1, "disconnect touched the journal");
  assert.ok(gitignore.startsWith(USER_GITIGNORE), "disconnect changed the user's .gitignore");
  expectExit(cyberzavod(workspace, ["status"]), FAILURE, "status after disconnect");
  step("disconnect: the user's code, AGENTS.md, journal and settings are intact");
}

async function claudePath(tool: string, root: string, cli: string): Promise<void> {
  const project = path.join(root, PROJECT_NAME);
  const workspace: Workspace = { tool, project, cli, env: {} };

  await createProject(project, {
    ".claude/settings.json": `${JSON.stringify(USER_SETTINGS, null, 2)}\n`,
  });
  console.log("Claude Code");
  await checkInit(workspace);
  checkStatus(workspace);
  checkDoctor(workspace, ["node", "config", "hooks", "files", "gitignore"]);
  checkSync(workspace);
  await checkRepeatedInit(workspace, [".claude/settings.json"]);
  checkJournal(workspace);
  await checkDisconnect(workspace);
}

// The human's Codex config and hooks before Cyberzavod: init and disconnect must leave these lines
// as they were.
const USER_CODEX_CONFIG = [
  "# The human's own Codex config",
  'model = "x"',
  "",
  '[projects."/other"]',
  'trust_level = "trusted"',
  "",
].join("\n");
const USER_CODEX_HOOKS = {
  hooks: { Stop: [{ hooks: [{ type: "command", command: "echo user-hook" }] }] },
};
// Marks the project trust that Cyberzavod added to the human's Codex config.
const TRUST_MARK = "# added by cyberzavod";
const CODEX_SESSION_ID = "smoke-codex-session";
const CODEX_SUBDIRECTORY = "src";
const CODEX_GENERATED_PATHS = [
  ".codex/config.toml",
  ".codex/agents",
  ".agents/skills",
  ".cyberzavod/project.json",
  ".cyberzavod/generated.json",
];
const CODEX_FILES_OF_OTHER_AGENT = ["CLAUDE.md", ".claude"];
const CODEX_HOOKS_FILE = ".codex/hooks.json";
const CODEX_RAW_DIRECTORY = ".cyberzavod/journal/capture/codex/raw";

// Every command of the Codex path sees its own Codex home and no config of the machine's human.
function codexEnvironment(root: string): Readonly<Record<string, string>> {
  return {
    CODEX_HOME: path.join(root, "codex-home"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    APPDATA: path.join(root, "config"),
  };
}

async function createCodexProject(workspace: Workspace): Promise<void> {
  await createProject(workspace.project, {
    [CODEX_HOOKS_FILE]: `${JSON.stringify(USER_CODEX_HOOKS, null, 2)}\n`,
  });
  await writeFiles(codexHomeOf(workspace), { "config.toml": USER_CODEX_CONFIG });
}

function codexHomeOf(workspace: Workspace): string {
  const home = workspace.env.CODEX_HOME;

  assert.ok(home, "the Codex path has no Codex home");

  return home;
}

function codexConfigOf(workspace: Workspace): Promise<string> {
  return readText(codexHomeOf(workspace), "config.toml");
}

async function checkCodexInit(workspace: Workspace): Promise<void> {
  const run = cyberzavod(workspace, ["init", "--yes", "--agent", "codex"]);

  expectExit(run, SUCCESS, "init --yes --agent codex");

  for (const file of [...CODEX_GENERATED_PATHS, "AGENTS.md"]) {
    assert.ok(existsSync(path.join(workspace.project, file)), `init did not create ${file}`);
  }

  for (const file of CODEX_FILES_OF_OTHER_AGENT) {
    assert.ok(!existsSync(path.join(workspace.project, file)), `init created ${file}`);
  }

  const hooks = await readText(workspace.project, CODEX_HOOKS_FILE);
  const config = await codexConfigOf(workspace);
  const ownHandlers = hooks.split(/cyberzavod@\d+\.\d+\.\d+ hook /).length - 1;

  assert.match(hooks, /echo user-hook/, "init lost the user's hook");
  assert.match(
    hooks,
    /cyberzavod@\d+\.\d+\.\d+ hook stop --agent codex/,
    "init did not install the stop hook",
  );
  assert.match(hooks, /git rev-parse --show-toplevel/, "hooks do not look for the project root");
  assert.ok(config.startsWith(USER_CODEX_CONFIG), "init changed the user's Codex config");
  assert.equal(config.split(TRUST_MARK).length - 1, 1, "init did not trust the project once");
  assert.equal(
    config.split("[hooks.state.").length - 1,
    ownHandlers,
    "init did not trust every hook of its own",
  );
  step("init --yes --agent codex: files, hooks and trust in the Codex config");
}

// A session of Codex may start in any directory of the project; the hook gets it as `cwd`.
function checkCodexHooks(workspace: Workspace): void {
  const { project } = workspace;
  const record = (sessionId: string, cwd: string) =>
    cyberzavod(workspace, ["hook", "record", "--agent", "codex"], {
      input: JSON.stringify({
        session_id: sessionId,
        hook_event_name: "UserPromptSubmit",
        prompt: "Add dark mode",
        cwd,
      }),
    });
  const subdirectory = path.join(project, CODEX_SUBDIRECTORY);
  const inRoot = record(CODEX_SESSION_ID, project);
  const inSubdirectory = record(`${CODEX_SESSION_ID}-sub`, subdirectory);

  expectExit(inRoot, SUCCESS, "hook record in the project directory");
  expectExit(inSubdirectory, SUCCESS, "hook record in a subdirectory");

  for (const sessionId of [CODEX_SESSION_ID, `${CODEX_SESSION_ID}-sub`]) {
    const rawLog = path.join(project, CODEX_RAW_DIRECTORY, `${sessionId}.jsonl`);

    assert.ok(existsSync(rawLog), `capture hook did not create the raw log of ${sessionId}`);
  }

  assert.ok(
    !existsSync(path.join(subdirectory, ".cyberzavod")),
    "a session in a subdirectory put the journal there",
  );
  step("hook record --agent codex: from the project and from a subdirectory");
}

function checkCodexGuard(workspace: Workspace): void {
  const subdirectory = path.join(workspace.project, CODEX_SUBDIRECTORY);

  for (const cwd of [workspace.project, subdirectory]) {
    const guard = cyberzavod(workspace, ["hook", "guard", "--agent", "codex"], {
      input: JSON.stringify({
        session_id: CODEX_SESSION_ID,
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "cat .env" },
        cwd,
      }),
    });

    expectExit(guard, SUCCESS, `hook guard in ${path.relative(workspace.project, cwd) || "."}`);
    assert.match(guard.stdout, /"permissionDecision":\s*"deny"/, "guard let `cat .env` through");
  }

  step("hook guard --agent codex denies cat .env: from the project and from a subdirectory");
}

async function checkCodexRepeatedInit(workspace: Workspace): Promise<void> {
  const files = [CODEX_HOOKS_FILE, ".codex/config.toml"];
  const before = [...(await snapshot(workspace.project, files)), await codexConfigOf(workspace)];
  const run = cyberzavod(workspace, ["init", "--yes"]);
  const after = [...(await snapshot(workspace.project, files)), await codexConfigOf(workspace)];

  expectExit(run, SUCCESS, "repeated init");
  assert.match(run.stdout, /Nothing to do/);
  assert.deepEqual(after, before, "repeated init changed the files");
  step("repeated init changes nothing");
}

async function checkCodexDisconnect(workspace: Workspace, configAfterInit: string): Promise<void> {
  const { project } = workspace;
  const keptFiles = [...Object.keys(SOURCE_FILES), "AGENTS.md"];
  const before = await snapshot(project, keptFiles);

  expectExit(cyberzavod(workspace, ["disconnect"]), FAILURE, "disconnect without a terminal");
  assert.equal(await codexConfigOf(workspace), configAfterInit, "refusal changed the Codex config");
  expectExit(cyberzavod(workspace, ["disconnect", "--yes"]), SUCCESS, "disconnect --yes");

  for (const file of CODEX_GENERATED_PATHS) {
    assert.ok(!existsSync(path.join(project, file)), `disconnect left ${file}`);
  }

  const hooks = JSON.parse(await readText(project, CODEX_HOOKS_FILE)) as unknown;
  const rawLogs = await readdir(path.join(project, CODEX_RAW_DIRECTORY));

  assert.deepEqual(
    await snapshot(project, keptFiles),
    before,
    "disconnect changed the user's files",
  );
  assert.deepEqual(hooks, USER_CODEX_HOOKS, "disconnect did not leave only the user's hooks");
  assert.equal(
    await codexConfigOf(workspace),
    USER_CODEX_CONFIG,
    "disconnect did not return the Codex config to its first state",
  );
  assert.equal(rawLogs.length, 2, "disconnect touched the journal");
  step("disconnect: the user's code, hooks and Codex config are as before init");
}

async function codexPath(tool: string, root: string, cli: string): Promise<void> {
  const codexRoot = path.join(root, "codex-path");
  const project = path.join(codexRoot, CODEX_PROJECT_NAME);
  const workspace: Workspace = { tool, project, cli, env: codexEnvironment(codexRoot) };

  await createCodexProject(workspace);
  console.log("Codex");
  await checkCodexInit(workspace);
  checkStatus(workspace);
  checkDoctor(workspace, ["node", "config", "hooks", "trust", "files", "gitignore"]);
  checkSync(workspace);
  await checkCodexRepeatedInit(workspace);
  checkCodexHooks(workspace);
  checkCodexGuard(workspace);
  await checkCodexDisconnect(workspace, await codexConfigOf(workspace));
}

async function main(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "cyberzavod-smoke-"));
  const tool = path.join(root, "tool");

  try {
    await mkdir(tool);

    const packed = packPackage(tool);
    const cli = await installPackage(tool, packed);

    step(`npm pack and install ${packed.filename}`);
    checkVersion({ tool, project: root, cli, env: {} }, packed);
    await claudePath(tool, root, cli);
    await codexPath(tool, root, cli);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await main();
