// Project journal records: one format for the CLI, the storage and the viewer. A record is an
// envelope (who, when, in which project) plus the data of its type: a work session on a task, a
// decision or a note. The factory floor on the site replays a session from its events, so
// everything visible on screen must be derived from here.

import { isLine, isObject } from "./guards.ts";
import limits from "./record-limits.json" with { type: "json" };
import { isStage, type Stage } from "./stage.ts";

/** Record format version. Adding a new record or event type does not change it. */
export const RECORD_VERSION = 1;

/**
 * Length limits of record text fields, in Unicode code points. `idLength`: ids and the task label;
 * `lineLength`: single-line fields; `textLength`: full texts of messages and interventions. The
 * limits live in `record-limits.json`: the gallery server keeps a copy checked by its tests.
 */
export const RECORD_LIMITS: Readonly<{ idLength: number; lineLength: number; textLength: number }> =
  limits;

/**
 * The human's prompt in clean form: the main instruction in one line and refinements as a list.
 * How the prompt was typed does not get into the recording, only what the human asked for.
 */
export interface PromptEvent {
  t: number;
  type: "prompt";
  goal: string;
  requirements: string[];
  /** Model that received the prompt, an id like `claude-opus-5-5`; absent if unknown. */
  model?: string;
}

/** Factory foreman: the human programmer who hands out tasks and accepts the result. */
export const FOREMAN = "foreman";

/** Participant in a factory floor conversation: a station worker or the foreman. */
export type Speaker = Stage | typeof FOREMAN;

/** Message: a line above the speaker on the factory floor and the full text for the journal. */
export interface MessageEvent {
  t: number;
  type: "message";
  from: Speaker;
  /** Whom the message is addressed to; differs from `from`. */
  to: Speaker;
  /** One line above the speaker on the factory floor. */
  line: string;
  /** Full text: paragraphs separated by a blank line, no markup. */
  text: string;
}

/**
 * What stopped the automation and called the human: an answer to the agent's question, a decision
 * on the plan, a call after reworks, a call by the stop hook. What the human decided is in `line`
 * and `text`.
 */
export const INTERVENTION_REASONS = [
  "question",
  "plan_review",
  "rework_limit",
  "stop_gate",
] as const;

/** Reason for the human's intervention: one of `INTERVENTION_REASONS`. */
export type InterventionReason = (typeof INTERVENTION_REASONS)[number];

/**
 * Human intervention: the station waits for their decision. On the factory floor the foreman goes
 * to the station with the work and says the decision: `line` in the bubble, `text` in the journal.
 * Comes instead of a prompt, not alongside it.
 */
export interface InterventionEvent {
  t: number;
  type: "intervention";
  reason: InterventionReason;
  /** One line above the foreman on the factory floor: the human's decision, said to a worker. */
  line: string;
  /** Full text: paragraphs separated by a blank line, no markup. */
  text: string;
}

/** Entry of the session into a workflow stage: the station starts working. */
export interface StageEnterEvent {
  t: number;
  type: "stage_enter";
  stage: Stage;
  /** Model that ran the stage, an id like `claude-sonnet-4-6`; absent if unknown. */
  model?: string;
}

/** Session event; `t` is milliseconds from the session start (the record's `timestamp`). */
export type SessionEvent =
  | { t: number; type: "build_start" }
  | PromptEvent
  | MessageEvent
  | InterventionEvent
  | StageEnterEvent
  | { t: number; type: "stage_fail"; stage: Stage; reason: string }
  | { t: number; type: "usage"; tokens: number }
  | { t: number; type: "build_end"; ok: boolean };

/** Who made the record: an agent (provider and agent from its adapter) or a human by hand. */
export type RecordSource = { type: "agent"; provider: string; agent: string } | { type: "manual" };

/** What records of all types share: who, when and in which project. */
export interface RecordHeader {
  version: typeof RECORD_VERSION;
  /** Record id: also the file name and part of the page address. */
  id: string;
  /** Record moment in ISO 8601 UTC, as `Date.prototype.toISOString`; for a session, its start. */
  timestamp: string;
  /** Project id: the same rules as for `id`. */
  projectId: string;
  /** Agent session the record came from; absent if unknown or the record was made by hand. */
  sessionId?: string;
  source: RecordSource;
}

