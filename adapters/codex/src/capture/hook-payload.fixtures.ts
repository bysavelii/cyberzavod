// Hook payloads as Codex 0.162.1 sends them. The ones marked "live" were captured from a real
// `codex exec` run; absolute paths are replaced with `/project` and `/codex-home`. The ones marked
// "documented" are built from the shape Codex's source and schema give, because the run did not
// produce them.

/** Id of the main session of the live run. */
export const SESSION_ID = "01a124f1-d884-7072-a626-35f8ef505c9e";

/** Id of the subagent the live run spawned. */
export const SUBAGENT_ID = "01a124f1-d983-78f0-b760-8adafc439b0c";

const SESSION_ROLLOUT = `/codex-home/sessions/2026/10/10/rollout-2026-10-10T08-33-11-${SESSION_ID}.jsonl`;

/** Rollout of the subagent of the live run. */
export const SUBAGENT_ROLLOUT = `/codex-home/sessions/2026/10/10/rollout-2026-10-10T08-33-12-${SUBAGENT_ID}.jsonl`;
const TURN_ID = "01a124f1-d8b2-7b81-9836-214836be2e83";
const SUBAGENT_TURN_ID = "01a124f1-d9b7-7341-bac0-66e50410e105";

/** A hook payload: the JSON object the hook receives on stdin. */
export type HookPayload = Record<string, unknown>;

function mainSession(hookEventName: string): HookPayload {
  return {
    session_id: SESSION_ID,
    turn_id: TURN_ID,
    transcript_path: SESSION_ROLLOUT,
    cwd: "/project",
    hook_event_name: hookEventName,
    model: "gpt-5.5",
    permission_mode: "bypassPermissions",
  };
}

function subagentSession(hookEventName: string): HookPayload {
  return {
    ...mainSession(hookEventName),
    turn_id: SUBAGENT_TURN_ID,
    transcript_path: SUBAGENT_ROLLOUT,
    agent_id: SUBAGENT_ID,
    agent_type: "reviewer",
  };
}

/**
 * Live: the session starts.
 * @returns {HookPayload} The payload.
 */
export function sessionStartPayload(): HookPayload {
  return {
    session_id: SESSION_ID,
    transcript_path: SESSION_ROLLOUT,
    cwd: "/project",
    hook_event_name: "SessionStart",
    model: "gpt-5.5",
    permission_mode: "bypassPermissions",
    source: "startup",
  };
}

/**
 * Live: the human sends a prompt.
 * @param {string} [prompt] Text of the prompt.
 * @returns {HookPayload} The payload.
 */
export function promptPayload(prompt = "do review"): HookPayload {
  return { ...mainSession("UserPromptSubmit"), prompt };
}

/**
 * Live: a spawned subagent receives its assignment as a prompt.
 * @returns {HookPayload} The payload.
 */
export function subagentAssignmentPayload(): HookPayload {
  return { ...subagentSession("UserPromptSubmit"), prompt: "review the change" };
}

/**
 * Live: the main session called `spawn_agent`.
 * @returns {HookPayload} The payload.
 */
export function spawnAgentPayload(): HookPayload {
  return {
    ...mainSession("PostToolUse"),
    tool_name: "spawn_agent",
    tool_input: { message: "review the change", agent_type: "reviewer" },
    tool_response: `{"agent_id":"${SUBAGENT_ID}","nickname":"Epicurus"}`,
    tool_use_id: "cr2",
  };
}

/**
 * Documented: the main session called `wait_agent`, a tool Codex names with its namespace.
 * @returns {HookPayload} The payload.
 */
export function waitAgentPayload(): HookPayload {
  return {
    ...mainSession("PostToolUse"),
    tool_name: "multi_agent_v1wait_agent",
    tool_input: { timeout_ms: 30000 },
    tool_response: "{}",
    tool_use_id: "cr3",
  };
}

/**
 * Documented: the main session ran a shell command.
 * @param {string} [command] The command.
 * @returns {HookPayload} The payload.
 */
export function shellPayload(command = "cat package.json"): HookPayload {
  return {
    ...mainSession("PostToolUse"),
    tool_name: "Bash",
    tool_input: { command },
    tool_response: '{ "name": "secret-output" }\n',
    tool_use_id: "call_shell",
  };
}

/**
 * Documented: a subagent ran a shell command.
 * @returns {HookPayload} The payload.
 */
export function subagentShellPayload(): HookPayload {
  return {
    ...subagentSession("PostToolUse"),
    tool_name: "Bash",
    tool_input: { command: "echo child-tool" },
    tool_response: "child-tool\n",
    tool_use_id: "cr5",
  };
}

/** The patch of the apply_patch payloads: it adds a file and edits and moves another. */
export const PATCH_TEXT = [
  "*** Begin Patch",
  "*** Add File: note.txt",
  "+the secret text of the patch",
  "*** Update File: src/app.ts",
  "*** Move to: src/main.ts",
  "@@",
  "-old",
  "+new",
  "*** End Patch",
].join("\n");

/**
 * Documented: the main session applied a patch.
 * @param {string} [patch] Text of the patch.
 * @returns {HookPayload} The payload.
 */
export function applyPatchPayload(patch = PATCH_TEXT): HookPayload {
  return {
    ...mainSession("PostToolUse"),
    tool_name: "apply_patch",
    tool_input: { command: patch },
    tool_response: "Exit code: 0\nSuccess. Updated the following files:\nA note.txt\n",
    tool_use_id: "call_patch",
  };
}

/**
 * Live: a subagent was started.
 * @returns {HookPayload} The payload.
 */
export function subagentStartPayload(): HookPayload {
  return subagentSession("SubagentStart");
}

/**
 * Documented: a subagent finished and handed back its reply.
 * @param {string} [reply] Its last message.
 * @returns {HookPayload} The payload.
 */
export function subagentStopPayload(reply = "APPROVED\n\nNo defects found."): HookPayload {
  return {
    ...subagentSession("SubagentStop"),
    agent_transcript_path: SUBAGENT_ROLLOUT,
    stop_hook_active: false,
    last_assistant_message: reply,
  };
}

/**
 * Live: the main session wants to finish the turn.
 * @returns {HookPayload} The payload.
 */
export function stopPayload(): HookPayload {
  return {
    ...mainSession("Stop"),
    stop_hook_active: false,
    last_assistant_message: "parent done",
  };
}
