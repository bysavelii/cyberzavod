// Harness on disk: a directory with skills in `skills/<name>/` and workflows in `workflows/*.json`.
// Here is only reading the files; parsing the texts is in the core.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  HarnessError,
  parseHarness,
  type Harness,
  type HarnessFiles,
  type Workflow,
} from "@cyberzavod/core";

/**
 * Reads all files of the harness directory: path from the directory with `/` → text.
 * @param {string} directory Harness directory.
 * @returns {Promise<HarnessFiles>} Harness files.
 */
export async function readHarnessFiles(directory: string): Promise<HarnessFiles> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files: Record<string, string> = {};

  const fileEntries = entries.filter((candidate) => candidate.isFile());

  for (const entry of fileEntries) {
    const file = path.join(entry.parentPath, entry.name);
    const name = path.relative(directory, file).split(path.sep).join("/");

    files[name] = await readFile(file, "utf8");
  }

  return files;
}

/**
 * Reads the harness from a directory.
 * @param {string} directory Harness directory.
 * @returns {Promise<Harness>} The lead, skills, principles, all stages and workflows.
 * @throws {HarnessError} If a skill or workflow file failed validation.
 */
export async function loadHarness(directory: string): Promise<Harness> {
  const files = await readHarnessFiles(directory);

  return parseHarness(files);
}

/**
 * Finds a workflow by name.
 * @param {Harness} harness Harness.
 * @param {string} name Workflow name from the project config.
 * @returns {Workflow} The workflow.
 * @throws {HarnessError} If there is no such workflow.
 */
export function workflowOf(harness: Harness, name: string): Workflow {
  const workflow = harness.workflows.find((candidate) => candidate.name === name);

  if (workflow === undefined) {
    const known = harness.workflows.map((candidate) => candidate.name).join(", ");

    throw new HarnessError(`process ${name} is not in the harness; available: ${known}`);
  }

  return workflow;
}
