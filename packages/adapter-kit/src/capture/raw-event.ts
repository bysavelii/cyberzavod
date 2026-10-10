// Build raw log: a compact event for each agent hook. The model is the same for every agent; each
// adapter turns its own hook payload into these events. Only what the recording needs is taken from
// the payload, without the contents of files and tool responses, so nothing extra gets into the log.

import type { ProjectConfig } from "@cyberzavod/core";
import { isObject, stringField } from "../object.ts";

/** A build raw log event; `ts` is the machine clock time in milliseconds. */
export type RawEvent =
  | {
      ts: number;
      kind: "session_start";
      /** Project id from `.cyberzavod/project.json`; comes with `harness` and `workflow`. */
      project?: string;
      /** Harness version from `.cyberzavod/project.json`; comes together with `project`. */
      harness?: string;
      /** Development workflow from `.cyberzavod/project.json`; comes together with `project`. */
      workflow?: string;
    }
  | {
      ts: number;
      kind: "prompt";
      text: string;
      /**
       * The stop hook gave up before this prompt and called the human: the prompt is a call by
       * the stop hook. Set by `markAfterStopGate` when it finds the hook's mark.
       */
      afterStopGate?: true;
    }
  | {
      ts: number;
      kind: "question_answer";
      /** The human's answers to the model's questions as "question — answer" lines. */
      text: string;
      agentId?: string;
    }
  | {
      ts: number;
      kind: "tool";
      tool: string;
      ok: boolean;
      command?: string;
      file?: string;
      /** Directory the session or subagent was in when the tool was called. */
      cwd?: string;
      /** Subagent that called the tool; a main session call has no such field. */
      agentId?: string;
      /** The agent's id of the call, for agents whose transcript names the call by it. */
      callId?: string;
    }
  | {
      ts: number;
      kind: "subagent_start";
      agent: string;
      agentId?: string;
      /**
       * The subagent's transcript, for agents that give it at the start: a run cut off before it
       * stopped still has its tokens and report.
       */
      transcriptPath?: string;
    }
  | {
      ts: number;
      kind: "subagent_stop";
      agent: string;
      agentId?: string;
      transcriptPath?: string;
      /** First line of the subagent's reply: for /feature pipeline stations it is the verdict. */
      verdict?: string;
    }
  | { ts: number; kind: "subagent_report"; agentId: string; verdict?: string }
  | { ts: number; kind: "stop"; transcriptPath?: string };

/** A human prompt in the build log. */
export type PromptRawEvent = Extract<RawEvent, { kind: "prompt" }>;

/** A session start in the build log. */
export type SessionStartEvent = Extract<RawEvent, { kind: "session_start" }>;

/** Log format error: a parsed line does not look like an event. */
export class RawLogError extends Error {}

/** Bash commands are truncated: the recording needs what was run, not the full text. */
export const MAX_COMMAND_LENGTH = 200;

/** Name of a tool or a subagent when the payload does not give one. */
export const UNKNOWN_NAME = "unknown";

