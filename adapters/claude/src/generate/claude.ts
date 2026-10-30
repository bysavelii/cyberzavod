// What the adapter knows about Claude Code: which agents and models it runs, which model it takes
// by default for each stage, and which tools it gives a role based on its access.

import { DEFAULT_MODEL, type AgentConfig, type Stage, type StageAccess } from "@cyberzavod/core";
import { ClaudeError } from "../errors.ts";

/** Provider of Claude models. */
export const CLAUDE_PROVIDER = "anthropic";

/** Agent this adapter runs. */
export const CLAUDE_AGENT = "claude";

// Mistakes cost most in plan and review, so a strong model there; code and checks get a fast one.
const DEFAULT_MODELS: Readonly<Record<Stage, string>> = {
  planning: "opus",
  implementation: "sonnet",
  review: "opus",
  verification: "sonnet",
  record: "sonnet",
};

const STAGE_EFFORT: Readonly<Record<Stage, string>> = {
  planning: "high",
  implementation: "high",
  review: "high",
  verification: "medium",
  record: "medium",
};

/** Implementer model on the second rework: the previous one has already failed twice. */
export const ESCALATION_MODEL = "opus";

const ROLE_TOOLS: Readonly<Record<StageAccess, string>> = {
  read: "Read, Grep, Glob, Bash",
  write: "Read, Edit, Write, Grep, Glob, Bash",
};

/** Claude Code file generation error: the config asks for something the adapter cannot do. */
export class GenerateError extends ClaudeError {}

/**
 * Claude model for a stage.
 * @param {Stage} stage Stage.
 * @param {AgentConfig | undefined} agent This agent's settings for the stage from the project config.
 * @returns {string} The model from the config, or the adapter's default model for the stage.
 * @throws {GenerateError} If the stage is assigned to another provider.
 */
export function claudeModelOf(stage: Stage, agent: AgentConfig | undefined): string {
  const { provider = CLAUDE_PROVIDER, model = DEFAULT_MODEL } = agent ?? {};

  if (provider !== CLAUDE_PROVIDER) {
    throw new GenerateError((messages) =>
      messages.errors.unsupportedAgent({
        stage,
        requested: provider,
        supported: CLAUDE_PROVIDER,
      }),
    );
  }

  return model === DEFAULT_MODEL ? DEFAULT_MODELS[stage] : model;
}

/**
 * Claude reasoning effort for a stage role.
 * @param {Stage} stage Stage.
 * @returns {string} The `effort` value for the agent header.
 */
export function claudeEffortOf(stage: Stage): string {
  return STAGE_EFFORT[stage];
}

/**
 * Claude Code tools for a role with the given access.
 * @param {StageAccess} access The role's access to files.
 * @returns {string} The `tools` value for the agent header.
 */
export function claudeToolsOf(access: StageAccess): string {
  return ROLE_TOOLS[access];
}
