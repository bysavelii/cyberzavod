// `cyberzavod doctor`: checks the machine, the project connection and the agent files item by item
// and says under each error how to fix it. Fixes nothing and does not go to the network.

import type { InterfaceLanguage } from "@cyberzavod/core";
import type { AgentAdapter } from "../agents/agent-adapter.ts";
import type { NonEmpty } from "../agents/host-agent.ts";
import type {
  CheckResult,
  Machine,
  MachineCheck,
  ProjectCheck,
  ProjectContext,
} from "../doctor/check.ts";
import { configCheck } from "../doctor/config.ts";
import { freshnessCheck } from "../doctor/freshness.ts";
import { galleryCheck } from "../doctor/gallery.ts";
import { gitCheck } from "../doctor/git.ts";
import { gitignoreCheck } from "../doctor/gitignore.ts";
import { hooksCheckFor } from "../doctor/hooks.ts";
import { nodeCheck } from "../doctor/node.ts";
import { rulesCheck } from "../doctor/rules.ts";
import type { Installation } from "../installation/installation.ts";
import { printJson } from "../json-output.ts";
import type { CliMessages } from "../messages/cli-messages.ts";

const PASSED_SIGN = "✓";
const FAILED_SIGN = "✗";
const NOTICE_SIGN = "–";
const HINT_INDENT = "    ";

const CONFIG_CHECK_ID = "config";

/** What project checks need from the outside world: program lookup and running commands. */
export type ProjectTools = Pick<ProjectContext, "isProgramAvailable" | "runCommand">;

/** What `doctor` needs: machine, project checks, CLI version, texts and program access. */
export interface DoctorOptions {
  machine: Machine;
  /** Project checks in display order; they run only if a project is found. */
  projectChecks: readonly ProjectCheck[];
  /** Program lookup and running commands for project checks. */
  projectTools: ProjectTools;
  installation: Installation;
  messages: CliMessages;
  /** Adapters of the agents that drive the project, or the default one without a project. */
  adapters: NonEmpty<AgentAdapter>;
  /** Language of the texts that come from the adapters. */
  language: InterfaceLanguage;
  /** Print the result as one JSON document rather than lines for the human. */
  isJson: boolean;
}

/** A check result with its code. */
interface IdentifiedResult {
  id: string;
  /** The agent the check is about, if it is about one. */
  agent: string | undefined;
  result: CheckResult;
}

function aboutAgent<Check extends MachineCheck | ProjectCheck>(
  check: Check,
  adapter: AgentAdapter,
): Check {
  return { ...check, agent: adapter.name };
}

/**
 * Machine checks in display order: they run before project checks and do not depend on them.
 * @param {NonEmpty<AgentAdapter>} adapters Adapters of the agents whose programs are checked.
 * @returns {MachineCheck[]} Node, git, the agents' programs and the gallery.
 */
export function machineChecksFor(adapters: NonEmpty<AgentAdapter>): MachineCheck[] {
  const programChecks = adapters.map((adapter) => aboutAgent(adapter.programCheck, adapter));

  return [nodeCheck, gitCheck, ...programChecks, galleryCheck];
}

function checksOfAgent(adapter: AgentAdapter): ProjectCheck[] {
  const checks = [hooksCheckFor(adapter), ...adapter.extraProjectChecks];

  return checks.map((check) => aboutAgent(check, adapter));
}

/**
 * Project checks in display order; the commands check is the one the caller chose: find the
 * programs or run the commands.
 * @param {ProjectCheck} commandsCheck Check of the project's check commands.
 * @param {NonEmpty<AgentAdapter>} adapters Adapters of the agents that drive the project.
 * @returns {ProjectCheck[]} Each agent's hooks and own checks, agent files, rules, commands and
 *   `.gitignore`.
 */
export function projectChecksWith(
  commandsCheck: ProjectCheck,
  adapters: NonEmpty<AgentAdapter>,
): ProjectCheck[] {
  return [
    ...adapters.flatMap(checksOfAgent),
    freshnessCheck,
    rulesCheck,
    commandsCheck,
    gitignoreCheck,
  ];
}

function linesOf(result: CheckResult, messages: CliMessages): string[] {
  switch (result.status) {
    case "passed":
      return [`${PASSED_SIGN} ${result.summary}`];
    case "failed":
      return [
        `${FAILED_SIGN} ${result.problem}`,
        `${HINT_INDENT}${messages.doctor.fix(result.fix)}`,
      ];
    case "notice":
      return [
        `${NOTICE_SIGN} ${result.summary}`,
        `${HINT_INDENT}${messages.doctor.hint(result.hint)}`,
      ];
  }
}

function isProblem(result: CheckResult): boolean {
  switch (result.status) {
    case "passed":
    case "notice":
      return false;
    case "failed":
      return true;
  }
}

// Results one at a time, in display order: slow checks do not hold back items that are ready.
async function* resultsOf(
  directory: string,
  options: DoctorOptions,
): AsyncGenerator<IdentifiedResult> {
  const { machine, messages, installation, adapters, language, projectTools } = options;

  for (const check of machineChecksFor(adapters)) {
    yield { id: check.id, agent: check.agent, result: await check.run(machine, messages) };
  }

  const { result, project } = await configCheck(directory, messages);

  yield { id: CONFIG_CHECK_ID, agent: undefined, result };

  if (project === undefined) return;

  const context: ProjectContext = {
    project,
    installation,
    messages,
    adapters,
    language,
    ...projectTools,
  };

  for (const check of options.projectChecks) {
    yield { id: check.id, agent: check.agent, result: await check.run(context) };
  }
}

function jsonOf({ id, agent, result }: IdentifiedResult) {
  const about = agent === undefined ? {} : { agent };

  switch (result.status) {
    case "passed":
      return { id, ...about, status: result.status, message: result.summary };
    case "failed":
      return { id, ...about, status: result.status, message: result.problem, fix: result.fix };
    case "notice":
      return { id, ...about, status: result.status, message: result.summary, hint: result.hint };
  }
}

/**
 * Checks the machine, the project connection and the agent files and prints a line per item: ✓,
 * ✗ or –, and under ✗ how to fix it; with `isJson`, one JSON document. Outside a project prints
 * the machine checks and the config error.
 * @param {string} directory Directory the command was run from.
 * @param {DoctorOptions} options Machine, project checks, program lookup and command running
 *   (`projectTools`), CLI version, texts, output format.
 * @returns {Promise<boolean>} true if no check failed.
 */
export async function runDoctor(directory: string, options: DoctorOptions): Promise<boolean> {
  const { messages, isJson } = options;
  const results: IdentifiedResult[] = [];

  for await (const identified of resultsOf(directory, options)) {
    results.push(identified);

    if (!isJson) console.log(linesOf(identified.result, messages).join("\n"));
  }

  const problemCount = results.filter(({ result }) => isProblem(result)).length;

  if (isJson) {
    const status = problemCount === 0 ? "ok" : "problems";

    printJson("doctor", { status, problems: problemCount, checks: results.map(jsonOf) });
  } else {
    console.log(
      problemCount === 0 ? messages.doctor.allPassed : messages.doctor.problems(problemCount),
    );
  }

  return problemCount === 0;
}
