// What the recording takes from a Codex hook payload: the payload becomes a compact raw log event,
// without the contents of files, patches, tool responses and assignments to subagents.

import path from "node:path";
import {
  isObject,
  MAX_COMMAND_LENGTH,
  stringField,
  subagentNameOf,
  UNKNOWN_NAME,
  verdictOf,
  withOptional,
  type RawEvent,
} from "@cyberzavod/adapter-kit";
import { PATCH_TOOL, SHELL_TOOL } from "../generate/codex.ts";
import { patchPaths } from "../patch-paths.ts";

type HookPayload = Record<string, unknown>;
type ToolEvent = Extract<RawEvent, { kind: "tool" }>;

// The subagent's prompt is the assignment the main session gave it; the human did not write it, so
// it is no prompt of the recording. Its text is not kept either.
function promptEvent(payload: HookPayload, ts: number): RawEvent | null {
  const text = stringField(payload, "prompt");
  const isSubagentAssignment = stringField(payload, "agent_id") !== undefined;

  if (text === undefined || isSubagentAssignment) return null;

  return { ts, kind: "prompt", text };
}

// The file the patch touches first; paths in the patch are relative to the directory of the call.
function patchedFile(input: HookPayload, cwd: string | undefined): string | undefined {
  const patch = stringField(input, "command");
  const [first] = patch === undefined ? [] : patchPaths(patch);

  if (first === undefined) return undefined;

  return cwd === undefined ? first : path.resolve(cwd, first);
}

// What each tool adds to the event. Other tools give only their name: what they were asked and what
// they answered stays out of the log.
function toolDetails(payload: HookPayload, name: string): Partial<ToolEvent> {
  const input = isObject(payload.tool_input) ? payload.tool_input : {};

  switch (name) {
    case SHELL_TOOL:
      return {
        command: stringField(input, "command")?.slice(0, MAX_COMMAND_LENGTH),
        callId: stringField(payload, "tool_use_id"),
      };
    case PATCH_TOOL:
      return { file: patchedFile(input, stringField(payload, "cwd")) };
    default:
      return {};
  }
}

// Subagent tools come in the same session: `agentId` tells a subagent call from a main session
// call, and `cwd` gives the project the command ran in. Codex has no failed-tool event: a call
// that reaches PostToolUse is recorded as done.
function toolEvent(payload: HookPayload, ts: number): RawEvent {
  const name = stringField(payload, "tool_name") ?? UNKNOWN_NAME;

  return withOptional<ToolEvent>(
    { ts, kind: "tool", tool: name, ok: true },
    {
      ...toolDetails(payload, name),
      cwd: stringField(payload, "cwd"),
      agentId: stringField(payload, "agent_id"),
    },
  );
}

/**
 * Turns a Codex hook payload into a log event.
 * @param {unknown} payload JSON the hook received on stdin.
 * @param {number} ts Event time in milliseconds.
 * @returns {RawEvent | null} Log event, or null if the hook is not needed for the recording.
 */
export function fromCodexHookPayload(payload: unknown, ts: number): RawEvent | null {
  if (!isObject(payload)) return null;

  switch (stringField(payload, "hook_event_name")) {
    case "SessionStart":
      return { ts, kind: "session_start" };
    case "UserPromptSubmit":
      return promptEvent(payload, ts);
    case "PostToolUse":
      return toolEvent(payload, ts);
    case "SubagentStart":
      return withOptional<Extract<RawEvent, { kind: "subagent_start" }>>(
        { ts, kind: "subagent_start", agent: subagentNameOf(payload) },
        {
          agentId: stringField(payload, "agent_id"),
          transcriptPath: stringField(payload, "transcript_path"),
        },
      );
    case "SubagentStop":
      return withOptional<Extract<RawEvent, { kind: "subagent_stop" }>>(
        { ts, kind: "subagent_stop", agent: subagentNameOf(payload) },
        {
          agentId: stringField(payload, "agent_id"),
          transcriptPath:
            stringField(payload, "agent_transcript_path") ??
            stringField(payload, "transcript_path"),
          verdict: verdictOf(stringField(payload, "last_assistant_message")),
        },
      );
    case "Stop":
      return withOptional<Extract<RawEvent, { kind: "stop" }>>(
        { ts, kind: "stop" },
        { transcriptPath: stringField(payload, "transcript_path") },
      );
    default:
      return null;
  }
}
