// Tokens, models, texts and tool outcomes from a Codex rollout (JSONL). The rollout format is
// internal and may change, so parsing is lenient: lines it does not understand are skipped.
//
// A line is `{"timestamp", "type", "payload"}`. Codex 0.162.1 writes the "paginated" history (the
// model's messages are `response_item` lines); older versions wrote the "legacy" one (the model's
// messages are `event_msg` lines `agent_message`), and both are read.
//
// A response's tokens are written by kind: input the cache did not serve, input it served, and
// output. The counter (`countedTokensOf`) leaves out the cache reads: it is the same context reread
// at every step, and it would inflate the counter many times over. This is the same rule as for
// Claude Code.

import type {
  AgentAssignment,
  AgentReport,
  ModelReply,
  TimedTokenUsage,
  TranscriptText,
} from "@cyberzavod/adapter-kit";
import { isObject } from "@cyberzavod/adapter-kit";
import { NO_BREAKDOWN, type TokenBreakdown } from "@cyberzavod/core";

interface RolloutLine {
  ts: number;
  type: string;
  payload: Record<string, unknown>;
}

const PARAGRAPH_SEPARATOR = "\n\n";
const ASSISTANT_ROLE = "assistant";
const TEXT_PART = "output_text";
const SPAWN_TOOL = "spawn_agent";
// The tools that give a task to an agent that already runs: `send_input` of the first multi-agent
// tools and `followup_task` of the collaboration tools.
const SEND_TOOLS: ReadonlySet<string> = new Set(["send_input", "followup_task"]);
// The collaboration tools name an agent by its task path; the root session's tasks are under it.
const ROOT_TASK_PATH = "/root";
const ACTIVITY_ITEM = "SubAgentActivity";
const STARTED_KIND = "started";
// How the tools that run a command report the exit code in the header of their output, before the
// line that starts the command's own output.
const EXIT_CODE_LINE = /^(?:Process exited with code|Exit code:) (-?\d+)\s*$/m;
const OUTPUT_START = /^Output:/m;
const COMMAND_ITEM = "CommandExecution";
const COMPLETED_STATUS = "completed";

function lineOf(text: string): RolloutLine | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isObject(parsed)) return null;

  const { timestamp, type, payload } = parsed;
  const ts = typeof timestamp === "string" ? Date.parse(timestamp) : Number.NaN;

  if (Number.isNaN(ts) || typeof type !== "string" || !isObject(payload)) return null;

  return { ts, type, payload };
}

function linesOf(rollout: string): RolloutLine[] {
  return rollout.split("\n").flatMap((text) => {
    const line = lineOf(text);

    return line === null ? [] : [line];
  });
}

// The text of a model message: its text parts in a row.
function assistantTextOf(line: RolloutLine): string | undefined {
  const { payload } = line;

  if (line.type !== "response_item" || payload.type !== "message") return undefined;
  if (payload.role !== ASSISTANT_ROLE || !Array.isArray(payload.content)) return undefined;

  const parts = payload.content.filter(isObject).flatMap((part) => {
    const { text } = part;

    return part.type === TEXT_PART && typeof text === "string" && text.trim() !== ""
      ? [text.trim()]
      : [];
  });

  return parts.length === 0 ? undefined : parts.join(PARAGRAPH_SEPARATOR);
}

// The legacy history has no `response_item` messages, only the events of the same messages.
function legacyTextOf(line: RolloutLine): string | undefined {
  const { payload } = line;
  const text = payload.message;

  if (line.type !== "event_msg" || payload.type !== "agent_message") return undefined;

  return typeof text === "string" && text.trim() !== "" ? text.trim() : undefined;
}

function textsWith(
  lines: readonly RolloutLine[],
  textOf: (line: RolloutLine) => string | undefined,
): TranscriptText[] {
  return lines.flatMap((line) => {
    const text = textOf(line);

    return text === undefined ? [] : [{ ts: line.ts, text }];
  });
}

/**
 * Collects the model's reply texts from the rollout: final replies to the human come from here.
 * @param {string} rollout Rollout contents in JSONL format.
 * @returns {TranscriptText[]} Model messages from earliest to latest.
 */
export function rolloutAnswers(rollout: string): TranscriptText[] {
  const lines = linesOf(rollout);
  const messages = textsWith(lines, assistantTextOf);
  const texts = messages.length > 0 ? messages : textsWith(lines, legacyTextOf);

  return texts.sort((a, b) => a.ts - b.ts);
}

