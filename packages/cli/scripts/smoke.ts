// Smoke check of the real npm package: `npm pack`, installing the archive into a temporary
// directory, and the human's path in a clean project: init, status, doctor, sync --check, repeated
// init, the capture hook, a decision in the journal, disconnect. After disconnect the human's code
// and files are in place, Cyberzavod files are removed, the journal stays. The path runs twice, for
// each agent the package supports: Claude Code, and Codex, which adds the trust in the human's
// Codex config, a session that starts in a subdirectory and the `.env` guard. The Claude Code path
// also runs `view` against the packed viewer package and checks the archive sizes. Runs on Linux,
// macOS and Windows: Node API only, no shell, except the npm call, which on Windows is `npm.cmd`.

import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import os from "node:os";
import path from "node:path";

const PACKAGE = path.resolve(import.meta.dirname, "..");
const VIEWER_PACKAGE = path.resolve(PACKAGE, "../viewer");
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
// Anything that makes the CLI archive grow by a library (the factory floor, Pixi) breaks this.
const CLI_UNPACKED_BUDGET_BYTES = 600_000;
const VIEWER_PUBLISHED_FILES = [
  "LICENSE",
  "README.md",
  "bin/cyberzavod-viewer.mjs",
  "dist/THIRD_PARTY_LICENSES",
  "dist/index.html",
  "package.json",
];
const VIEWER_ASSETS_PREFIX = "dist/assets/";
const SESSION_ID = "smoke-session";
const VIEW_RECORDING_ID = "smoke-view";
const VIEW_DRAFT_ID = "smoke-draft";
const VIEW_START_TIMEOUT_MS = 120_000;
const VIEW_STOP_TIMEOUT_MS = 20_000;
const FACTORY_FLOOR_LINE = /factory floor: (http:\/\/127\.0\.0\.1:\d+\/\?lang=en)/;
const NOT_FOUND = 404;
const FORBIDDEN = 403;
const OK = 200;
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

