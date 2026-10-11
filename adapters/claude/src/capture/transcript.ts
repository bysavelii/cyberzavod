// Tokens, models and texts from a Claude Code transcript (JSONL). The transcript format is internal
// and may change, so parsing is lenient: lines it does not understand are skipped.
//
// A message's tokens are written by kind: input, output, cache writes (5 minutes and 1 hour) and
// cache reads, since the price differs by kind. Cache reads do not go into the counter
// (`countedTokensOf`): it is the same context reread at every step, and they would inflate the
// counter many times over.

import {
  isTimedTokenUsage,
  type AgentAssignment,
  type AgentReport,
  type ModelReply,
  type TokenUsage,
  type TranscriptText,
} from "@cyberzavod/adapter-kit";
import type { TokenBreakdown } from "@cyberzavod/core";

// Claude Code service replies (for example, about the session limit) are marked with the
// `<synthetic>` model.
const SERVICE_MODEL_PREFIX = "<";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function entryOf(line: string): Record<string, unknown> | null {
  try {
    const entry: unknown = JSON.parse(line);

    return isObject(entry) ? entry : null;
  } catch {
    return null;
  }
}

function timestampOf(entry: Record<string, unknown>): number | undefined {
  const ts = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : Number.NaN;

  return Number.isNaN(ts) ? undefined : ts;
}

interface ParsedUsage {
  messageId: string;
  usage: Record<string, unknown>;
  model?: string;
  ts?: number;
}

function modelOf(message: Record<string, unknown>): string | undefined {
  const { model } = message;

  return typeof model === "string" && !model.startsWith(SERVICE_MODEL_PREFIX) ? model : undefined;
}

function usageOf(line: string): ParsedUsage | null {
  const entry = entryOf(line);
  const message = entry?.message;

  if (entry === null || !isObject(message)) return null;

  const { id, usage } = message;

  if (typeof id !== "string" || !isObject(usage)) return null;

  const ts = timestampOf(entry);
  const model = modelOf(message);

  return {
    messageId: id,
    usage,
    ...(model === undefined ? {} : { model }),
    ...(ts === undefined ? {} : { ts }),
  };
}

function replyOf(line: string): ModelReply | null {
  const entry = entryOf(line);

  if (entry === null || !isObject(entry.message)) return null;

  const model = modelOf(entry.message);
  const ts = timestampOf(entry);

  return model === undefined || ts === undefined ? null : { ts, model };
}