/** Session data: the task went through the workflow stages; events are what the factory replays. */
export interface SessionData {
  title: string;
  /**
   * Original language of prompts and messages, an ISO 639 code (`ru`, `en`). The recording is not
   * translated: a viewer in another language sees it in the original with this label.
   */
  language: string;
  /** Workflow name from `harness/workflows/`. */
  workflow: string;
  /** Harness version on one line, for example `0.3.0`: shows which rules were in effect. */
  harness: string;
  /**
   * Task label: records with the same label are runs of one task, and the site compares them. It
   * goes into the page address, so the rules are the same as for `id`; absent if not compared.
   */
  task?: string;
  events: SessionEvent[];
}

/** A work session on a task: the factory floor replays it. */
export interface SessionRecord extends RecordHeader {
  type: "session";
  data: SessionData;
}

/** A project decision: what was chosen and why. */
export interface DecisionRecord extends RecordHeader {
  type: "decision";
  data: { title: string; description: string };
}

/** A free-text note about the project. */
export interface NoteRecord extends RecordHeader {
  type: "note";
  data: { text: string };
}

/** Project journal record: a discriminated union on `type`. */
export type JournalRecord = SessionRecord | DecisionRecord | NoteRecord;

/** Journal record type. */
export type RecordType = JournalRecord["type"];

/** Message without the full text: the factory floor needs only the line above the speaker. */
export type BriefMessageEvent = Omit<MessageEvent, "text">;

/** Intervention without the full text: the factory floor needs only the line above the foreman. */
export type BriefInterventionEvent = Omit<InterventionEvent, "text">;

/** Session event as the factory floor sees it: messages and interventions have no full text. */
export type BriefSessionEvent =
  | Exclude<SessionEvent, MessageEvent | InterventionEvent>
  | BriefMessageEvent
  | BriefInterventionEvent;

/** Session without full message texts: the factory floor gets it, full texts stay in journal. */
export interface BriefSessionRecord extends Omit<SessionRecord, "data"> {
  data: Omit<SessionData, "events"> & { events: BriefSessionEvent[] };
}

/**
 * Session counters at some moment: tokens, human prompts, reworks
 * and human interventions (their prompts are not counted).
 */
export interface Tally {
  tokens: number;
  prompts: number;
  reworks: number;
  interventions: number;
}

/** Session counters shown above the factory floor. */
export interface BuildStats extends Tally {
  durationMs: number;
  ok: boolean;
}

/** Counters before the first event. */
export const NO_TALLY: Tally = { tokens: 0, prompts: 0, reworks: 0, interventions: 0 };

/** Record format error: the record came from outside and failed validation. */
export class RecordError extends Error {}

/**
 * Checks that a value is a participant in a factory floor conversation.
 * @param {unknown} value The value to check.
 * @returns {value is Speaker} true if it is a stage or the foreman.
 */
export function isSpeaker(value: unknown): value is Speaker {
  return value === FOREMAN || isStage(value);
}

function isInterventionReason(value: unknown): value is InterventionReason {
  return (INTERVENTION_REASONS as readonly unknown[]).includes(value);
}

function isLines(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isLine);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

// The id goes into the file name and the page address: only letters, digits, `_` and `-`.
const ID_PATTERN = /^[\w-]+$/;

/**
 * Checks that a value is fit for record and project ids.
 * @param {unknown} value The value to check.
 * @returns {value is string} true if it is a string of letters, digits, "_" and "-".
 */
export function isRecordId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/**
 * Checks that a value is a harness version: a non-empty string without line breaks.
 * @param {unknown} value The value to check.
 * @returns {value is string} true if the value can be shown as a one-line version.
 */
export function isHarnessVersion(value: unknown): value is string {
  return isLine(value);
}

/** Language of records published before the `language` field: all records were Russian then. */
export const LEGACY_SESSION_LANGUAGE = "ru";

// The primary BCP 47 language subtag: a two- or three-letter lowercase ISO 639 code.
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}$/;

/**
 * Checks that a value is a recording language code: `ru`, `en`, `deu`.
 * @param {unknown} value The value to check.
 * @returns {value is string} true if it is an ISO 639 code of two or three lowercase Latin letters.
 */
export function isLanguageCode(value: unknown): value is string {
  return typeof value === "string" && LANGUAGE_CODE_PATTERN.test(value);
}

// Strict comparison with toISOString rejects other formats as well as nonexistent days like
// February 31, which Date.parse silently rolls over to March.
function isInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const time = Date.parse(value);

  return !Number.isNaN(time) && new Date(time).toISOString() === value;
}

type Fail = (why: string) => RecordError;

const failRecord: Fail = (why) => new RecordError(why);

// Code points, not UTF-16 units, so that an emoji counts as one character on the server too. The
// units count is never smaller, so a short string skips the expensive split.
function isWithin(value: string, limit: number): boolean {
  return value.length <= limit || [...value].length <= limit;
}