// npm prints the output of `prepack` before the JSON, and colored build logs contain `[` too:
// the document starts at the first line that is exactly `[`.
const PACK_JSON_START = /^\[$/m;

function packDirectory(directory: string, destination: string): PackedPackage {
  const output = npm(["pack", "--json", "--pack-destination", destination], directory);
  const jsonStart = output.search(PACK_JSON_START);

  assert.ok(jsonStart >= 0, `npm pack printed no JSON for ${directory}:\n${output}`);

  const [packed] = JSON.parse(output.slice(jsonStart)) as PackedPackage[];

  assert.ok(packed, `npm pack returned no archive for ${directory}`);
  console.log(
    `  ${packed.filename}: ${packed.size} B packed, ${packed.unpackedSize} B unpacked, ` +
      `${packed.files.length} files`,
  );

  return packed;
}

function packedPathsOf(packed: PackedPackage): string[] {
  return packed.files.map((file) => file.path).sort();
}

function packCli(destination: string): PackedPackage {
  const packed = packDirectory(PACKAGE, destination);

  assert.deepEqual(packedPathsOf(packed), PUBLISHED_FILES, "archive has extra or missing files");
  assert.ok(
    packed.unpackedSize <= CLI_UNPACKED_BUDGET_BYTES,
    `the CLI grew to ${packed.unpackedSize} B unpacked, over the ${CLI_UNPACKED_BUDGET_BYTES} B limit`,
  );

  return packed;
}

async function packViewer(destination: string): Promise<PackedPackage> {
  const packed = packDirectory(VIEWER_PACKAGE, destination);
  const paths = packedPathsOf(packed);
  const assets = paths.filter((file) => file.startsWith(VIEWER_ASSETS_PREFIX));
  const others = paths.filter((file) => !file.startsWith(VIEWER_ASSETS_PREFIX));
  // `dependencies` is checked in the source manifest: `npm pack` copies it as it is.
  const manifest = JSON.parse(
    await readFile(path.join(VIEWER_PACKAGE, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
  };

  assert.deepEqual(others, VIEWER_PUBLISHED_FILES, "viewer archive has extra or missing files");
  assert.ok(assets.length > 0, "viewer archive has no dist/assets");
  assert.equal(manifest.dependencies, undefined, "the viewer package must have no dependencies");

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

  assert.equal(status.schemaVersion, 2);
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

  assert.equal(doctor.schemaVersion, 2);

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

const JOURNAL = ".cyberzavod/journal";
const VIEW_SESSION_FILE = `${JOURNAL}/sessions/${VIEW_RECORDING_ID}.json`;
const VIEW_DRAFT_FILE = `${JOURNAL}/capture/claude/drafts/${VIEW_DRAFT_ID}.json`;
const VIEW_FILES: Readonly<Record<string, string>> = {
  [VIEW_SESSION_FILE]: JSON.stringify({
    version: 1,
    type: "session",
    id: VIEW_RECORDING_ID,
    timestamp: "2026-10-07T10:00:00.000Z",
    projectId: "smoke-project",
    source: { type: "agent", provider: "anthropic", agent: "claude" },
    data: {
      title: "Smoke recording",
      language: "en",
      workflow: "default",
      harness: "0.1.0",
      events: [
        { t: 0, type: "build_start" },
        { t: 10, type: "build_end", ok: true },
      ],
    },
  }),
  // A draft the editor has not touched: the prompt has no clean text yet.
  [VIEW_DRAFT_FILE]: JSON.stringify({
    id: VIEW_DRAFT_ID,
    startedAt: "2026-10-08T10:00:00.000Z",
    builds: [
      {
        id: VIEW_DRAFT_ID,
        project: "",
        harness: "",
        workflow: "",
        title: "",
        language: "",
        runs: ["run-1"],
      },
    ],
    events: [
      {
        t: 0,
        type: "draft_prompt",
        said: "Add dark mode\nwith a toggle",
        goal: "",
        requirements: [],
      },
      { t: 1_000, type: "stage_enter", stage: "planning", run: "run-1" },
      { t: 1_000, type: "draft_run", run: "run-1", agent: "analyst", until: 5_000 },
      { t: 6_000, type: "build_end", ok: true },
    ],
  }),
};

interface HttpReply {
  status: number | undefined;
  type: string | undefined;
  body: string;
}

// The request goes out as written: `fetch` would normalize `..` and encoded dots in the path, and
// would not let a test choose the Host header.
function httpGet(base: string, options: { path: string; host?: string }): Promise<HttpReply> {
  const { hostname, port } = new URL(base);
  const headers = options.host === undefined ? {} : { Host: options.host };

  return new Promise((resolve, reject) => {
    const outgoing = request({ hostname, port, path: options.path, headers }, (incoming) => {
      const chunks: Buffer[] = [];

      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () =>
        resolve({
          status: incoming.statusCode,
          type: incoming.headers["content-type"],
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });

    outgoing.on("error", reject);
    outgoing.end();
  });
}

// Everything the project holds, by path. `.git` is left out: it is not the human's code and git
// may touch its index on its own.
async function projectFiles(project: string): Promise<Record<string, string>> {
  const entries = await readdir(project, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const texts = await Promise.all(
    files.map(async (entry) => {
      const file = path.join(entry.parentPath, entry.name);

      return [path.relative(project, file), await readFile(file, "utf8")] as const;
    }),
  );
  const ownFiles = texts.filter(([file]) => file.split(path.sep)[0] !== ".git");

  return Object.fromEntries(ownFiles);
}

interface RunningFloor {
  url: string;
  /** Stops the process the way the human does; resolves to its exit code. */
  stop(): Promise<number | null>;
}

function exitOf(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => child.once("exit", (code) => resolve(code)));
}

// The address is read from the line the CLI prints for the human.
function addressOf(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`view printed no address in time:\n${output}`)),
      VIEW_START_TIMEOUT_MS,
    );

    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");

      const address = FACTORY_FLOOR_LINE.exec(output)?.[1];

      if (address === undefined) return;

      clearTimeout(timer);
      resolve(address);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`view exited with ${code} before it printed an address:\n${output}`));
    });
  });
}

// SIGINT is how the human stops it; Windows has no such signal for a child, so the process is
// ended, and its exit code says nothing there.
async function startFloor(
  workspace: Workspace,
  env: Readonly<Record<string, string>>,
): Promise<RunningFloor> {
  const child = spawn(process.execPath, [workspace.cli, "view", "--no-open"], {
    cwd: workspace.project,
    env: childEnvironment({ ...workspace.env, ...env }),
  });
  const exit = exitOf(child);
  const url = await addressOf(child);
  const stop = async () => {
    child.kill(IS_WINDOWS ? undefined : "SIGINT");

    const timer = setTimeout(() => child.kill("SIGKILL"), VIEW_STOP_TIMEOUT_MS);
    const code = await exit;

    clearTimeout(timer);

    return code;
  };

  return { url, stop };
}

