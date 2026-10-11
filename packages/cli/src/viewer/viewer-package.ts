// Which package holds the factory floor and how npx is asked for it. A leaf module: the message
// catalog names the variable here, so it imports nothing that imports the catalog.

import { NPX_CACHE_FIRST_FLAGS } from "@cyberzavod/adapter-kit";
import type { Environment } from "../messages/language.ts";

/** Name of the npm package with the built factory floor. */
export const VIEWER_PACKAGE_NAME = "@cyberzavod/viewer";

/** The package's bin: it prints the directory of the built files. */
export const VIEWER_BIN = "cyberzavod-viewer";

/** Environment variable that replaces the package spec, for example with a path to an archive. */
export const VIEWER_PACKAGE_VARIABLE = "CYBERZAVOD_VIEWER_PACKAGE";

const NPX_COMMAND = "npx";
const WINDOWS_NPX_COMMAND = "npx.cmd";
const WINDOWS_PLATFORM: NodeJS.Platform = "win32";
const FLAG_SEPARATOR = " ";

/** The command that makes npx print where the factory floor lies. */
export interface ViewerInvocation {
  /** The package spec npx fetches, for messages. */
  spec: string;
  command: string;
  args: string[];
  /** Whether only a shell can run the command: `npx.cmd` on Windows. */
  shell: boolean;
}

/**
 * The package spec for this version of the CLI, unless the human replaced it.
 * @param {Environment} env Process environment.
 * @param {string} version CLI version: the factory floor has the same one.
 * @returns {string} Spec for `npx --package`.
 */
export function viewerSpecOf(env: Environment, version: string): string {
  return env[VIEWER_PACKAGE_VARIABLE] || `${VIEWER_PACKAGE_NAME}@${version}`;
}

// A shell splits the line at spaces: the spec is quoted so that a path with a space stays one
// argument, and always, so that the rule does not depend on what the path holds.
function quotedForShell(spec: string): string {
  return `"${spec}"`;
}

/**
 * How to run the package's bin through npx: from the npm cache without the registry when the
 * package is there, and failing at once without network and cache.
 * @param {string} spec Package spec.
 * @param {string} platform Node.js platform name the CLI runs on, for example `win32`.
 * @returns {ViewerInvocation} Command, arguments and whether a shell is needed.
 */
export function viewerInvocationOf(spec: string, platform: NodeJS.Platform): ViewerInvocation {
  const isWindows = platform === WINDOWS_PLATFORM;
  const specArgument = isWindows ? quotedForShell(spec) : spec;

  return {
    spec,
    command: isWindows ? WINDOWS_NPX_COMMAND : NPX_COMMAND,
    args: [...NPX_CACHE_FIRST_FLAGS.split(FLAG_SEPARATOR), "--package", specArgument, VIEWER_BIN],
    shell: isWindows,
  };
}