function requireWithin(value: string, limit: number, field: string, fail: Fail): void {
  if (!isWithin(value, limit)) throw fail(`${field} must be at most ${limit} characters`);
}

function parsePrompt(raw: Record<string, unknown>, t: number, fail: Fail): PromptEvent {
  const { goal, requirements, model } = raw;

  if (!isLine(goal)) throw fail("goal must be a non-empty single-line string");
  if (!isLines(requirements)) {
    throw fail("requirements must be a list of non-empty single-line strings");
  }

  requireWithin(goal, RECORD_LIMITS.lineLength, "goal", fail);
  requirements.forEach((requirement, index) => {
    requireWithin(requirement, RECORD_LIMITS.lineLength, `requirements[${index}]`, fail);
  });

  const prompt: PromptEvent = { t, type: "prompt", goal, requirements: [...requirements] };

  if (model === undefined) return prompt;
  if (!isLine(model)) throw fail("model must be a non-empty single-line string");

  requireWithin(model, RECORD_LIMITS.lineLength, "model", fail);

  return { ...prompt, model };
}

function parseMessage(raw: Record<string, unknown>, t: number, fail: Fail): MessageEvent {
  const { from, to, line, text } = raw;

  if (!isSpeaker(from)) throw fail(`unknown speaker ${String(from)}`);
  if (!isSpeaker(to)) throw fail(`unknown addressee ${String(to)}`);
  if (from === to) throw fail(`${from} cannot talk to itself`);
  if (!isLine(line)) throw fail("line must be a non-empty single-line string");
  if (!isText(text)) throw fail("text must be a non-empty string");

  requireWithin(line, RECORD_LIMITS.lineLength, "line", fail);
  requireWithin(text, RECORD_LIMITS.textLength, "text", fail);

  return { t, type: "message", from, to, line, text };
}

function parseIntervention(raw: Record<string, unknown>, t: number, fail: Fail): InterventionEvent {
  const { reason, line, text } = raw;

  if (!isInterventionReason(reason)) throw fail(`unknown reason ${String(reason)}`);
  if (!isLine(line)) throw fail("line must be a non-empty single-line string");
  if (!isText(text)) throw fail("text must be a non-empty string");

  requireWithin(line, RECORD_LIMITS.lineLength, "line", fail);
  requireWithin(text, RECORD_LIMITS.textLength, "text", fail);

  return { t, type: "intervention", reason, line, text };
}

function parseStageEnter(raw: Record<string, unknown>, t: number, fail: Fail): StageEnterEvent {
  const { stage, model } = raw;

  if (!isStage(stage)) throw fail(`unknown stage ${String(stage)}`);

  const entry: StageEnterEvent = { t, type: "stage_enter", stage };

  if (model === undefined) return entry;
  if (!isLine(model)) throw fail("model must be a non-empty single-line string");

  requireWithin(model, RECORD_LIMITS.lineLength, "model", fail);

  return { ...entry, model };
}

function parseStageFail(raw: Record<string, unknown>, t: number, fail: Fail): SessionEvent {
  if (!isStage(raw.stage)) throw fail(`unknown stage ${String(raw.stage)}`);
  if (typeof raw.reason !== "string") throw fail("missing reason");

  requireWithin(raw.reason, RECORD_LIMITS.lineLength, "reason", fail);

  return { t, type: "stage_fail", stage: raw.stage, reason: raw.reason };
}

function parseUsage(raw: Record<string, unknown>, t: number, fail: Fail): SessionEvent {
  if (typeof raw.tokens !== "number" || raw.tokens < 0) throw fail("invalid tokens");

  return { t, type: "usage", tokens: raw.tokens };
}

function parseBuildEnd(raw: Record<string, unknown>, t: number, fail: Fail): SessionEvent {
  if (typeof raw.ok !== "boolean") throw fail("missing ok");

  return { t, type: "build_end", ok: raw.ok };
}

function isEventTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Validates one session event that came from outside.
 * @param {unknown} raw Parsed JSON of the event.
 * @param {number} index Event number in the session, for the error message.
 * @returns {SessionEvent} The validated event.
 * @throws {RecordError} If the event does not match the format.
 */
