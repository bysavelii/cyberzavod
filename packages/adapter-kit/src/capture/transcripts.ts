// What a draft takes from an agent's transcripts: tokens of runs and of the session by model, the
// model of each prompt, replies to the human, tasks for stations and their reports. Each adapter
// parses its own transcript format (`TranscriptFormat`); reading the files and warning about the
// ones that cannot be read is the same for every agent.

import { readFile } from "node:fs/promises";
import { isNotFound } from "@cyberzavod/storage";
import type { KitMessages } from "../messages/kit-messages.ts";
import { tokensByModel } from "./model-tokens.ts";
import type { RawEvent } from "./raw-event.ts";
import {
  runTranscriptPaths,
  sessionTranscriptPath,
  sessionTranscriptPaths,
  stationTranscriptPaths,
  type DraftMeta,
} from "./to-draft.ts";
import {
  isTimedTokenUsage,
  type AgentAssignment,
  type AgentReport,
  type ModelReply,
  type ModelTokens,
  type TimedTokenUsage,
  type TokenUsage,
  type TranscriptText,
} from "./transcript-model.ts";

/** Draft data that comes from transcripts rather than from the raw log. */
export type TranscriptMeta = Required<
  Pick<
    DraftMeta,
    "runTokens" | "runModels" | "sessionUsages" | "replies" | "answers" | "assignments" | "reports"
  >
>;

/** What the draft is built from: the log events and the data from the transcripts. */
export interface DraftInputs {
  events: RawEvent[];
  meta: TranscriptMeta;
}

/** Reads an agent's transcripts for a draft. */
export interface SessionTranscripts {
  /**
   * Collects the draft's inputs: reads the transcripts the log names. An unreadable transcript is
   * a warning, not an error: the draft is useful without it.
   * @param {RawEvent[]} rawEvents Events of the raw log.
   * @param {KitMessages} messages Messages in the chosen language.
   * @returns {Promise<DraftInputs>} The events, with what the transcripts know about them
   *   corrected, and the data from the transcripts.
   */
  inputsOf(rawEvents: RawEvent[], messages: KitMessages): Promise<DraftInputs>;
}

/** How an agent's transcript is understood. Every function is lenient: it skips what it cannot read. */
export interface TranscriptFormat {
  /**
   * Tokens by model message, from earliest to latest: with the model and the breakdown by kind.
   * Every message is here, also the one without a time: a run's tokens do not need it.
   */
  tokenUsages(transcript: string): TokenUsage[];
  /** Model replies from earliest to latest: a prompt finds its model by them. */
  modelReplies(transcript: string): ModelReply[];
  /** Model texts from earliest to latest: final replies to the human come from them. */
  assistantTexts(transcript: string): TranscriptText[];
  /** Tasks the session gave to subagents. */
  agentAssignments(transcript: string): AgentAssignment[];
  /** Reports of a subagent's runs. */
  agentReports(transcript: string): AgentReport[];
  /**
   * Whether the tool calls of the session succeeded, by `callId`: the hook cannot know it.
   * Without this function the log's own verdict stays.
   */
  toolOutcomes?(transcript: string): ReadonlyMap<string, boolean>;
}

/**
 * The result of reading a transcript file: the text, or why there is none. A missing file and an
 * unreadable one are told apart because a missing transcript is common (the agent cleans up old
 * ones) and is reported once for all, while an unreadable one gets a line of its own. `compressed`
 * is a transcript the agent has packed and the adapter cannot unpack.
 */
export type TranscriptRead =
  | { status: "read"; text: string }
  | { status: "missing"; reason: string }
  | { status: "compressed" }
  | { status: "failed"; reason: string };

/** Reads a transcript file for a draft. */
export type TranscriptReader = (transcriptPath: string) => Promise<TranscriptRead>;

/**
 * Reads a transcript as a UTF-8 file.
 * @param {string} transcriptPath Path of the file.
 * @returns {Promise<TranscriptRead>} The text, or why there is none.
 */
export const readTranscriptFile: TranscriptReader = async (transcriptPath) => {
  try {
    return { status: "read", text: await readFile(transcriptPath, "utf8") };
  } catch (err) {
    const reason = String(err);

    return isNotFound(err) ? { status: "missing", reason } : { status: "failed", reason };
  }
};

