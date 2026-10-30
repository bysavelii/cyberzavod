// Which agents drive the project: the ones connected in the agents of its config.

import type { ProjectConfig } from "@cyberzavod/core";
import { findProjectRoot, ProjectFileError, readProjectConfig } from "@cyberzavod/storage";
import { CommandError } from "../errors.ts";
import {
  AGENT_NAMES,
  DEFAULT_AGENT_NAME,
  isAgentName,
  type AgentAdapter,
  type AgentName,
} from "./agent-adapter.ts";
import type { Adapters } from "./registry.ts";

const LIST_SEPARATOR = ", ";

/** A list that has at least one element: a project is always driven by some agent. */
export type NonEmpty<T> = readonly [T, ...T[]];

/**
 * The agent a person or a hook file named with `--agent`.
 * @param {string} name Agent name as typed.
 * @returns {AgentName} The agent.
 * @throws {CommandError} If the CLI cannot drive such an agent.
 */
export function agentNamed(name: string): AgentName {
  if (isAgentName(name)) return name;

  const supported = AGENT_NAMES.join(LIST_SEPARATOR);

  throw new CommandError((m) => m.errors.unknownAgent({ agent: name, supported }));
}

/**
 * Names of the agents the config lists, in order of connection; the default one if it lists none.
 * The names are not checked: for texts that must be printed even for a config
 * `connectedAgentsOf` rejects.
 * @param {ProjectConfig} config Project config.
 * @returns {NonEmpty<string>} Agent names, supported or not.
 */
export function agentNamesOf(config: ProjectConfig): NonEmpty<string> {
  const [first = DEFAULT_AGENT_NAME, ...rest] = Object.keys(config.agents);

  return [first, ...rest];
}

function supportedAgent(name: string): AgentName {
  if (isAgentName(name)) return name;

  const supported = AGENT_NAMES.join(LIST_SEPARATOR);

  throw new CommandError((m) => m.errors.unsupportedAgent({ agent: name, supported }));
}

/**
 * The agents that drive the project, in order of connection. Without agents in the config it is
 * the default one; the provider is checked later by the agent's adapter.
 * @param {ProjectConfig} config Project config.
 * @returns {NonEmpty<AgentName>} The connected agents.
 * @throws {CommandError} If the config names an agent the CLI cannot drive.
 */
export function connectedAgentsOf(config: ProjectConfig): NonEmpty<AgentName> {
  const [first, ...rest] = agentNamesOf(config);

  return [supportedAgent(first), ...rest.map(supportedAgent)];
}

/**
 * The adapters of the agents that drive the project.
 * @param {ProjectConfig} config Project config.
 * @param {Adapters} adapters Adapters by agent name.
 * @returns {NonEmpty<AgentAdapter>} The connected agents' adapters, in order of connection.
 * @throws {CommandError} If the config names an agent the CLI cannot drive.
 */
export function connectedAdaptersOf(
  config: ProjectConfig,
  adapters: Adapters,
): NonEmpty<AgentAdapter> {
  const [first, ...rest] = connectedAgentsOf(config);

  return [adapters[first], ...rest.map((name) => adapters[name])];
}

/**
 * The adapter for a command that works with one agent (`draft`, `publish`): the one the person
 * named with `--agent`, or the only connected one.
 * @param {ProjectConfig} config Project config.
 * @param {Adapters} adapters Adapters by agent name.
 * @param {string | undefined} name `--agent` as typed, if given.
 * @returns {AgentAdapter} The agent's adapter.
 * @throws {CommandError} If the name is unknown or the agent is not connected, or there is no name
 *   and several agents are connected.
 */
export function adapterNamed(
  config: ProjectConfig,
  adapters: Adapters,
  name: string | undefined,
): AgentAdapter {
  const connected = connectedAgentsOf(config);
  const list = connected.join(LIST_SEPARATOR);

  if (name !== undefined) {
    const requested = agentNamed(name);

    if (connected.includes(requested)) return adapters[requested];

    throw new CommandError((m) => m.errors.agentNotConnected({ agent: requested, agents: list }));
  }

  const [only, ...others] = connected;

  if (others.length > 0) throw new CommandError((m) => m.errors.agentRequired(list));

  return adapters[only];
}

/**
 * The adapters for the project around the directory, for commands that must work when the project
 * is missing or its config is unusable: then it is the default agent's adapter.
 * @param {string} directory Directory the command was run from.
 * @param {Adapters} adapters Adapters by agent name.
 * @returns {Promise<NonEmpty<AgentAdapter>>} The project's adapters or the default one.
 */
export async function adaptersAt(
  directory: string,
  adapters: Adapters,
): Promise<NonEmpty<AgentAdapter>> {
  const fallback: NonEmpty<AgentAdapter> = [adapters[DEFAULT_AGENT_NAME]];
  const root = await findProjectRoot(directory);

  if (root === undefined) return fallback;

  try {
    const config = await readProjectConfig(root);

    return config === undefined ? fallback : connectedAdaptersOf(config, adapters);
  } catch (err) {
    if (err instanceof CommandError || err instanceof ProjectFileError) return fallback;

    throw err;
  }
}