export function parseSessionEvent(raw: unknown, index: number): SessionEvent {
  const fail: Fail = (why) => new RecordError(`event #${index}: ${why}`);

  if (!isObject(raw)) throw fail("not an object");

  const { t, type } = raw;

  if (!isEventTime(t)) throw fail("invalid time t");

  switch (type) {
    case "build_start":
      return { t, type };
    case "prompt":
      return parsePrompt(raw, t, fail);
    case "message":
      return parseMessage(raw, t, fail);
    case "intervention":
      return parseIntervention(raw, t, fail);
    case "stage_enter":
      return parseStageEnter(raw, t, fail);
    case "stage_fail":
      return parseStageFail(raw, t, fail);
    case "usage":
      return parseUsage(raw, t, fail);
    case "build_end":
      return parseBuildEnd(raw, t, fail);
    default:
      throw fail(`unknown type ${String(type)}`);
  }
}

function parseSource(raw: unknown): RecordSource {
  if (!isObject(raw)) throw new RecordError("source must be an object");

  switch (raw.type) {
    case "manual":
      return { type: "manual" };
    case "agent":
      if (!isLine(raw.provider)) throw new RecordError("source has no provider");
      if (!isLine(raw.agent)) throw new RecordError("source has no agent");

      requireWithin(raw.provider, RECORD_LIMITS.lineLength, "source.provider", failRecord);
      requireWithin(raw.agent, RECORD_LIMITS.lineLength, "source.agent", failRecord);

      return { type: "agent", provider: raw.provider, agent: raw.agent };
    default:
      throw new RecordError(`unknown source ${String(raw.type)}`);
  }
}

function parseHeader(raw: Record<string, unknown>): RecordHeader {
  if (raw.version !== RECORD_VERSION) {
    throw new RecordError(`unsupported version ${String(raw.version)}`);
  }
  if (!isRecordId(raw.id)) {
    throw new RecordError("id must contain only letters, digits, underscores and hyphens");
  }
  if (!isRecordId(raw.projectId)) {
    throw new RecordError("projectId must contain only letters, digits, underscores and hyphens");
  }
  if (!isInstant(raw.timestamp)) {
    throw new RecordError("timestamp must be an ISO 8601 UTC time, as from toISOString");
  }

  requireWithin(raw.id, RECORD_LIMITS.idLength, "id", failRecord);
  requireWithin(raw.projectId, RECORD_LIMITS.idLength, "projectId", failRecord);

  const header: RecordHeader = {
    version: RECORD_VERSION,
    id: raw.id,
    timestamp: raw.timestamp,
    projectId: raw.projectId,
    source: parseSource(raw.source),
  };

  if (raw.sessionId === undefined) return header;
  if (!isLine(raw.sessionId)) throw new RecordError("sessionId must be a non-empty string");

  requireWithin(raw.sessionId, RECORD_LIMITS.lineLength, "sessionId", failRecord);

  return { ...header, sessionId: raw.sessionId };
}

function parseEvents(raw: unknown): SessionEvent[] {
  if (!Array.isArray(raw)) throw new RecordError("missing events");

  const events = raw.map(parseSessionEvent);

  if (events[0]?.type !== "build_start") {
    throw new RecordError("session must start with build_start");
  }
  if (events.at(-1)?.type !== "build_end") {
    throw new RecordError("session must end with build_end");
  }

  events.forEach((event, index) => {
    const previous = events[index - 1];

    if (previous !== undefined && event.t < previous.t) {
      throw new RecordError(`event #${index}: time goes backwards`);
    }
  });

  return events;
}

function parseSessionData(raw: unknown): SessionData {
  if (!isObject(raw)) throw new RecordError("data must be an object");

  const { title, workflow, harness, task, language = LEGACY_SESSION_LANGUAGE } = raw;

  if (!isLine(title)) {
    throw new RecordError("title must be a non-empty single-line string");
  }
  if (!isLanguageCode(language)) {
    throw new RecordError("language must be an ISO 639 language code: ru, en");
  }
  if (!isLine(workflow)) throw new RecordError("workflow must be a non-empty string");
  if (!isHarnessVersion(harness)) {
    throw new RecordError("harness must be a non-empty single-line string");
  }

  requireWithin(title, RECORD_LIMITS.lineLength, "title", failRecord);
  requireWithin(workflow, RECORD_LIMITS.lineLength, "workflow", failRecord);
  requireWithin(harness, RECORD_LIMITS.lineLength, "harness", failRecord);

  const data: SessionData = { title, language, workflow, harness, events: parseEvents(raw.events) };

  if (task === undefined) return data;
  if (!isRecordId(task)) {
    throw new RecordError("task must contain only letters, digits, underscores and hyphens");
  }

  requireWithin(task, RECORD_LIMITS.idLength, "task", failRecord);

  return { ...data, task };
}

