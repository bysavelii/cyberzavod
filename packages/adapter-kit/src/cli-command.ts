// How the adapters call the CLI: the npm package via npx.

/** Name of the Cyberzavod npm package. */
export const PACKAGE_NAME = "cyberzavod";

/** Command that runs the CLI in hints for the human: npx picks the version. */
export const CLI_COMMAND = `npx ${PACKAGE_NAME}`;

/**
 * Command that runs the CLI version recorded in the project config, so drafting and publishing use
 * the same version that wrote the journal.
 * @param {string} version Cyberzavod version from the project config.
 * @returns {string} Run command without arguments.
 */
export function pinnedCliCommand(version: string): string {
  return `${CLI_COMMAND}@${version}`;
}

/**
 * npx flags that take a package from the npm cache without contacting the registry and, without
 * network or cache, fail at once rather than after minutes. `-y` skips the install prompt. The
 * hooks and the viewer launch use them.
 */
export const NPX_CACHE_FIRST_FLAGS = "-y --prefer-offline --fetch-retries=0";
