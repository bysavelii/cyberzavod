// Shared `doctor` check types: the result, a machine check and a project check.

import type { InterfaceLanguage } from "@cyberzavod/core";
import type { AgentAdapter } from "../agents/agent-adapter.ts";
import type { NonEmpty } from "../agents/host-agent.ts";
import type { ProjectAt } from "../commands/project.ts";
import type { Installation } from "../installation/installation.ts";
import type { CliMessages } from "../messages/cli-messages.ts";
import type { CredentialsStore } from "../sharing/settings.ts";

/** Separator of list elements in check lines. */
export const LIST_SEPARATOR = ", ";

/**
 * Outcome of one check: passed (`passed`), failed with a way to fix it (`failed`), or not an
 * error but worth the human's attention (`notice`). The `doctor` exit code depends only on
 * `failed`.
 */
export type CheckResult =
  | { status: "passed"; summary: string }
  | { status: "failed"; problem: string; fix: string }
  | { status: "notice"; summary: string; hint: string };

/**
 * The check passed.
 * @param {string} summary What was found.
 * @returns {CheckResult} A `passed` result.
 */
export function passed(summary: string): CheckResult {
  return { status: "passed", summary };
}

/**
 * The check failed.
 * @param {{ problem: string; fix: string }} failure What is wrong and what to do.
 * @param {string} failure.problem What is wrong.
 * @param {string} failure.fix One action that fixes it.
 * @returns {CheckResult} A `failed` result.
 */
export function failed(failure: { problem: string; fix: string }): CheckResult {
  return { status: "failed", ...failure };
}

/**
 * An item that is not an error but is worth the human's attention.
 * @param {{ summary: string; hint: string }} content What was found and a hint.
 * @param {string} content.summary What was found.
 * @param {string} content.hint What can be done.
 * @returns {CheckResult} A `notice` result.
 */
export function notice(content: { summary: string; hint: string }): CheckResult {
  return { status: "notice", ...content };
}

/** What `doctor` knows about the machine without looking into the project. */
export interface Machine {
  /** Node version the CLI runs on, as in `process.versions.node`. */
  nodeVersion: string;
  /** Where the gallery token is stored. */
  credentials: CredentialsStore;
  /** Whether the program is in `PATH`, without running it. */
  isProgramAvailable(name: string): Promise<boolean>;
}

/** Result of running a check command: the exit code or the reason it did not start. */
export type CommandRun = { kind: "exited"; code: number } | { kind: "notStarted"; reason: string };

/** Runs a command with the system shell in the project root. */
export type CommandRunner = (command: string, root: string) => CommandRun;

/**
 * Everything project checks need: the project itself, its agents' adapters, CLI version, texts and
 * program access.
 */
export interface ProjectContext {
  project: ProjectAt;
  installation: Installation;
  messages: CliMessages;
  /** Adapters of the connected agents; the first one speaks for the project in shared texts. */
  adapters: NonEmpty<AgentAdapter>;
  /** Language of the texts that come from the adapters. */
  language: InterfaceLanguage;
  /**
   * Whether the program exists: a word with `/` or `\` is a file from `root`, otherwise a `PATH`
   * lookup.
   */
  isProgramAvailable(word: string, root: string): Promise<boolean>;
  runCommand: CommandRunner;
}

/** A machine check: does not depend on the project. */
export interface MachineCheck {
  /** Check code in JSON output: stable across versions. */
  id: string;
  /** The agent the check is about, if it is about one. */
  agent?: string;
  run(machine: Machine, messages: CliMessages): Promise<CheckResult>;
}

/** A check of a connected project. */
export interface ProjectCheck {
  /** Check code in JSON output: stable across versions. */
  id: string;
  /** The agent the check is about, if it is about one. */
  agent?: string;
  run(context: ProjectContext): Promise<CheckResult>;
}
