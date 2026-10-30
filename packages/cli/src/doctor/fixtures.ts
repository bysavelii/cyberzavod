// Shared data for `doctor` tests: a machine without a disk, a connected project in a temporary
// directory and the project checks context.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { onTestFinished, vi } from "vitest";
import { journalDirectory, readProjectConfig } from "@cyberzavod/storage";
import { adapters } from "../agents/fixtures.ts";
import { confirmWithoutAsking } from "../confirmation.ts";
import { initProject } from "../commands/init.ts";
import type { ProjectAt } from "../commands/project.ts";
import { readInstallation } from "../installation/installation.ts";
import { CLI_MESSAGES } from "../messages/catalog.ts";
import { memoryCredentials, SECRET_TOKEN } from "../sharing/fixtures.ts";
import type { CommandRunner, Machine, ProjectContext } from "./check.ts";

/** English texts: tests check hints word for word. */
export const messages = CLI_MESSAGES.en;

/** Filled-in project rules: no starter placeholders. */
export const FILLED_RULES = "# Rules\n\nFilled in.\n";

/** The check command of a connected project in tests. */
export const PROJECT_CHECK_COMMAND = "make check";

/**
 * A machine where everything is fine: recent Node, git found, token saved.
 * @param {Partial<Machine>} patch Fields to replace.
 * @returns {Machine} A machine for checks.
 */
export function machine(patch: Partial<Machine> = {}): Machine {
  return {
    nodeVersion: "22.1.0",
    credentials: memoryCredentials(SECRET_TOKEN),
    isProgramAvailable: async () => true,
    ...patch,
  };
}

/**
 * A connected project in a temporary directory: `init --yes` with one check and a filled-in
 * AGENTS.md. `init` output is suppressed until the end of the test; the directory is removed after
 * it.
 * @param {string[]} checks Project check commands.
 * @returns {Promise<ProjectAt>} The project.
 */
export async function connectedProject(checks = [PROJECT_CHECK_COMMAND]): Promise<ProjectAt> {
  const root = await mkdtemp(path.join(tmpdir(), "cyberzavod-doctor-"));
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

  onTestFinished(() => rm(root, { recursive: true, force: true }));
  onTestFinished(() => log.mockRestore());
  await initProject(root, {
    confirm: confirmWithoutAsking,
    overrides: { checks, projectId: "shop" },
    installation: await readInstallation(),
    messages,
    adapters,
  });
  log.mockClear();
  await writeFile(path.join(root, "AGENTS.md"), FILLED_RULES);

  return projectAt(root);
}

/**
 * The project as checks see it, from its root on disk.
 * @param {string} root Root of the connected project.
 * @returns {Promise<ProjectAt>} The project with the current config.
 */
export async function projectAt(root: string): Promise<ProjectAt> {
  const config = await readProjectConfig(root);

  if (config === undefined) throw new Error(`no project in ${root}`);

  return { root, config, journal: journalDirectory(root, config) };
}

/**
 * Project checks context: programs are found, commands exit with code 0.
 * @param {ProjectAt} project Connected project.
 * @param {Partial<ProjectContext>} patch Fields to replace.
 * @returns {Promise<ProjectContext>} The context.
 */
export async function projectContext(
  project: ProjectAt,
  patch: Partial<ProjectContext> = {},
): Promise<ProjectContext> {
  const runCommand: CommandRunner = () => ({ kind: "exited", code: 0 });

  return {
    project,
    installation: await readInstallation(),
    messages,
    adapters: [adapters.claude],
    language: "en",
    isProgramAvailable: async () => true,
    runCommand,
    ...patch,
  };
}
