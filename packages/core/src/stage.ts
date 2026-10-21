// Stages and the workflow. A workflow is the order of stages every task goes through; what the
// agent does at a stage is described in the stage's harness skill, and here is only the stage vocabulary
// and validation of the workflow description.

import { isLine, isObject } from "./guards.ts";

/**
 * Workflow stages the factory knows, in the order of the default workflow: plan, code, review,
 * checks, record. A new stage is a new line here, its machine in the factory floor layout and a
 * harness skill with `stage` in its metadata.
 */
export const STAGES = ["planning", "implementation", "review", "verification", "record"] as const;

/** Workflow stage: one of the factory floor stations. */
export type Stage = (typeof STAGES)[number];

/**
 * Checks that a value is a known stage.
 * @param {unknown} value The value to check.
 * @returns {value is Stage} true if it is one of `STAGES`.
 */
export function isStage(value: unknown): value is Stage {
  return (STAGES as readonly unknown[]).includes(value);
}

/** Workflow: a name and stages in order. Described in `harness/workflows/<name>.json`. */
export interface Workflow {
  name: string;
  stages: Stage[];
}

/** Workflow description error: it came from outside and failed validation. */
export class WorkflowError extends Error {}

/**
 * Validates a workflow description read from a file.
 * @param {unknown} raw Parsed JSON of the workflow.
 * @returns {Workflow} The validated workflow; unknown fields are dropped.
 * @throws {WorkflowError} If the name or stages are missing, or a stage is unknown or repeated.
 */
export function parseWorkflow(raw: unknown): Workflow {
  if (!isObject(raw)) throw new WorkflowError("workflow must be an object");

  const { name, stages } = raw;

  if (!isLine(name)) throw new WorkflowError("name must be a non-empty string");
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new WorkflowError("stages must be a non-empty list");
  }

  const unknownStage = stages.find((stage) => !isStage(stage));

  if (unknownStage !== undefined) {
    throw new WorkflowError(`unknown stage ${String(unknownStage)}`);
  }

  const hasDuplicates = new Set(stages).size !== stages.length;

  if (hasDuplicates) throw new WorkflowError("stages are repeated");

  return { name, stages: stages as Stage[] };
}
