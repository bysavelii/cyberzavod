// Who runs a stage: provider and model. The core knows no provider or agent:
// which combinations work is decided by the agent's adapter.

import { isLine, isObject } from "./guards.ts";

/**
 * Stage performer settings. Any field may be missing: then the adapter uses its own default.
 * Model `default` means the same as no model.
 */
export interface AgentConfig {
  /** Model provider, for example `anthropic`. */
  provider?: string;
  /** Model or `default`. */
  model?: string;
}

/** Model chosen by the adapter: its own for each stage. */
export const DEFAULT_MODEL = "default";

/** Agent description error: it came from outside and failed validation. */
export class AgentConfigError extends Error {}

const AGENT_FIELDS = ["provider", "model"] as const;

/**
 * Validates a stage performer description.
 * @param {unknown} raw Parsed JSON of the agent.
 * @returns {AgentConfig} The validated description; missing fields are missing in the result too.
 * @throws {AgentConfigError} If the description is not an object or a field is not one-line text.
 */
export function parseAgentConfig(raw: unknown): AgentConfig {
  if (!isObject(raw)) throw new AgentConfigError("agent must be an object");

  const config: AgentConfig = {};

  for (const field of AGENT_FIELDS) {
    const value = raw[field];

    if (value === undefined) continue;
    if (!isLine(value)) throw new AgentConfigError(`${field} must be a non-empty string`);

    config[field] = value;
  }

  return config;
}
