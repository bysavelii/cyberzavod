// A throwaway project connected to Codex: sources, a git repository, the installed Cyberzavod
// package and a Codex home whose config sends the model requests to the mock API.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  environmentOf,
  run,
  runOrFail,
  writeProjectFile,
  type Project,
  type RunResult,
  type Toolchain,
} from "./workspace.ts";

/** Check command of the project: red until the file `fixed.txt` exists. */
export const CHECK_COMMAND = "node check.mjs";

/** The file whose presence turns the check green. */
export const FIX_FILE = "fixed.txt";

/** A secret the guard must keep out of the model's hands. */
export const ENV_FILE = ".env";

const PROJECT_FILES: Readonly<Record<string, string>> = {
  "package.json": `${JSON.stringify({ name: "e2e-project", private: true }, null, 2)}\n`,
  ".gitignore": "node_modules/\n.env\n",
  [ENV_FILE]: "SECRET=do-not-read\n",
  "check.mjs": [
    'import { existsSync } from "node:fs";',
    "",
    `if (!existsSync("${FIX_FILE}")) {`,
    `  console.error("check failed: ${FIX_FILE} is missing");`,
    "  process.exit(1);",
    "}",
    "",
  ].join("\n"),
  "src/app.js": 'export const greeting = "hello";\n',
  "src/lib/util.js": "export const answer = 41;\n",
};

// The plugin sync would clone repositories in the background from the network: the run stays
// local, and Codex has no files of its own in the home when the run ends.
function codexConfig(mockBaseUrl: string): string {
  return [
    'model_provider = "mock"',
    "",
    "[features]",
    "plugins = false",
    "",
    "[model_providers.mock]",
    'name = "mock"',
    `base_url = "${mockBaseUrl}"`,
    'wire_api = "responses"',
    "",
  ].join("\n");
}

async function git(project: Project, tools: Toolchain, args: readonly string[]): Promise<void> {
  await runOrFail("git", args, { cwd: project.directory, env: environmentOf(project, tools) });
}

/**
 * Runs the installed Cyberzavod in the project.
 * @param {Project} project The project.
 * @param {Toolchain} tools The tools of the run.
 * @param {readonly string[]} args Arguments of the command.
 * @returns {Promise<RunResult>} Exit status and output.
 */
export function cyberzavod(
  project: Project,
  tools: Toolchain,
  args: readonly string[],
): Promise<RunResult> {
  return run(process.execPath, [project.cli, ...args], {
    cwd: project.directory,
    env: environmentOf(project, tools),
  });
}

/**
 * Creates a git project with the package installed, connects it to Codex and commits the result.
 * The `.codex/` files and the trust in the Codex home come from a real `init`.
 * @param {Toolchain} tools The tools of the run.
 * @param {string} name Name of the project; its directory and Codex home are under it.
 * @param {string} mockBaseUrl Address of the mock API for the Codex config.
 * @returns {Promise<Project>} The connected project.
 */
export async function createConnectedProject(
  tools: Toolchain,
  name: string,
  mockBaseUrl: string,
): Promise<Project> {
  const directory = path.join(tools.root, name, "project");
  const codexHome = path.join(tools.root, name, "codex-home");
  const initialCodexConfig = codexConfig(mockBaseUrl);
  const project: Project = {
    directory,
    codexHome,
    initialCodexConfig,
    cli: path.join(directory, "node_modules", "cyberzavod", "dist", "cyberzavod.mjs"),
  };

  await mkdir(codexHome, { recursive: true });
  await writeProjectFile(codexHome, "config.toml", initialCodexConfig);

  for (const [file, text] of Object.entries(PROJECT_FILES)) {
    await writeProjectFile(directory, file, text);
  }

  await git(project, tools, ["init", "-q"]);
  await runOrFail("npm", ["install", "--no-audit", "--no-fund", "-D", tools.archive], {
    cwd: directory,
    env: environmentOf(project, tools),
  });

  const init = await cyberzavod(project, tools, [
    "init",
    "--yes",
    "--agent",
    "codex",
    "--check",
    CHECK_COMMAND,
  ]);

  if (init.status !== 0) throw new Error(`init failed:\n${init.stdout}\n${init.stderr}`);

  await git(project, tools, ["add", "-A"]);
  await git(project, tools, ["commit", "-q", "-m", "connect to Codex"]);

  return project;
}

/** What to say to Codex, and where. */
export interface CodexTask {
  /** The prompt. */
  prompt: string;
  /** Directory to start in; the project root by default. */
  cwd?: string;
}

/**
 * Runs `codex exec` for the project, as the human would from a terminal: no input, the workspace
 * sandbox, and no bypass of the hook trust.
 * @param {Project} project The project.
 * @param {Toolchain} tools The tools of the run.
 * @param {CodexTask} task What to say to Codex and where.
 * @returns {Promise<RunResult>} Exit status and output of Codex.
 */
export function runCodex(project: Project, tools: Toolchain, task: CodexTask): Promise<RunResult> {
  return run(tools.codex, ["exec", "--color", "never", "-s", "workspace-write", task.prompt], {
    cwd: task.cwd ?? project.directory,
    env: environmentOf(project, tools),
  });
}
