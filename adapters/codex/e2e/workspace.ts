// The real tools of the end-to-end run in a temporary directory: the packed Cyberzavod package
// installed into a git project, a pinned Codex CLI, and an isolated Codex home with a config that
// points at the mock API.

import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CODEX_E2E_VERSION } from "./codex-version.ts";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "../../../packages/cli");
// Names a Codex binary that is already installed, for runs without network.
const CODEX_BIN_VARIABLE = "CODEX_E2E_BIN";
const SUCCESS = 0;
// A Codex background task may still be writing into its home when the run ends.
const REMOVE_RETRIES = 5;
const NO_PROXY_HOSTS = "127.0.0.1,localhost";

/** The result of a finished process. */
export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** What the tools of the run are and where they live. */
export interface Toolchain {
  /** Temporary directory that holds everything of the run. */
  root: string;
  /** The packed Cyberzavod archive. */
  archive: string;
  /** The Codex executable. */
  codex: string;
  /** Replacement for the login shell Codex runs hooks in; see `writeShell`. */
  shell: string;
}

/** One project of the run: its directory and the Codex home that trusts it. */
export interface Project {
  directory: string;
  codexHome: string;
  /** The Codex config as it was before `init` trusted the project. */
  initialCodexConfig: string;
  /** The installed Cyberzavod entry point. */
  cli: string;
}

/** The environment variables of a process. */
export type ProcessEnvironment = Record<string, string | undefined>;

/** Where and with what environment a process runs. */
export interface RunOptions {
  /** Directory the process starts in. */
  cwd: string;
  /** Environment of the process; this process's own by default. */
  env?: ProcessEnvironment;
}

/**
 * Runs a process to its end without blocking the event loop: the mock API in the same process
 * has to answer while Codex works.
 * @param {string} command Program.
 * @param {readonly string[]} args Arguments.
 * @param {RunOptions} options Directory and environment.
 * @returns {Promise<RunResult>} Exit status and output.
 */
export function run(
  command: string,
  args: readonly string[],
  options: RunOptions,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

/**
 * Runs a process that must succeed.
 * @param {string} command Program.
 * @param {readonly string[]} args Arguments.
 * @param {RunOptions} options Directory and environment.
 * @returns {Promise<string>} Standard output.
 * @throws {Error} With the output of the process if it exits with an error.
 */
export async function runOrFail(
  command: string,
  args: readonly string[],
  options: RunOptions,
): Promise<string> {
  const result = await run(command, args, options);

  if (result.status !== SUCCESS) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${String(result.status)}:\n${result.stdout}\n${result.stderr}`,
    );
  }

  return result.stdout;
}

// Codex runs a hook as `$SHELL -lc <command>`, and a login shell may reset PATH (Debian's
// /etc/profile does), after which `npx` is not found and the hook silently falls back. The shell
// the run gives Codex keeps the PATH of the run.
async function writeShell(root: string): Promise<string> {
  const shell = path.join(root, "hook-shell.sh");
  const script = `#!/bin/sh\nPATH='${process.env.PATH ?? ""}'\nexport PATH\nexec /bin/sh -c "$2"\n`;

  await writeFile(shell, script);
  await chmod(shell, 0o755);

  return shell;
}

// The hook payloads, the trust hash and the meaning of `block` are internals of Codex, so a run
// against any other version proves nothing.
async function requirePinnedVersion(codex: string, root: string): Promise<string> {
  const output = await runOrFail(codex, ["--version"], { cwd: root });

  if (!output.includes(CODEX_E2E_VERSION)) {
    throw new Error(`the end-to-end run is pinned to Codex ${CODEX_E2E_VERSION}, got: ${output}`);
  }

  return codex;
}

async function installCodex(root: string): Promise<string> {
  const preinstalled = process.env[CODEX_BIN_VARIABLE];

  if (preinstalled !== undefined && preinstalled !== "") {
    return requirePinnedVersion(preinstalled, root);
  }

  const prefix = path.join(root, "codex");

  await mkdir(prefix);
  await runOrFail(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--prefix",
      prefix,
      `@openai/codex@${CODEX_E2E_VERSION}`,
    ],
    { cwd: root },
  );

  return requirePinnedVersion(path.join(prefix, "node_modules", ".bin", "codex"), root);
}

/**
 * The version of the Cyberzavod package under test, as the skills write it into commands.
 * @returns {Promise<string>} Version from the package manifest.
 */
export async function cliVersion(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(path.join(PACKAGE_DIRECTORY, "package.json"), "utf8"),
  ) as {
    version: string;
  };

  return manifest.version;
}

// npm may print build script output before the JSON: the document starts at the first `[`.
async function packCli(root: string): Promise<string> {
  const output = await runOrFail("npm", ["pack", "--json", "--pack-destination", root], {
    cwd: PACKAGE_DIRECTORY,
  });
  const [packed] = JSON.parse(output.slice(output.indexOf("["))) as { filename: string }[];

  if (packed === undefined) throw new Error("npm pack returned no archive");

  return path.join(root, packed.filename);
}

/**
 * Prepares the tools: packs the CLI, installs Codex and writes the shell for hooks.
 * @returns {Promise<Toolchain>} The tools in a new temporary directory.
 */
export async function prepareToolchain(): Promise<Toolchain> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "cyberzavod-codex-e2e-")));

  return {
    root,
    archive: await packCli(root),
    codex: await installCodex(root),
    shell: await writeShell(root),
  };
}

/**
 * Removes the temporary directory of the run.
 * @param {Toolchain} tools The tools of the run.
 * @returns {Promise<void>} Resolves when the directory is gone.
 */
export async function discardToolchain(tools: Toolchain): Promise<void> {
  await rm(tools.root, { recursive: true, force: true, maxRetries: REMOVE_RETRIES });
}

/**
 * The environment of a tool run for a project.
 * @param {Project} project The project.
 * @param {Toolchain} tools The tools of the run.
 * @returns {ProcessEnvironment} Codex home, shell for hooks, English texts, local addresses off
 *   the proxy and a git identity for the commits the run makes. `INIT_CWD`, which npm and pnpm set,
 *   is dropped: the CLI would take it for the project directory.
 */
export function environmentOf(project: Project, tools: Toolchain): ProcessEnvironment {
  const environment: ProcessEnvironment = {
    ...process.env,
    CODEX_HOME: project.codexHome,
    SHELL: tools.shell,
    CYBERZAVOD_LANG: "en",
    NO_PROXY: NO_PROXY_HOSTS,
    no_proxy: NO_PROXY_HOSTS,
    GIT_AUTHOR_NAME: "e2e",
    GIT_AUTHOR_EMAIL: "e2e@example.com",
    GIT_COMMITTER_NAME: "e2e",
    GIT_COMMITTER_EMAIL: "e2e@example.com",
  };

  delete environment.INIT_CWD;

  return environment;
}

/**
 * Writes a project file, creating its directories.
 * @param {string} directory Project directory.
 * @param {string} file Path relative to the project.
 * @param {string} text Contents.
 * @returns {Promise<void>} Resolves when the file is written.
 */
export async function writeProjectFile(
  directory: string,
  file: string,
  text: string,
): Promise<void> {
  const target = path.join(directory, file);

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text);
}

/**
 * Reads a project file.
 * @param {string} directory Project directory.
 * @param {string} file Path relative to the project.
 * @returns {Promise<string>} Contents.
 */
export function readProjectFile(directory: string, file: string): Promise<string> {
  return readFile(path.join(directory, file), "utf8");
}
