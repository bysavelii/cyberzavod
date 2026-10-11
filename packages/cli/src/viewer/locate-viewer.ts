// Asking npx for the factory floor: it fetches the package into its own cache on the first run and
// takes it from there afterwards.

import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { CommandError } from "../errors.ts";
import type { Environment } from "../messages/language.ts";
import type { ViewerInvocation } from "./viewer-package.ts";

const INDEX_FILE = "index.html";
const SUCCESS = 0;
const LINE_BREAK = /\r?\n/;

/** Finds the directory of the built factory floor for a package spec; stubbed in tests. */
export type LocateViewer = (spec: string, root: string) => string;

// A shell gets one line: Node warns about arguments passed along with `shell: true`.
function spawnInvocation(invocation: ViewerInvocation, root: string, env: Environment) {
  const { command, args, shell } = invocation;
  const options: SpawnSyncOptionsWithStringEncoding = {
    cwd: root,
    env: { ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    shell,
  };

  return shell
    ? spawnSync([command, ...args].join(" "), options)
    : spawnSync(command, args, options);
}

function lastLineOf(output: string): string {
  const lines = output.split(LINE_BREAK).filter((line) => line.trim() !== "");

  return lines.at(-1)?.trim() ?? "";
}

/**
 * Runs the package's bin through npx and takes the directory it prints. npx's own messages go to
 * the human as they are. The project is the working directory, so the human's `.npmrc` applies.
 * @param {ViewerInvocation} invocation The npx command.
 * @param {string} root Project root.
 * @param {Environment} env Environment of the npx process.
 * @returns {string} Directory with `index.html`.
 * @throws {CommandError} If npx cannot get the package or the package has no built files.
 */
export function locateViewer(invocation: ViewerInvocation, root: string, env: Environment): string {
  const { spec } = invocation;
  const unavailable = (cause?: Error) =>
    new CommandError((m) => m.errors.viewerUnavailable(spec), { cause });
  const result = spawnInvocation(invocation, root, env);

  // npx did not start at all: stdout is empty then.
  if (result.error) throw unavailable(result.error);

  const directory = lastLineOf(result.stdout);

  if (result.status !== SUCCESS || directory === "") throw unavailable();

  if (!existsSync(path.join(directory, INDEX_FILE))) {
    throw new CommandError((m) => m.errors.viewerBroken(directory));
  }

  return directory;
}