// The transcript format is internal: a count that is not a non-negative integer is taken as zero.
function countOf(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

// Cache writes by lifetime. Older transcripts have only the total, and it counts as 5 minutes, the
// default lifetime; so does the part of the total that the lifetimes do not account for.
function cacheWritesOf(
  usage: Record<string, unknown>,
): Pick<TokenBreakdown, "cacheWrite5m" | "cacheWrite1h"> {
  const byLifetime = isObject(usage.cache_creation) ? usage.cache_creation : {};
  const total = countOf(usage.cache_creation_input_tokens);
  const fiveMinutes = countOf(byLifetime.ephemeral_5m_input_tokens);
  const oneHour = countOf(byLifetime.ephemeral_1h_input_tokens);
  const unaccounted = Math.max(0, total - fiveMinutes - oneHour);

  return { cacheWrite5m: fiveMinutes + unaccounted, cacheWrite1h: oneHour };
}

function breakdownOf(usage: Record<string, unknown>): TokenBreakdown {
  return {
    input: countOf(usage.input_tokens),
    output: countOf(usage.output_tokens),
    cacheRead: countOf(usage.cache_read_input_tokens),
    ...cacheWritesOf(usage),
  };
}

// One model message appears in the transcript several times (in parts of the reply):
// the last variant for each id counts, and the time is taken from the last part that has one.
function messageUsages(transcript: string): TokenUsage[] {
  const byMessage = new Map<string, ParsedUsage>();

  for (const line of transcript.split("\n")) {
    const parsed = usageOf(line);

    if (parsed === null) continue;

    const ts = parsed.ts ?? byMessage.get(parsed.messageId)?.ts;

    byMessage.set(parsed.messageId, { ...parsed, ...(ts === undefined ? {} : { ts }) });
  }

  return [...byMessage.values()].map(({ ts, model, usage }) => ({
    breakdown: breakdownOf(usage),
    ...(model === undefined ? {} : { model }),
    ...(ts === undefined ? {} : { ts }),
  }));
}

/**
 * Splits transcript tokens by model message: a run's tokens are summed by model, and main session
 * tokens are divided between builds by their time.
 * @param {string} transcript Transcript contents in JSONL format.
 * @returns {TokenUsage[]} Tokens of each message by kind, with its model (not a service one) and
 *   time if the transcript has them; messages with a time first, from earliest to latest.
 */
export function tokenUsages(transcript: string): TokenUsage[] {
  const messages = messageUsages(transcript);
  const timed = messages.filter(isTimedTokenUsage).sort((a, b) => a.ts - b.ts);
  const untimed = messages.filter((usage) => !isTimedTokenUsage(usage));

  return [...timed, ...untimed];
}

/**
 * Collects model replies from the transcript by time: they show which model received a prompt.
 * @param {string} transcript Transcript contents in JSONL format.
 * @returns {ModelReply[]} Model replies from earliest to latest, without service ones.
 */
export function modelReplies(transcript: string): ModelReply[] {
  return transcript
    .split("\n")
    .map(replyOf)
    .filter((reply) => reply !== null)
    .sort((a, b) => a.ts - b.ts);
}

/** A transcript entry that has a message and a time. */
interface Entry {
  uuid?: string;
  role: "user" | "assistant";
  ts: number;
  message: Record<string, unknown>;
  agentId?: string;
  /** Tool result: for `Agent` it holds the `agentId` of the launched subagent. */
  toolUseResult?: Record<string, unknown>;
}

const PARAGRAPH_SEPARATOR = "\n\n";
const ASSISTANT_ROLE = "assistant";
const USER_ROLE = "user";
// Openings of environment messages in the user role: not a new task but a service insertion.
const SERVICE_ENTRY_PREFIXES: readonly string[] = ["<system-reminder>", "[SYSTEM NOTIFICATION"];
const AGENT_TOOL = "Agent";
const SEND_MESSAGE_TOOL = "SendMessage";
const HANDBACK_TOOL = "SubagentHandback";

function entryOfLine(line: string): Entry | null {
  const entry = entryOf(line);

  if (entry === null || !isObject(entry.message)) return null;

  const role = entry.type;

  if (role !== ASSISTANT_ROLE && role !== USER_ROLE) return null;

  const ts = timestampOf(entry);

  if (ts === undefined) return null;

  return {
    role,
    ts,
    message: entry.message,
    ...(typeof entry.uuid === "string" ? { uuid: entry.uuid } : {}),
    ...(typeof entry.agentId === "string" ? { agentId: entry.agentId } : {}),
    ...(isObject(entry.toolUseResult) ? { toolUseResult: entry.toolUseResult } : {}),
  };
}

// Entries in line order; the same entry (by uuid) may land in the file twice.
function entriesOf(transcript: string): Entry[] {
  const seen = new Set<string>();
  const entries: Entry[] = [];

  for (const line of transcript.split("\n")) {
    const entry = entryOfLine(line);

    if (entry === null) continue;

    const isRepeat = entry.uuid !== undefined && seen.has(entry.uuid);

    if (isRepeat) continue;
    if (entry.uuid !== undefined) seen.add(entry.uuid);

    entries.push(entry);
  }

  return entries;
}

function isModelEntry(entry: Entry): boolean {
  if (entry.role !== ASSISTANT_ROLE) return false;

  const { model } = entry.message;

  return typeof model !== "string" || !model.startsWith(SERVICE_MODEL_PREFIX);
}

function blocksOf(entry: Entry): Record<string, unknown>[] {
  const { content } = entry.message;

  return Array.isArray(content) ? content.filter(isObject) : [];
}

function textPartsOf(entry: Entry): TranscriptText[] {
  const parts: TranscriptText[] = [];

  for (const block of blocksOf(entry)) {
    const { text } = block;

    if (block.type === "text" && typeof text === "string" && text.trim() !== "") {
      parts.push({ ts: entry.ts, text: text.trim() });
    }
  }

  return parts;
}

// Text blocks of one model reply come as separate entries with a shared message.id:
// the reply is all its texts in a row, and its time is the time of the last of them.
function textsOfEntries(entries: readonly Entry[]): TranscriptText[] {
  const byMessage = new Map<string, TranscriptText[]>();

  entries.forEach((entry, index) => {
    if (!isModelEntry(entry)) return;

    const { id } = entry.message;
    const key = typeof id === "string" ? id : `entry-${index}`;
    const parts = byMessage.get(key) ?? [];

    byMessage.set(key, [...parts, ...textPartsOf(entry)]);
  });

  return [...byMessage.values()]
    .filter((parts) => parts.length > 0)
    .map((parts) => ({
      ts: parts.at(-1)?.ts ?? 0,
      text: parts.map((part) => part.text).join(PARAGRAPH_SEPARATOR),
    }));
}

/**
 * Collects model reply texts from the transcript: final replies to the human come from here.
 * @param {string} transcript Transcript contents in JSONL format.
 * @returns {TranscriptText[]} Model replies from earliest to latest, without service ones.
 */
export function assistantTexts(transcript: string): TranscriptText[] {
  return textsOfEntries(entriesOf(transcript)).sort((a, b) => a.ts - b.ts);
}

function resultCallIdsOf(entry: Entry): string[] {
  return blocksOf(entry).flatMap((block) => {
    const { tool_use_id: callId } = block;

    return block.type === "tool_result" && typeof callId === "string" ? [callId] : [];
  });
}

// A launched subagent is recognized by the result of the `Agent` call: a user entry with a
// `tool_result` block of the same `tool_use_id` and `agentId` in `toolUseResult`.
function agentIdsByCall(entries: readonly Entry[]): Map<string, string> {
  const agentIds = new Map<string, string>();

  for (const entry of entries) {
    const agentId = entry.toolUseResult?.agentId;

    if (entry.role !== USER_ROLE || typeof agentId !== "string") continue;

    for (const callId of resultCallIdsOf(entry)) agentIds.set(callId, agentId);
  }

  return agentIds;
}

function spawnAssignmentOf(
  input: Record<string, unknown>,
  callId: unknown,
  ts: number,
  agentIds: ReadonlyMap<string, string>,
): AgentAssignment | null {
  const { subagent_type: agentType, prompt } = input;

  if (typeof agentType !== "string" || typeof prompt !== "string") return null;

  const agentId = typeof callId === "string" ? agentIds.get(callId) : undefined;

  return {
    ts,
    text: prompt,
    via: "spawn",
    agentType,
    ...(agentId === undefined ? {} : { agentId }),
  };
}

function messageAssignmentOf(input: Record<string, unknown>, ts: number): AgentAssignment | null {
  const { to: agentId, message } = input;

  if (typeof agentId !== "string" || typeof message !== "string") return null;

  return { ts, text: message, via: "message", agentId };
}

function assignmentOf(
  block: Record<string, unknown>,
  ts: number,
  agentIds: ReadonlyMap<string, string>,
): AgentAssignment | null {
  const { name, input, id } = block;

  if (block.type !== "tool_use" || !isObject(input)) return null;
  if (name === AGENT_TOOL) return spawnAssignmentOf(input, id, ts, agentIds);
  if (name === SEND_MESSAGE_TOOL) return messageAssignmentOf(input, ts);

  return null;
}

/**
 * Finds tasks the session gave to subagents: `Agent` and `SendMessage` calls.
 * @param {string} transcript Session transcript contents in JSONL format.
 * @returns {AgentAssignment[]} Tasks from earliest to latest; a task for a new run has
 *   `agentId` if the call result was found in the transcript.
 */
export function agentAssignments(transcript: string): AgentAssignment[] {
  const entries = entriesOf(transcript);
  const agentIds = agentIdsByCall(entries);

  return entries
    .filter(isModelEntry)
    .flatMap((entry) => blocksOf(entry).map((block) => assignmentOf(block, entry.ts, agentIds)))
    .filter((assignment) => assignment !== null)
    .sort((a, b) => a.ts - b.ts);
}

// A subagent run starts with a user entry holding a string: the task or a coordinator message.
function startsRun(entry: Entry): boolean {
  if (entry.role !== USER_ROLE) return false;

  const { content } = entry.message;

  return typeof content === "string" && !SERVICE_ENTRY_PREFIXES.some((p) => content.startsWith(p));
}

function runsOf(entries: readonly Entry[]): Entry[][] {
  const runs: Entry[][] = [];

  for (const entry of entries) {
    if (startsRun(entry)) runs.push([]);

    runs.at(-1)?.push(entry);
  }

  return runs;
}

function handbackOf(entry: Entry): TranscriptText | null {
  const handbacks = blocksOf(entry).flatMap((block) => {
    const { input } = block;
    const isHandback = block.type === "tool_use" && block.name === HANDBACK_TOOL;

    return isHandback && isObject(input) && typeof input.message === "string"
      ? [{ ts: entry.ts, text: input.message }]
      : [];
  });

  return handbacks.at(-1) ?? null;
}

// A run's report is the last hand-back of work, or, if there was none, the last model text.
function reportOfRun(run: readonly Entry[]): TranscriptText | null {
  const handbacks = run.map(handbackOf).filter((handback) => handback !== null);

  const lastText = textsOfEntries(run)
    .sort((a, b) => a.ts - b.ts)
    .at(-1);

  return handbacks.at(-1) ?? lastText ?? null;
}

/**
 * Finds the reports of a subagent's runs in its transcript: one per run.
 * @param {string} transcript Subagent transcript contents in JSONL format.
 * @returns {AgentReport[]} Reports from earliest to latest; a run without a report and entries
 *   without `agentId` are skipped.
 */
export function agentReports(transcript: string): AgentReport[] {
  return runsOf(entriesOf(transcript))
    .flatMap((run) => {
      const agentId = run.find((entry) => entry.agentId !== undefined)?.agentId;
      const report = reportOfRun(run);

      return agentId === undefined || report === null ? [] : [{ ...report, agentId }];
    })
    .sort((a, b) => a.ts - b.ts);
}