async function checkFloorServes(floor: RunningFloor): Promise<void> {
  const page = await httpGet(floor.url, { path: "/" });
  const recordings = await httpGet(floor.url, { path: "/api/recordings" });
  const listed = JSON.parse(recordings.body) as {
    published: { id: string }[];
    drafts: { id: string }[];
  };

  assert.equal(page.status, OK, "view did not serve /");
  assert.match(page.type ?? "", /^text\/html/);
  assert.match(page.body, /<div id="root">/, "/ is not the factory floor page");
  assert.deepEqual(
    {
      published: listed.published.map((record) => record.id),
      drafts: listed.drafts.map((record) => record.id),
    },
    { published: [VIEW_RECORDING_ID], drafts: [VIEW_DRAFT_ID] },
    "view lists other recordings or drafts than the project has",
  );
}

async function checkFloorRefuses(floor: RunningFloor): Promise<void> {
  const escapes = ["/..%2f..%2fpackage.json", "/%2e%2e/x", "/../package.json", "/package.json"];

  for (const escape of escapes) {
    const reply = await httpGet(floor.url, { path: escape });

    assert.equal(reply.status, NOT_FOUND, `view answered ${escape} with ${reply.status}`);
  }

  const foreign = await httpGet(floor.url, { path: "/", host: "example.com" });

  assert.equal(foreign.status, FORBIDDEN, "view answered a request for another Host");
}

// npx keeps what it fetched in `_npx` of the npm cache, never in the project.
async function checkViewerCached(cache: string): Promise<void> {
  const installs = await readdir(path.join(cache, "_npx"));
  const cached = installs.filter((name) =>
    existsSync(path.join(cache, "_npx", name, "node_modules", "@cyberzavod", "viewer")),
  );

  assert.equal(cached.length, 1, "the viewer package is not in the npx cache");
}

function expectStoppedByHuman(exitCode: number | null): void {
  assert.ok(IS_WINDOWS || exitCode === SUCCESS, `view exited with ${exitCode} after SIGINT`);
}

// The first run installs the packed viewer into a fresh npm cache and serves it.
async function checkViewFirstRun(
  workspace: Workspace,
  env: Readonly<Record<string, string>>,
  cache: string,
): Promise<void> {
  const { project } = workspace;

  await writeFiles(project, VIEW_FILES);

  const before = await projectFiles(project);
  const floor = await startFloor(workspace, env);

  await checkFloorServes(floor);
  await checkFloorRefuses(floor);
  expectStoppedByHuman(await floor.stop());
  assert.deepEqual(await projectFiles(project), before, "view changed the project");
  assert.ok(
    !existsSync(path.join(project, "node_modules")),
    "view put node_modules in the project",
  );
  await checkViewerCached(cache);
  step("view: serves the page and the list, refuses escapes and other hosts, writes nothing");
}

// The second run has no network. A tarball spec is a local file, so this proves that nothing is
// fetched, not that npx finds the package in its cache: the registry spec is checked by hand, see
// RELEASING.md.
async function checkViewOffline(
  workspace: Workspace,
  env: Readonly<Record<string, string>>,
): Promise<void> {
  const floor = await startFloor(workspace, { ...env, npm_config_offline: "true" });
  const page = await httpGet(floor.url, { path: "/" });

  assert.equal(page.status, OK, "offline view did not serve /");
  expectStoppedByHuman(await floor.stop());
  step("view without network");
}

async function checkView(workspace: Workspace, viewer: string): Promise<void> {
  const cache = await mkdtemp(path.join(os.tmpdir(), "cyberzavod-smoke-cache-"));
  const env = { CYBERZAVOD_VIEWER_PACKAGE: viewer, npm_config_cache: cache };

  try {
    await checkViewFirstRun(workspace, env, cache);
    await checkViewOffline(workspace, env);
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
}

async function claudePath(
  tool: string,
  root: string,
  paths: { cli: string; viewer: string },
): Promise<void> {
  const project = path.join(root, PROJECT_NAME);
  const workspace: Workspace = { tool, project, cli: paths.cli, env: {} };

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
  await checkView(workspace, paths.viewer);
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

    const packed = packCli(tool);
    const viewer = await packViewer(tool);
    const cli = await installPackage(tool, packed);

    step(`npm pack and install ${packed.filename}`);
    checkVersion({ tool, project: root, cli, env: {} }, packed);
    await claudePath(tool, root, { cli, viewer: path.join(tool, viewer.filename) });
    await codexPath(tool, root, cli);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await main();