// A verdict is a short line like "NEEDS WORK"; a long first line is already the report itself.
const MAX_VERDICT_LENGTH = 40;
// Decoration around a verdict: **APPROVED**, `DEFECT`, # APPROVED, "NEEDS WORK.".
const VERDICT_MARKUP = /[*_`#]/g;
const TRAILING_PUNCTUATION = /[.:!]+$/;
// Environment marks before a subagent report are in square brackets; they are not a verdict.
const HARNESS_NOTE_START = "[";
// session_id goes into the log file name, so only safe characters are allowed.
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function withoutVerdictMarkup(line: string): string {
  return line.replace(VERDICT_MARKUP, "").trim().replace(TRAILING_PUNCTUATION, "");
}

/**
 * The verdict of a subagent's reply: only the first line goes into the log, because pipeline
 * stations start with the verdict and the rest of the report is not needed for the recording.
 * @param {string | undefined} reply Text of the reply.
 * @returns {string | undefined} The first line without decoration, or undefined if the reply has no
 *   short first line.
 */
export function verdictOf(reply: string | undefined): string | undefined {
  const lines = reply?.split("\n").map(withoutVerdictMarkup);
  const firstLine = lines?.find((line) => line !== "" && !line.startsWith(HARNESS_NOTE_START));

  return firstLine !== undefined && firstLine.length <= MAX_VERDICT_LENGTH ? firstLine : undefined;
}

/**
 * Name of the subagent in a hook payload; service subagents come with an empty `agent_type`.
 * @param {Record<string, unknown>} payload Hook payload.
 * @returns {string} `agent_type`, or `unknown` if it is missing or empty.
 */
export function subagentNameOf(payload: Record<string, unknown>): string {
  return stringField(payload, "agent_type") || UNKNOWN_NAME;
}

/**
 * Adds the optional fields that are present, so undefined does not pile up in the log. `Partial<T>`
 * makes a typo in a field name fail to compile.
 * @param {T} event Event with its required fields.
 * @param {Partial<T>} fields Optional fields; the ones that are undefined are skipped.
 * @returns {T} New event.
 */
export function withOptional<T extends object>(event: T, fields: Partial<T>): T {
  const present = Object.entries(fields).filter(([, value]) => value !== undefined);

  return { ...event, ...Object.fromEntries(present) };
}

/**
 * Tags a session start with the project, harness version and workflow from the project config.
 * @param {SessionStartEvent} event Session start.
 * @param {ProjectConfig} config Config of the project the session runs in.
 * @returns {SessionStartEvent} New event with `project`, `harness` and `workflow`.
 */
export function stampProject(event: SessionStartEvent, config: ProjectConfig): SessionStartEvent {
  return {
    ...event,
    project: config.projectId,
    harness: config.harness,
    workflow: config.workflow,
  };
}

/**
 * Marks a prompt as a call by the stop hook: the hook gave up before it and called the human.
 * @param {PromptRawEvent} event Human prompt.
 * @returns {PromptRawEvent} New prompt with `afterStopGate`.
 */
export function markAfterStopGate(event: PromptRawEvent): PromptRawEvent {
  return { ...event, afterStopGate: true };
}

/**
 * Checks that a session id can be used in the log file name.
 * @param {unknown} value session_id value from the hook payload.
 * @returns {value is string} true if the id can go into the log file name.
 */
export function isSafeSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

// A session start carries the project, harness version and workflow only together, and none without
// a project marker.
function isUnstamped(value: Record<string, unknown>): boolean {
  return value.project === undefined && value.harness === undefined && value.workflow === undefined;
}

function isStamped(value: Record<string, unknown>): boolean {
  return (
    typeof value.project === "string" &&
    typeof value.harness === "string" &&
    typeof value.workflow === "string"
  );
}

// Required fields check for each event kind. The type requires an entry for each kind:
// a new kind in RawEvent does not compile until its check is described here.
const RAW_EVENT_SHAPES: Record<RawEvent["kind"], (value: Record<string, unknown>) => boolean> = {
  session_start: (value) => isUnstamped(value) || isStamped(value),
  prompt: (value) =>
    typeof value.text === "string" &&
    (value.afterStopGate === undefined || value.afterStopGate === true),
  question_answer: (value) => typeof value.text === "string",
  tool: (value) => typeof value.tool === "string" && typeof value.ok === "boolean",
  subagent_start: (value) => typeof value.agent === "string",
  subagent_stop: (value) => typeof value.agent === "string",
  subagent_report: (value) => typeof value.agentId === "string",
  stop: () => true,
};

function isRawEventKind(kind: string): kind is RawEvent["kind"] {
  return Object.hasOwn(RAW_EVENT_SHAPES, kind);
}

function isRawEvent(value: unknown): value is RawEvent {
  if (!isObject(value) || typeof value.ts !== "number" || typeof value.kind !== "string") {
    return false;
  }

  return isRawEventKind(value.kind) && RAW_EVENT_SHAPES[value.kind](value);
}

/**
 * Reads a build log. A line that does not parse as JSON is a cut-off asynchronous
 * write and is skipped.
 * @param {string} content Log contents in JSONL format.
 * @returns {RawEvent[]} Log events in line order.
 * @throws {RawLogError} If a parsed line is not a log event.
 */
export function parseRawLog(content: string): RawEvent[] {
  const events: RawEvent[] = [];

  content.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;

    let value: unknown;

    try {
      value = JSON.parse(line);
    } catch {
      return;
    }

    if (!isRawEvent(value)) throw new RawLogError(`line ${index + 1}: not a log event`);

    events.push(value);
  });

  return events;
}
