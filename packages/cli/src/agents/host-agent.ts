// Which agent drives the project: the one connected in the agents of its config.

import type { ProjectConfig } from "@cyberzavod/core";
import {
  findProjectRoot,
  ProjectFileError,
  PROJECT_CONFIG_FILE,
  readProjectConfig,
} from "@cyberzavod/storage";
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
 * Agents connected to the project, in order of connection.
 * @param {ProjectConfig} config Project config.
 * @returns {string[]} Agent names; empty if no agent is connected.
 */
export function namedAgentsOf(config: ProjectConfig): string[] {
  return Object.keys(config.agents);
}

/**
 * The first agent connected in the config, or the default one: for texts that must be printed even for a
 * config `hostAgentOf` rejects.
 * @param {ProjectConfig} config Project config.
 * @returns {string} Agent name, supported or not.
 */
export function firstAgentNameOf(config: ProjectConfig): string {
  const [name = DEFAULT_AGENT_NAME] = namedAgentsOf(config);

  return name;
}

/**
 * The agent that drives the project: one agent for all stages. Without agents in the config it
 * is the default one; the provider is checked later by the agent's adapter.
 * @param {ProjectConfig} config Project config.
 * @returns {AgentName} The project's agent.
 * @throws {CommandError} If the config names an agent the CLI cannot drive or several agents.
 */
export function hostAgentOf(config: ProjectConfig): AgentName {
  const names = namedAgentsOf(config);

  if (names.length > 1) {
    const agents = names.join(LIST_SEPARATOR);

    throw new CommandError((m) => m.errors.mixedAgents({ agents, file: PROJECT_CONFIG_FILE }));
  }

  const name = firstAgentNameOf(config);

  if (!isAgentName(name)) {
    const supported = AGENT_NAMES.join(LIST_SEPARATOR);

    throw new CommandError((m) => m.errors.unsupportedAgent({ agent: name, supported }));
  }

  return name;
}

/**
 * The adapter of the agent that drives the project.
 * @param {ProjectConfig} config Project config.
 * @param {Adapters} adapters Adapters by agent name.
 * @returns {AgentAdapter} The project's adapter.
 * @throws {CommandError} If the config names an unsupported agent or several agents.
 */
export function adapterFor(config: ProjectConfig, adapters: Adapters): AgentAdapter {
  return adapters[hostAgentOf(config)];
}

/**
 * The adapter for the project around the directory, for commands that must work when the project
 * is missing or its config is unusable: then it is the default agent's adapter.
 * @param {string} directory Directory the command was run from.
 * @param {Adapters} adapters Adapters by agent name.
 * @returns {Promise<AgentAdapter>} The project's adapter or the default one.
 */
export async function adapterAt(directory: string, adapters: Adapters): Promise<AgentAdapter> {
  const fallback = adapters[DEFAULT_AGENT_NAME];
  const root = await findProjectRoot(directory);

  if (root === undefined) return fallback;

  try {
    const config = await readProjectConfig(root);

    return config === undefined ? fallback : adapterFor(config, adapters);
  } catch (err) {
    if (err instanceof CommandError || err instanceof ProjectFileError) return fallback;

    throw err;
  }
}