// What was read: every file once, by path.
type Readings = ReadonlyMap<string, TranscriptRead>;

// Which role a transcript plays decides how a lost one is reported.
interface TranscriptRoles {
  /** The session's own transcript: prompt models and session messages come from it. */
  session: string | undefined;
  /** Station transcripts: reports come from them. */
  stations: ReadonlySet<string>;
}

// What is taken from the session transcript: prompt models, replies to the human, station
// assignments and the outcomes of tool calls.
interface SessionTexts {
  replies: ModelReply[];
  answers: TranscriptText[];
  assignments: AgentAssignment[];
  outcomes: ReadonlyMap<string, boolean>;
}

const NO_SESSION_TEXTS: SessionTexts = {
  replies: [],
  answers: [],
  assignments: [],
  outcomes: new Map(),
};

// Every file is read once, even if it plays several roles (a station is also a run, the session's
// last transcript is also one of its usages).
async function readEach(paths: Iterable<string>, read: TranscriptReader): Promise<Readings> {
  const readings = new Map<string, TranscriptRead>();

  for (const transcriptPath of paths) {
    if (!readings.has(transcriptPath)) readings.set(transcriptPath, await read(transcriptPath));
  }

  return readings;
}

// The files that could not be read get a line each, except the missing ones: the agent may not keep
// transcripts of its service subagents, so those are counted into one line for tokens and one for
// reports. The session's own transcript has a line of its own, since its loss costs the most.
function warnAboutFile(
  transcriptPath: string,
  result: TranscriptRead,
  roles: TranscriptRoles,
  messages: KitMessages,
): void {
  switch (result.status) {
    case "read":
      break;
    case "compressed":
      console.warn(messages.draft.transcriptCompressed(transcriptPath));
      break;
    case "failed":
      console.warn(
        messages.draft.transcriptNotRead({ file: transcriptPath, reason: result.reason }),
      );

      if (transcriptPath === roles.session) {
        console.warn(messages.draft.sessionTranscriptNotRead(result.reason));
      }

      break;
    case "missing":
      if (transcriptPath === roles.session) {
        console.warn(messages.draft.sessionTranscriptNotRead(result.reason));
      }

      break;
    default:
      result satisfies never;
  }
}

function warnAboutMissing(readings: Readings, roles: TranscriptRoles, messages: KitMessages): void {
  const missing = [...readings]
    .filter(
      ([transcriptPath, { status }]) => status === "missing" && transcriptPath !== roles.session,
    )
    .map(([transcriptPath]) => transcriptPath);
  const stations = missing.filter((transcriptPath) => roles.stations.has(transcriptPath));
  const others = missing.length - stations.length;

  if (others > 0) console.warn(messages.draft.transcriptsMissing(others));
  if (stations.length > 0) console.warn(messages.draft.stationTranscriptsMissing(stations.length));
}

// One warning per file that could not be read, however many roles the file plays.
function warnAboutLost(readings: Readings, roles: TranscriptRoles, messages: KitMessages): void {
  for (const [transcriptPath, result] of readings) {
    warnAboutFile(transcriptPath, result, roles, messages);
  }

  warnAboutMissing(readings, roles, messages);
}

function textAt(readings: Readings, transcriptPath: string): string | undefined {
  const result = readings.get(transcriptPath);

  return result?.status === "read" ? result.text : undefined;
}

// Tokens of each subagent run from its transcript, by model.
function tokensOfRuns(
  paths: ReadonlyMap<string, string>,
  readings: Readings,
  format: TranscriptFormat,
): Map<string, ModelTokens[]> {
  const tokens = new Map<string, ModelTokens[]>();

  for (const [agentId, transcriptPath] of paths) {
    const transcript = textAt(readings, transcriptPath);

    if (transcript !== undefined) {
      tokens.set(agentId, tokensByModel(format.tokenUsages(transcript)));
    }
  }

  return tokens;
}

