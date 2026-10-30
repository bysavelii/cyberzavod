// The project config `init` connects the project with: what was found in the project, the default
// workflow and agents, with the human's flags on top.

import path from "node:path";
import {
  DEFAULT_MODEL,
  type Harness,
  type ProjectConfig,
  type StageAgents,
} from "@cyberzavod/core";
import { DEFAULT_JOURNAL, workflowOf } from "@cyberzavod/storage";
import type { AgentIdentity } from "./agents/agent-adapter.ts";
import { projectIdOf, stackOf, type DetectedProject } from "./detect.ts";
import { HARNESS_VERSION } from "./installation/installation.ts";
import { CommandError } from "./errors.ts";

/** The workflow `init` sets for the project. */
export const DEFAULT_WORKFLOW = "default";

const PROJECT_ID_OPTION = "--id";
const CHECK_OPTION = "--check";
const JOURNAL_OPTION = "--journal";
const POSIX_SEPARATOR = "/";
const CURRENT_DIRECTORY = ".";
const WINDOWS_SEPARATOR = "\\";
const TRAILING_SEPARATORS = /\/+$/;

/** `init` flag values: what the human set instead of what was found. */
export interface InitOverrides {
  /** `--id`: project id. */
  projectId?: string;
  /** `--check`: check commands; they fully replace the found ones. */
  checks?: string[];
  /** `--journal`: journal directory from the project root. */
  journal?: string;
}

/** What the initial config needs: findings, harness and flags. */
export interface InitialConfigSource {
  /** What was found in the project. */
  detected: DetectedProject;
  /** Harness: workflows and stages. */
  harness: Harness;
  /** The human's flags. */
  overrides: InitOverrides;
  /** The provider and agent every stage with a role gets. */
  identity: AgentIdentity;
}

function requiredValue(option: string, value: string): string {
  const trimmed = value.trim();

  if (trimmed === "") throw new CommandError((m) => m.errors.blankOption(option));

  return trimmed;
}

function projectIdOption(value: string): string {
  return projectIdOf(requiredValue(PROJECT_ID_OPTION, value));
}

function checksOption(values: readonly string[]): string[] {
  return values.map((value) => requiredValue(CHECK_OPTION, value));
}

function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value);
}

// The journal in the config is a path from the project root with `/`: Windows backslashes and a
// trailing slash (`./lab/`) do not get into it.
function journalOption(value: string): string {
  const journal = requiredValue(JOURNAL_OPTION, value);

  if (isAbsolutePath(journal)) throw new CommandError((m) => m.errors.absoluteJournal(journal));

  const slashed = journal.split(WINDOWS_SEPARATOR).join(POSIX_SEPARATOR);
  const normalized = path.posix.normalize(slashed);
  const relative = normalized.replace(TRAILING_SEPARATORS, "");

  // A journal in the project root would clutter it: the journal needs its own directory.
  if (relative === CURRENT_DIRECTORY) {
    throw new CommandError((m) => m.errors.journalIsProjectRoot(journal));
  }

  return relative;
}

/**
 * The agent's settings for every stage of the workflow that has a role in the harness.
 * @param {Harness} harness Harness: workflows and stages.
 * @param {string} workflowName Workflow of the project.
 * @param {AgentIdentity} identity The agent's provider.
 * @returns {StageAgents} Settings of the agent by stage.
 * @throws {Error} If the harness has no such workflow.
 */
export function stageAgentsOf(
  harness: Harness,
  workflowName: string,
  identity: AgentIdentity,
): StageAgents {
  const stageAgents: StageAgents = {};

  for (const stage of workflowOf(harness, workflowName).stages) {
    if (harness.stages[stage].role === undefined) continue;

    stageAgents[stage] = { provider: identity.provider, model: DEFAULT_MODEL };
  }

  return stageAgents;
}

/**
 * Builds the project config from the findings: id, checks and stack from the project, the
 * `default` workflow and the agent's settings for each stage with a role. The human's flags override findings.
 * @param {InitialConfigSource} source Project findings, harness, flags and the agent.
 * @returns {ProjectConfig} Project config with this CLI's harness version.
 * @throws {CommandError} If a flag is empty or `--journal` is an absolute path.
 */
export function initialConfigOf(source: InitialConfigSource): ProjectConfig {
  const { detected, harness, overrides, identity } = source;
  const projectId =
    overrides.projectId === undefined
      ? projectIdOf(detected.name)
      : projectIdOption(overrides.projectId);
  const commands =
    overrides.checks === undefined ? detected.verification : checksOption(overrides.checks);
  const journal =
    overrides.journal === undefined ? DEFAULT_JOURNAL : journalOption(overrides.journal);
  const workflow = workflowOf(harness, DEFAULT_WORKFLOW);

  return {
    projectId,
    harness: HARNESS_VERSION,
    workflow: workflow.name,
    journal,
    agents: { [identity.agent]: stageAgentsOf(harness, workflow.name, identity) },
    verification: { commands, paths: [] },
    stack: stackOf(detected),
  };
}
