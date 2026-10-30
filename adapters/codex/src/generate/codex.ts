// What the adapter knows about Codex: which agents and models it runs and which model it takes by
// default for each stage.

import { DEFAULT_MODEL, type AgentConfig, type Stage } from "@cyberzavod/core";
import { CodexError } from "../errors.ts";

/** Provider of Codex models. */
export const CODEX_PROVIDER = "openai";

/** Agent this adapter runs. */
export const CODEX_AGENT = "codex";

/** Name of the shell tool in Codex hook payloads (the `exec_command` tool). */
export const SHELL_TOOL = "Bash";

/** Name of the file-editing tool in Codex hook payloads. */
export const PATCH_TOOL = "apply_patch";

// Mistakes cost most in plan and review, so the frontier model there; code and checks get the
// workhorse model.
const DEFAULT_MODELS: Readonly<Record<Stage, string>> = {
  planning: "gpt-6-astra",
  implementation: "gpt-6.1-sol",
  review: "gpt-6-astra",
  verification: "gpt-6.1-sol",
  record: "gpt-6.1-sol",
};

const STAGE_EFFORT: Readonly<Record<Stage, string>> = {
  planning: "high",
  implementation: "high",
  review: "high",
  verification: "medium",
  record: "medium",
};

/** Implementer model on the second rework: the previous one has already failed twice. */
export const ESCALATION_MODEL = "gpt-6-astra";

/** Model of the agent that edits recording drafts. */
export const RECORDING_EDITOR_MODEL = "gpt-6.1-sol";

/** Reasoning effort of the agent that edits recording drafts: rewording, not deep work. */
export const RECORDING_EDITOR_EFFORT = "medium";

/** Codex file generation error: the config asks for something the adapter cannot do. */
export class CodexGenerateError extends CodexError {}

/**
 * Codex model for a stage.
 * @param {Stage} stage Stage.
 * @param {AgentConfig | undefined} agent This agent's settings for the stage from the project config.
 * @returns {string} The model from the config, or the adapter's default model for the stage.
 * @throws {CodexGenerateError} If the stage is assigned to another provider.
 */
export function codexModelOf(stage: Stage, agent: AgentConfig | undefined): string {
  const { provider = CODEX_PROVIDER, model = DEFAULT_MODEL } = agent ?? {};

  if (provider !== CODEX_PROVIDER) {
    throw new CodexGenerateError((messages) =>
      messages.errors.unsupportedAgent({
        stage,
        requested: provider,
        supported: CODEX_PROVIDER,
      }),
    );
  }

  return model === DEFAULT_MODEL ? DEFAULT_MODELS[stage] : model;
}

/**
 * Codex reasoning effort for a stage role.
 * @param {Stage} stage Stage.
 * @returns {string} The `model_reasoning_effort` value for the role file.
 */
export function codexEffortOf(stage: Stage): string {
  return STAGE_EFFORT[stage];
}