// Model of each subagent run: the one that replied first in the run's transcript. A run whose
// transcript is unread, or has no replies, has no model.
function modelsOfRuns(
  paths: ReadonlyMap<string, string>,
  readings: Readings,
  format: TranscriptFormat,
): Map<string, string> {
  const models = new Map<string, string>();

  for (const [agentId, transcriptPath] of paths) {
    const transcript = textAt(readings, transcriptPath);
    const model = transcript === undefined ? undefined : format.modelReplies(transcript)[0]?.model;

    if (model !== undefined) models.set(agentId, model);
  }

  return models;
}

// Main session tokens per message, so they can be split across builds. A message without a time
// cannot be placed between builds and is skipped.
function usagesOfSession(
  paths: readonly string[],
  readings: Readings,
  format: TranscriptFormat,
): TimedTokenUsage[] {
  return paths
    .map((transcriptPath) => textAt(readings, transcriptPath))
    .filter((transcript) => transcript !== undefined)
    .flatMap((transcript) => format.tokenUsages(transcript))
    .filter(isTimedTokenUsage);
}

// Without a transcript the draft is still built: prompts will have no model, and there will be no
// messages from the session at all.
function textsFromSessionTranscript(
  transcriptPath: string | undefined,
  readings: Readings,
  format: TranscriptFormat,
): SessionTexts {
  const transcript = transcriptPath === undefined ? undefined : textAt(readings, transcriptPath);

  if (transcript === undefined) return NO_SESSION_TEXTS;

  return {
    replies: format.modelReplies(transcript),
    answers: format.assistantTexts(transcript),
    assignments: format.agentAssignments(transcript),
    outcomes: format.toolOutcomes?.(transcript) ?? new Map(),
  };
}

// Station reports live in their transcripts.
function reportsFromStationTranscripts(
  paths: readonly string[],
  readings: Readings,
  format: TranscriptFormat,
): AgentReport[] {
  return paths
    .map((transcriptPath) => textAt(readings, transcriptPath))
    .filter((transcript) => transcript !== undefined)
    .flatMap((transcript) => format.agentReports(transcript));
}

/**
 * Puts the outcomes known from the transcript into the log's tool events: the hook records a
 * call as done, the transcript knows whether it succeeded.
 * @param {RawEvent[]} events Events of the raw log.
 * @param {ReadonlyMap<string, boolean>} outcomes Whether each call succeeded, by `callId`.
 * @returns {RawEvent[]} New events; the ones without a known outcome stay as they were.
 */
export function withToolOutcomes(
  events: RawEvent[],
  outcomes: ReadonlyMap<string, boolean>,
): RawEvent[] {
  return events.map((event) => {
    if (event.kind !== "tool" || event.callId === undefined) return event;

    const ok = outcomes.get(event.callId);

    return ok === undefined ? event : { ...event, ok };
  });
}

/**
 * Reads transcripts of an agent whose format is given.
 * @param {TranscriptFormat} format How the agent's transcript is understood.
 * @param {TranscriptReader} [read] How a transcript file is read; by default as a UTF-8 file.
 * @returns {SessionTranscripts} Transcript reading for the draft.
 */
export function transcriptsOf(
  format: TranscriptFormat,
  read: TranscriptReader = readTranscriptFile,
): SessionTranscripts {
  return {
    async inputsOf(rawEvents, messages) {
      const runPaths = runTranscriptPaths(rawEvents);
      const sessionPaths = sessionTranscriptPaths(rawEvents);
      const sessionPath = sessionTranscriptPath(rawEvents);
      const stationPaths = stationTranscriptPaths(rawEvents);
      const readings = await readEach(
        [...runPaths.values(), ...sessionPaths, ...stationPaths],
        read,
      );
      const roles = { session: sessionPath, stations: new Set(stationPaths) };
      const session = textsFromSessionTranscript(sessionPath, readings, format);
      const { replies, answers, assignments } = session;

      warnAboutLost(readings, roles, messages);

      return {
        events: withToolOutcomes(rawEvents, session.outcomes),
        meta: {
          runTokens: tokensOfRuns(runPaths, readings, format),
          runModels: modelsOfRuns(runPaths, readings, format),
          sessionUsages: usagesOfSession(sessionPaths, readings, format),
          replies,
          answers,
          assignments,
          reports: reportsFromStationTranscripts(stationPaths, readings, format),
        },
      };
    },
  };
}
