// What the scripted model does in each end-to-end run. The model has no memory: every request
// carries the whole conversation, so the next step is read off the calls already in it.

import type { InputItem, ModelRequest, ModelTurn, Scenario } from "./mock-responses.ts";
import { FIX_FILE } from "./project.ts";

/** The task the main model gives the reviewer. */
export const REVIEW_ASSIGNMENT = "Review the change in src/app.js.";

/** The reviewer's reply: the first line is its verdict. */
export const REVIEW_REPLY = "APPROVED\n\nNo defects found.";

/** What the main model says when it thinks it is done. */
export const DONE_REPLY = "Done.";

/** The command the main model runs to read the secret the guard protects. */
export const SECRET_COMMAND = "cat .env";

const HOOK_PROMPT_PREFIX = "<hook_prompt";
const CALL_TYPES = new Set(["function_call", "custom_tool_call", "tool_search_call"]);
// The namespace of the multi-agent tools that Codex offers the default model.
const COLLABORATION_NAMESPACE = "collaboration";

function textOf(item: InputItem): string {
  return (item.content ?? []).map((part) => part.text ?? "").join("");
}

function isUserMessage(item: InputItem): boolean {
  return item.type === "message" && item.role === "user";
}

function callsIn(request: ModelRequest): number {
  return request.input.filter((item) => CALL_TYPES.has(item.type ?? "")).length;
}

/**
 * How many times a Stop hook has sent the model back to work in the conversation.
 * @param {ModelRequest} request The request of the model's turn.
 * @returns {number} The number of hook prompts.
 */
export function hookPromptsIn(request: ModelRequest): number {
  return request.input.filter(
    (item) => isUserMessage(item) && textOf(item).startsWith(HOOK_PROMPT_PREFIX),
  ).length;
}

// The reviewer gets its assignment as a message from the main agent; in the main agent's own
// conversation the assignment is only an argument of the `spawn_agent` call.
function isReviewer(request: ModelRequest): boolean {
  return request.input.some(
    (item) => item.type === "agent_message" && JSON.stringify(item).includes(REVIEW_ASSIGNMENT),
  );
}

function patchOf(...lines: string[]): ModelTurn {
  return { kind: "apply_patch", patch: ["*** Begin Patch", ...lines, "*** End Patch"].join("\n") };
}

function reviewerTurn(request: ModelRequest): ModelTurn {
  return callsIn(request) === 0
    ? { kind: "function_call", name: "exec_command", arguments: { cmd: "echo reviewing" } }
    : { kind: "message", text: REVIEW_REPLY };
}

// The main model's day: it finds the multi-agent tools, has the reviewer look at the code, tries
// to read the secret, edits the code and says it is done. The stop hook finds the check red and
// sends it back; it adds the file the check wants and says it is done again.
const FEATURE_STEPS: readonly ((request: ModelRequest) => ModelTurn)[] = [
  () => ({
    kind: "function_call",
    namespace: COLLABORATION_NAMESPACE,
    name: "spawn_agent",
    arguments: {
      task_name: "review_change",
      message: REVIEW_ASSIGNMENT,
      agent_type: "reviewer",
      fork_turns: "none",
    },
  }),
  () => ({
    kind: "function_call",
    namespace: COLLABORATION_NAMESPACE,
    name: "wait_agent",
    arguments: { timeout_ms: 10_000 },
  }),
  () => ({ kind: "function_call", name: "exec_command", arguments: { cmd: SECRET_COMMAND } }),
  () =>
    patchOf(
      "*** Update File: src/app.js",
      "@@",
      '-export const greeting = "hello";',
      '+export const greeting = "hello, world";',
    ),
  (request) =>
    hookPromptsIn(request) === 0
      ? { kind: "message", text: DONE_REPLY }
      : patchOf(`*** Add File: ${FIX_FILE}`, "+fixed"),
];

/**
 * The full workflow: the reviewer subagent, the guard, an edit, a rejection by the stop hook and
 * the fix after it.
 * @param {ModelRequest} request The request of the model's turn.
 * @returns {ModelTurn} What the model does.
 */
export const featureScenario: Scenario = (request) => {
  if (isReviewer(request)) return reviewerTurn(request);

  const step = FEATURE_STEPS[callsIn(request)];

  return step === undefined ? { kind: "message", text: DONE_REPLY } : step(request);
};

/**
 * A model that edits the code and then never fixes the check: the stop hook sends it back until it
 * gives up and calls the human.
 * @param {ModelRequest} request The request of the model's turn.
 * @returns {ModelTurn} What the model does.
 */
export const stubbornScenario: Scenario = (request) =>
  callsIn(request) === 0
    ? patchOf(
        "*** Update File: util.js",
        "@@",
        "-export const answer = 41;",
        "+export const answer = 42;",
      )
    : { kind: "message", text: DONE_REPLY };

/** The address the sandbox probe tries to reach: the sandbox has no network. */
export const NETWORK_PROBE_ADDRESS = "https://registry.npmjs.org/";

/** Start of the line that tells how the network probe ended; the exit code follows it. */
export const CURL_EXIT_PREFIX = "curl-exit-";

/** What the model says after the sandbox probe. */
export const PROBE_DONE_REPLY = "Probed.";

// The capture hooks write asynchronously and the model answers at once: wait for the raw log
// before the draft reads it.
const WAIT_FOR_RAW_LOG =
  "for i in $(seq 50); do ls .cyberzavod/journal/capture/codex/raw/*.jsonl >/dev/null 2>&1 && break; sleep 0.2; done";

/**
 * The recording skill's first step as the model runs it: the draft command of the pinned version
 * in the sandbox, then a try at the network to show the sandbox is the one without it.
 * @param {string} version Version of the package, as the skills write it into commands.
 * @returns {Scenario} The scenario.
 */
export function sandboxScenario(version: string): Scenario {
  const steps: readonly string[] = [
    `${WAIT_FOR_RAW_LOG}; npx cyberzavod@${version} draft 2>&1`,
    `curl -sS --max-time 5 -o /dev/null ${NETWORK_PROBE_ADDRESS} 2>&1; echo "${CURL_EXIT_PREFIX}$?"`,
  ];

  return (request) => {
    const cmd = steps[callsIn(request)];

    return cmd === undefined
      ? { kind: "message", text: PROBE_DONE_REPLY }
      : { kind: "function_call", name: "exec_command", arguments: { cmd } };
  };
}