// The model a turn runs on, named by its `turn_context` line.
function turnModelOf({ type, payload }: RolloutLine): string | undefined {
  return type === "turn_context" && typeof payload.model === "string" ? payload.model : undefined;
}

/**
 * Collects model replies from the rollout by time: they show which model received a prompt. A
 * `turn_context` line, which names the model, is written before the prompt reaches the rollout, so
 * a reply is dated by the last line of its turn: the first reply that ends after a prompt is the
 * one that answered it.
 * @param {string} rollout Rollout contents in JSONL format.
 * @returns {ModelReply[]} One reply per `turn_context`, from earliest to latest.
 */
export function rolloutModelReplies(rollout: string): ModelReply[] {
  const replies: ModelReply[] = [];

  for (const line of linesOf(rollout)) {
    const model = turnModelOf(line);
    const last = replies.at(-1);

    if (model !== undefined) replies.push({ ts: line.ts, model });
    else if (last !== undefined) last.ts = Math.max(last.ts, line.ts);
  }

  return replies;
}

// The rollout format is internal: a count that is not a non-negative integer is taken as zero.
function countOf(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

// `reasoning_output_tokens` is part of `output_tokens`, so it is not added again. The cache write
// (`cache_write_input_tokens`) is not read: OpenAI does not price it apart from the input.
function responseBreakdownOf(payload: Record<string, unknown>): TokenBreakdown | undefined {
  const { usage } = payload;

  if (!isObject(usage)) return undefined;

  const count = (field: string) => countOf(usage[field]);
  const cacheRead = count("cached_input_tokens");

  return {
    ...NO_BREAKDOWN,
    input: Math.max(0, count("input_tokens") - cacheRead),
    output: count("output_tokens"),
    cacheRead,
  };
}

// The thread's own id: the run's `agent_id` in the hooks is the id of its thread.
function threadIdOf(lines: readonly RolloutLine[]): string | undefined {
  const meta = lines.find(({ type }) => type === "session_meta");
  const id = meta?.payload.id;

  return typeof id === "string" && id !== "" ? id : undefined;
}

// A forked thread carries the records of its parent: they belong to the parent's rollout, which is
// counted on its own. A record that names no thread is taken as the rollout's own.
function isOwnRecord(payload: Record<string, unknown>, threadId: string | undefined): boolean {
  const recordThread = payload.thread_id;

  return threadId === undefined || typeof recordThread !== "string" || recordThread === threadId;
}

// Every model response has a `token_usage_record`; the same response must be counted once. The
// model is the one the last `turn_context` before the record named.
function responseUsages(rollout: string): TimedTokenUsage[] {
  const lines = linesOf(rollout);
  const threadId = threadIdOf(lines);
  const seen = new Set<string>();
  const usages: TimedTokenUsage[] = [];
  let model: string | undefined;

  for (const line of lines) {
    const { ts, type, payload } = line;

    model = turnModelOf(line) ?? model;

    const breakdown = type === "token_usage_record" ? responseBreakdownOf(payload) : undefined;
    const responseId = typeof payload.response_id === "string" ? payload.response_id : undefined;

    if (breakdown === undefined || !isOwnRecord(payload, threadId)) continue;
    if (responseId !== undefined && seen.has(responseId)) continue;
    if (responseId !== undefined) seen.add(responseId);

    usages.push({ ts, breakdown, ...(model === undefined ? {} : { model }) });
  }

  return usages;
}

/**
 * Splits rollout tokens by model response: a run's tokens are summed by model, and main session
 * tokens are divided between builds by their time.
 * @param {string} rollout Rollout contents in JSONL format.
 * @returns {TimedTokenUsage[]} Tokens of each distinct response by kind, with the model of its
 *   turn, from earliest to latest.
 */
export function rolloutTokenUsages(rollout: string): TimedTokenUsage[] {
  return responseUsages(rollout).sort((a, b) => a.ts - b.ts);
}

function argumentsOf(payload: Record<string, unknown>): Record<string, unknown> {
  const { arguments: raw } = payload;

  if (isObject(raw)) return raw;
  if (typeof raw !== "string") return {};

  try {
    const parsed: unknown = JSON.parse(raw);

    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// What a call returned, by the call's id.
function outputsByCall(lines: readonly RolloutLine[]): Map<string, string> {
  const outputs = new Map<string, string>();

  for (const { type, payload } of lines) {
    const { call_id: callId, output } = payload;
    const isOutput = type === "response_item" && payload.type === "function_call_output";

    if (isOutput && typeof callId === "string" && typeof output === "string") {
      outputs.set(callId, output);
    }
  }

  return outputs;
}

// The id of a spawned agent is in the result of the `spawn_agent` call of the first multi-agent
// tools.
function spawnedAgentId(output: string | undefined): string | undefined {
  if (output === undefined) return undefined;

  try {
    const parsed: unknown = JSON.parse(output);
    const agentId = isObject(parsed) ? parsed.agent_id : undefined;

    return typeof agentId === "string" && agentId !== "" ? agentId : undefined;
  } catch {
    return undefined;
  }
}

// The collaboration tools answer `spawn_agent` with the task path only; the thread of the new agent
// is named by the `SubAgentActivity` item that Codex writes when the agent starts, with the id of
// the call.
interface StartedAgents {
  /** Thread id of the agent a `spawn_agent` call started, by the call's id. */
  byCall: Map<string, string>;
  /** Thread id by the agent's task path. */
  byPath: Map<string, string>;
}

function startedAgentsOf(lines: readonly RolloutLine[]): StartedAgents {
  const started: StartedAgents = { byCall: new Map(), byPath: new Map() };

  for (const { type, payload } of lines) {
    const item = type === "event_msg" && isObject(payload.item) ? payload.item : undefined;

    if (item?.type !== ACTIVITY_ITEM || item.kind !== STARTED_KIND) continue;

    const { id, agent_thread_id: threadId, agent_path: agentPath } = item;

    if (typeof threadId !== "string") continue;
    if (typeof id === "string") started.byCall.set(id, threadId);
    if (typeof agentPath === "string") started.byPath.set(agentPath, threadId);
  }

  return started;
}

function spawnedAgentOf(
  callId: unknown,
  outputs: ReadonlyMap<string, string>,
  started: StartedAgents,
): string | undefined {
  if (typeof callId !== "string") return undefined;

  return started.byCall.get(callId) ?? spawnedAgentId(outputs.get(callId));
}

// A target is a thread id, a task path or the name of a task under the root.
function targetThreadOf(target: string, started: StartedAgents): string {
  const path = target.startsWith("/") ? target : `${ROOT_TASK_PATH}/${target}`;

  return started.byPath.get(path) ?? target;
}

function assignmentOf(
  line: RolloutLine,
  outputs: ReadonlyMap<string, string>,
  started: StartedAgents,
): AgentAssignment | null {
  const { payload, ts } = line;
  const { name, call_id: callId } = payload;

  if (line.type !== "response_item" || payload.type !== "function_call") return null;
  if (typeof name !== "string") return null;

  const args = argumentsOf(payload);
  const { message } = args;

  if (typeof message !== "string") return null;

  if (name === SPAWN_TOOL && typeof args.agent_type === "string") {
    const agentId = spawnedAgentOf(callId, outputs, started);

    return {
      ts,
      text: message,
      via: "spawn",
      agentType: args.agent_type,
      ...(agentId === undefined ? {} : { agentId }),
    };
  }

  if (SEND_TOOLS.has(name) && typeof args.target === "string") {
    return { ts, text: message, via: "message", agentId: targetThreadOf(args.target, started) };
  }

  return null;
}

/**
 * Finds tasks the session gave to subagents: `spawn_agent`, `send_input` and `followup_task`
 * calls, in any tool namespace.
 * @param {string} rollout Session rollout contents in JSONL format.
 * @returns {AgentAssignment[]} Tasks from earliest to latest; a task for a new run has `agentId`
 *   if the call result or the start of the agent was found in the rollout.
 */
export function rolloutAssignments(rollout: string): AgentAssignment[] {
  const lines = linesOf(rollout);
  const outputs = outputsByCall(lines);
  const started = startedAgentsOf(lines);

  return lines
    .map((line) => assignmentOf(line, outputs, started))
    .filter((assignment) => assignment !== null)
    .sort((a, b) => a.ts - b.ts);
}

// The turns this thread ran itself, by the usage records with its id; a forked thread's rollout also
// holds its parent's turns. Without usage records that name a thread, no turn is known to be
// foreign.
function ownTurnsOf(
  lines: readonly RolloutLine[],
  threadId: string | undefined,
): Set<string> | null {
  const turns = new Set<string>();
  let hasThreadRecords = false;

  for (const { type, payload } of lines) {
    const { thread_id: recordThread, turn_id: turnId } = payload;

    if (type !== "token_usage_record" || typeof recordThread !== "string") continue;

    hasThreadRecords = true;

    if (recordThread === threadId && typeof turnId === "string") turns.add(turnId);
  }

  return hasThreadRecords ? turns : null;
}

function isOwnTurn(
  payload: Record<string, unknown>,
  ownTurns: ReadonlySet<string> | null,
): boolean {
  const turnId = payload.turn_id;

  return ownTurns === null || typeof turnId !== "string" || ownTurns.has(turnId);
}

function isTurnStart({ type, payload }: RolloutLine): boolean {
  return type === "turn_context" || (type === "event_msg" && payload.type === "task_started");
}

function lastMessageOf(payload: Record<string, unknown>): string | undefined {
  const message = payload.last_agent_message;

  return typeof message === "string" && message.trim() !== "" ? message : undefined;
}

/**
 * Finds the reports of a subagent's runs in its rollout: one per finished turn, the turn's last
 * message to the session, or, if there was none, the turn's last model text.
 * @param {string} rollout Subagent rollout contents in JSONL format.
 * @returns {AgentReport[]} Reports from earliest to latest; a turn without any text is skipped, and
 *   a rollout without its own id gives none.
 */
export function rolloutReports(rollout: string): AgentReport[] {
  const lines = linesOf(rollout);
  const agentId = threadIdOf(lines);
  const ownTurns = ownTurnsOf(lines, agentId);
  const reports: AgentReport[] = [];
  let lastText: TranscriptText | undefined;

  if (agentId === undefined) return reports;

  for (const line of lines) {
    const text = assistantTextOf(line) ?? legacyTextOf(line);
    const isTurnEnd = line.type === "event_msg" && line.payload.type === "task_complete";

    // A fork made in the middle of a turn begins with the parent's unfinished text: it is not the
    // report of the thread's own turn that follows.
    if (isTurnStart(line) && isOwnTurn(line.payload, ownTurns)) lastText = undefined;

    if (text !== undefined) lastText = { ts: line.ts, text };

    if (!isTurnEnd) continue;

    const report = lastMessageOf(line.payload) ?? lastText?.text;

    if (report !== undefined && isOwnTurn(line.payload, ownTurns)) {
      reports.push({ ts: line.ts, agentId, text: report });
    }

    lastText = undefined;
  }

  if (lastText !== undefined) reports.push({ ...lastText, agentId });

  return reports;
}

function commandOutcomeOf(payload: Record<string, unknown>): [string, boolean] | undefined {
  const { item } = payload;

  if (payload.type !== "item_completed" || !isObject(item) || item.type !== COMMAND_ITEM) {
    return undefined;
  }

  const { id, status, exit_code: exitCode } = item;

  if (typeof id !== "string") return undefined;
  if (status === "failed" || status === "declined") return [id, false];
  if (status === COMPLETED_STATUS && typeof exitCode === "number") return [id, exitCode === 0];

  return undefined;
}

// The fallback when the rollout has no command item: the exit code is in the call's output.
function outcomeFromOutput(output: string): boolean | undefined {
  const outputStart = output.search(OUTPUT_START);
  const header = outputStart === -1 ? output : output.slice(0, outputStart);
  const code = EXIT_CODE_LINE.exec(header)?.[1];

  return code === undefined ? undefined : Number(code) === 0;
}

/**
 * Finds whether the commands the session ran succeeded: the hook records a call as done and
 * cannot know.
 * @param {string} rollout Session rollout contents in JSONL format.
 * @returns {Map<string, boolean>} Success by call id; a call whose result is not in the rollout
 *   (it may still have been running) is missing.
 */
export function rolloutToolOutcomes(rollout: string): Map<string, boolean> {
  const lines = linesOf(rollout);
  const outcomes = new Map<string, boolean>();

  for (const [callId, output] of outputsByCall(lines)) {
    const outcome = outcomeFromOutput(output);

    if (outcome !== undefined) outcomes.set(callId, outcome);
  }

  for (const { type, payload } of lines) {
    const outcome = type === "event_msg" ? commandOutcomeOf(payload) : undefined;

    if (outcome !== undefined) outcomes.set(...outcome);
  }

  return outcomes;
}