function parseDecisionData(raw: unknown): DecisionRecord["data"] {
  if (!isObject(raw)) throw new RecordError("data must be an object");

  const { title, description } = raw;

  if (!isLine(title)) {
    throw new RecordError("title must be a non-empty single-line string");
  }
  if (typeof description !== "string") throw new RecordError("description must be a string");

  return { title, description };
}

function parseNoteData(raw: unknown): NoteRecord["data"] {
  if (!isObject(raw)) throw new RecordError("data must be an object");
  if (!isText(raw.text)) throw new RecordError("text must be a non-empty string");

  return { text: raw.text };
}

/**
 * Validates a journal record that came from outside and returns it typed.
 * @param {unknown} raw Parsed JSON of the record.
 * @returns {JournalRecord} The validated record; unknown fields are dropped.
 * @throws {RecordError} If the record does not match the format.
 */
export function parseRecord(raw: unknown): JournalRecord {
  if (!isObject(raw)) throw new RecordError("record must be an object");

  const header = parseHeader(raw);

  switch (raw.type) {
    case "session":
      return { ...header, type: "session", data: parseSessionData(raw.data) };
    case "decision":
      return { ...header, type: "decision", data: parseDecisionData(raw.data) };
    case "note":
      return { ...header, type: "note", data: parseNoteData(raw.data) };
    default:
      throw new RecordError(`unknown record type ${String(raw.type)}`);
  }
}

/**
 * Adds a session event to the counters.
 * @param {Tally} counts Counters before the event.
 * @param {BriefSessionEvent} event Session event.
 * @returns {Tally} Counters after the event.
 */
export function tally(counts: Tally, event: BriefSessionEvent): Tally {
  switch (event.type) {
    case "usage":
      return { ...counts, tokens: counts.tokens + event.tokens };
    case "prompt":
      return { ...counts, prompts: counts.prompts + 1 };
    case "intervention":
      return { ...counts, interventions: counts.interventions + 1 };
    case "stage_fail":
      return { ...counts, reworks: counts.reworks + 1 };
    case "build_start":
    case "stage_enter":
    case "message":
    case "build_end":
      return counts;
    default:
      // A new event type will not compile until it is accounted for here.
      return event satisfies never;
  }
}

/**
 * Session outcome: whether it succeeded, judged by the last event.
 * @param {BriefSessionRecord} session The validated session.
 * @returns {boolean} true if the session ends with a successful build_end.
 */
export function succeeded(session: BriefSessionRecord): boolean {
  const last = session.data.events.at(-1);

  return last?.type === "build_end" && last.ok;
}

/**
 * Computes session counters from its events.
 * @param {BriefSessionRecord} session The validated session.
 * @returns {BuildStats} Duration, tokens, number of prompts, reworks and interventions, outcome.
 */
export function summarize(session: BriefSessionRecord): BuildStats {
  const { events } = session.data;
  const durationMs = (events.at(-1)?.t ?? 0) - (events[0]?.t ?? 0);
  const counts = events.reduce(tally, NO_TALLY);

  return { durationMs, ...counts, ok: succeeded(session) };
}

/**
 * Strips the full text from a message.
 * @param {BriefMessageEvent} event A message; in practice it may also carry `text`.
 * @returns {BriefMessageEvent} A new message with only the fields the factory floor needs.
 */
export function briefMessage(event: BriefMessageEvent): BriefMessageEvent {
  const { t, type, from, to, line } = event;

  return { t, type, from, to, line };
}

/**
 * Strips the full text from an intervention.
 * @param {BriefInterventionEvent} event An intervention; in practice it may also carry `text`.
 * @returns {BriefInterventionEvent} New intervention with only the fields the factory floor needs.
 */
export function briefIntervention(event: BriefInterventionEvent): BriefInterventionEvent {
  const { t, type, reason, line } = event;

  return { t, type, reason, line };
}

function briefEvent(event: SessionEvent): BriefSessionEvent {
  switch (event.type) {
    case "message":
      return briefMessage(event);
    case "intervention":
      return briefIntervention(event);
    case "build_start":
    case "prompt":
    case "stage_enter":
    case "stage_fail":
    case "usage":
    case "build_end":
      return event;
    default:
      // A new event type will not compile until someone decides whether it needs the full text.
      return event satisfies never;
  }
}

/**
 * Strips the full text from messages and interventions: the factory floor does not need it, and it
 * must not get into the page with the factory floor.
 * @param {SessionRecord} session The full session.
 * @returns {BriefSessionRecord} The same session, with no `text` on its messages and interventions.
 */
export function briefOf(session: SessionRecord): BriefSessionRecord {
  const events = session.data.events.map(briefEvent);

  return { ...session, data: { ...session.data, events } };
}
