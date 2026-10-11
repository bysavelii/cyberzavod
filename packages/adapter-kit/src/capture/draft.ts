// A recording draft: factory events, with prompts still close to how the human typed them.
// The editor fills in the title and the clean version of each prompt, the human reviews,
// and publishing removes the original text and passes the recording through the core check.

import {
  INTERVENTION_REASONS,
  isRecordId,
  isSpeaker,
  parseSessionEvent,
  parseRecord,
  RECORD_VERSION,
  type RecordSource,
  type SessionEvent,
  type InterventionEvent,
  type InterventionReason,
  type StageEnterEvent,
  type UsageEvent,
  type SessionRecord,
  type RecordError,
  type Speaker,
  type Stage,
} from "@cyberzavod/core";
import { KitError } from "../errors.ts";
import { buildTimeline, eventBuilds, type BuildTimeline } from "./builds.ts";
import { findLeaks } from "./leaks.ts";
import { withOptional } from "./raw-event.ts";

/** A prompt in the draft: the human's original text and the clean version for publishing. */
export interface DraftPrompt {
  t: number;
  type: "draft_prompt";
  said: string;
  goal: string;
  requirements: string[];
  /** Model that received the prompt; set by draft building, not by the editor. */
  model?: string;
  /**
   * The prompt is merged into the previous one: it is a "yes" or "go on" whose meaning the editor
   * wrote into that prompt. Such a prompt does not go into the recording.
   */
  joined?: boolean;
  /**
   * Build where this prompt's task starts. Set by the editor; without it the prompt stays
   * in the build of the closest preceding event.
   */
  build?: string;
}

const MESSAGE_SOURCES = ["assignment", "report", "answer"] as const;

/**
 * Where a message came from in the session: a station's task, a station's report or the final reply
 * to the human. It is a hint to the editor on how to write `line`; it does not go to the site.
 */
export type MessageSource = (typeof MESSAGE_SOURCES)[number];

function isInterventionReason(value: unknown): value is InterventionReason {
  return (INTERVENTION_REASONS as readonly unknown[]).includes(value);
}

function isMessageSource(value: unknown): value is MessageSource {
  return (MESSAGE_SOURCES as readonly unknown[]).includes(value);
}

/**
 * A message in the draft: who said it to whom, the original text and the clean version for
 * publishing. Draft building sets the participants, `source` and the `said` text; the editor writes
 * `line` and `text`.
 */
export interface DraftMessage {
  t: number;
  type: "draft_message";
  from: Speaker;
  to: Speaker;
  source: MessageSource;
  said: string;
  line: string;
  text: string;
  /** Station run whose task or report this is; set by draft building. */
  run?: string;
  /** Build the editor assigned the message to instead of the inherited one; overrides `run`. */
  build?: string;
}

/**
 * A human intervention in the draft: the original text from which the editor writes a line for the
 * factory floor and the full journal text. Draft building sets the reason; the editor does not
 * change it.
 */
export interface DraftIntervention {
  t: number;
  type: "draft_intervention";
  reason: InterventionReason;
  said: string;
  line: string;
  text: string;
  /** Build the editor assigned the intervention to instead of the inherited one. */
  build?: string;
}

/**
 * A station run window: from the subagent's start to its stop, or, if it never stopped, to
 * the end of the log. Needed so that long station work without events inside is not shrunk.
 */
export interface DraftRun {
  t: number;
  type: "draft_run";
  /** Run id (the subagent's `agentId`): a build names the run by it in `runs`. */
  run: string;
  agent: string;
  until: number;
}

/** Checks outcome: a station's verdict or a checks run in the main session. */
export interface DraftCheck {
  t: number;
  type: "draft_check";
  ok: boolean;
  /** Station run that gave the verdict; main session checks have none. */
  run?: string;
  /** Project in whose directory the main session checks ran; `cyberzavod draft` sets it. */
  project?: string;
}

/**
 * A draft event: a recording event (station events tagged with run `run`, main session events
 * whose project is known tagged with `project`), a prompt, a message, a run window
 * or a checks outcome, not yet published.
 */
export type DraftEvent =
  | (SessionEvent & { run?: string; project?: string })
  | DraftPrompt
  | DraftMessage
  | DraftIntervention
  | DraftRun
  | DraftCheck;

/** A draft event the editor edits: a prompt, a message or an intervention. */
export type EditableDraftEvent = DraftPrompt | DraftMessage | DraftIntervention;

/**
 * A build in the draft: one future recording. A session may carry several tasks, and then
 * each is published as a separate recording with its own project, harness version and title.
 */
export interface DraftBuild {
  /** Recording id: for the first build it is the draft `id`. */
  id: string;
  /** Project id; an empty string awaits editing, like `title`. */
  project: string;
  /** Harness version at build time; an empty string awaits editing, like `title`. */
  harness: string;
  /** Build development workflow; an empty string awaits editing, like `title`. */
  workflow: string;
  title: string;
  /**
   * Language of the build's prompts and messages, an ISO 639 code (`ru`, `en`); an empty string
   * awaits editing, like `title`.
   */
  language: string;
  /** Station runs (`agentId`) that belong to the build. */
  runs: string[];
  /**
   * Task label for comparing runs of one task across recordings. The editor sets it only when the
   * human named the label; without it the recording has no `task`.
   */
  task?: string;
}

/** Session recordings draft: built from the log, edited and published. */
export interface Draft {
  id: string;
  startedAt: string;
  /** Session builds; not empty: the first build gets everything not assigned to others. */
  builds: DraftBuild[];
  events: DraftEvent[];
}

/** Draft error: the file is damaged or not fit for publishing. */
export class DraftError extends Error {}

// Build header fields the editor fills in if the log did not bring them. Names for humans
// live in the message catalog.
const HEADER_FIELDS = [
  "title",
  "language",
  "project",
  "harness",
  "workflow",
] as const satisfies readonly (keyof DraftBuild)[];

/** A build header field the editor fills in. */
export type HeaderField = (typeof HEADER_FIELDS)[number];

/** A build with unfilled header fields left. */
export interface UnfilledBuild {
  buildId: string;
  /** Empty fields in header order. */
  fields: HeaderField[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseDraftPrompt(raw: Record<string, unknown>, index: number): DraftPrompt {
  const { t, said, goal, requirements, model, joined, build } = raw;

  if (typeof t !== "number" || typeof said !== "string" || typeof goal !== "string") {
    throw new DraftError(`event #${index}: a prompt must have t, said and goal`);
  }
  if (!isStrings(requirements)) {
    throw new DraftError(`event #${index}: requirements must be a list of strings`);
  }
  if (model !== undefined && typeof model !== "string") {
    throw new DraftError(`event #${index}: model must be a string`);
  }
  if (joined !== undefined && typeof joined !== "boolean") {
    throw new DraftError(`event #${index}: joined must be true or false`);
  }
  if (build !== undefined && typeof build !== "string") {
    throw new DraftError(`event #${index}: build must be a string`);
  }

  return {
    t,
    type: "draft_prompt",
    said,
    goal,
    requirements: [...requirements],
    ...(model === undefined ? {} : { model }),
    ...(joined === undefined ? {} : { joined }),
    ...(build === undefined ? {} : { build }),
  };
}

function parseDraftMessage(raw: Record<string, unknown>, index: number): DraftMessage {
  const { t, from, to, source, said, line, text, run, build } = raw;

  if (typeof t !== "number" || typeof said !== "string") {
    throw new DraftError(`event #${index}: a message must have t and said`);
  }
  if (!isSpeaker(from) || !isSpeaker(to)) {
    throw new DraftError(`event #${index}: a message must have from and to`);
  }
  if (!isMessageSource(source)) {
    throw new DraftError(`event #${index}: unknown source ${String(source)}`);
  }
  if (typeof line !== "string" || typeof text !== "string") {
    throw new DraftError(`event #${index}: message line and text must be strings`);
  }
  if (run !== undefined && typeof run !== "string") {
    throw new DraftError(`event #${index}: run must be a string`);
  }
  if (build !== undefined && typeof build !== "string") {
    throw new DraftError(`event #${index}: build must be a string`);
  }

  return {
    t,
    type: "draft_message",
    from,
    to,
    source,
    said,
    line,
    text,
    ...(run === undefined ? {} : { run }),
    ...(build === undefined ? {} : { build }),
  };
}

function parseDraftIntervention(raw: Record<string, unknown>, index: number): DraftIntervention {
  const { t, reason, said, line, text, build } = raw;

  if (typeof t !== "number" || typeof said !== "string") {
    throw new DraftError(`event #${index}: an intervention must have t and said`);
  }
  if (!isInterventionReason(reason)) {
    throw new DraftError(`event #${index}: unknown reason ${String(reason)}`);
  }
  if (typeof line !== "string" || typeof text !== "string") {
    throw new DraftError(`event #${index}: intervention line and text must be strings`);
  }
  if (build !== undefined && typeof build !== "string") {
    throw new DraftError(`event #${index}: build must be a string`);
  }

  return {
    t,
    type: "draft_intervention",
    reason,
    said,
    line,
    text,
    ...(build === undefined ? {} : { build }),
  };
}

function parseDraftRun(raw: Record<string, unknown>, index: number): DraftRun {
  const { t, run, agent, until } = raw;

  if (typeof t !== "number" || typeof run !== "string" || typeof agent !== "string") {
    throw new DraftError(`event #${index}: a run must have t, run and agent`);
  }
  if (typeof until !== "number") {
    throw new DraftError(`event #${index}: run until must be a number`);
  }

  return { t, type: "draft_run", run, agent, until };
}

function parseDraftCheck(raw: Record<string, unknown>, index: number): DraftCheck {
  const { t, ok } = raw;

  if (typeof t !== "number" || typeof ok !== "boolean") {
    throw new DraftError(`event #${index}: a check must have t and ok`);
  }

  return { t, type: "draft_check", ok, ...parseEventMarks(raw, index) };
}

// A factory event passes the core check, which keeps only the format fields, so
// the draft tags, run `run` and project `project`, are read separately.
function parseEventMarks(raw: unknown, index: number): { run?: string; project?: string } {
  const { run, project } = isObject(raw) ? raw : { run: undefined, project: undefined };

  if (run !== undefined && typeof run !== "string") {
    throw new DraftError(`event #${index}: run must be a string`);
  }
  if (project !== undefined && typeof project !== "string") {
    throw new DraftError(`event #${index}: project must be a string`);
  }

  return {
    ...(run === undefined ? {} : { run }),
    ...(project === undefined ? {} : { project }),
  };
}

function parseDraftEvent(raw: unknown, index: number): DraftEvent {
  if (isObject(raw)) {
    switch (raw.type) {
      case "draft_prompt":
        return parseDraftPrompt(raw, index);
      case "draft_message":
        return parseDraftMessage(raw, index);
      case "draft_intervention":
        return parseDraftIntervention(raw, index);
      case "draft_run":
        return parseDraftRun(raw, index);
      case "draft_check":
        return parseDraftCheck(raw, index);
    }
  }

  return { ...parseSessionEvent(raw, index), ...parseEventMarks(raw, index) };
}

function parseBuild(raw: unknown, index: number): DraftBuild {
  if (!isObject(raw)) throw new DraftError(`build #${index}: must be an object`);

  // Drafts from before the language field live in capture/ and carry editing into the rebuilt
  // draft: their language still awaits editing.
  const { id, project, harness, workflow, title, language = "", runs, task } = raw;

  if (!isRecordId(id)) {
    throw new DraftError(
      `build #${index}: id must contain only letters, digits, underscores and hyphens`,
    );
  }
  if (
    typeof project !== "string" ||
    typeof harness !== "string" ||
    typeof workflow !== "string" ||
    typeof title !== "string" ||
    typeof language !== "string"
  ) {
    throw new DraftError(
      `build ${id}: project, harness, workflow, title and language must be strings`,
    );
  }
  if (!isStrings(runs)) throw new DraftError(`build ${id}: runs must be a list of strings`);
  if (task !== undefined && typeof task !== "string") {
    throw new DraftError(`build ${id}: task must be a string`);
  }

  return {
    id,
    project,
    harness,
    workflow,
    title,
    language,
    runs: [...runs],
    ...(task === undefined ? {} : { task }),
  };
}

function parseBuilds(raw: Record<string, unknown>): DraftBuild[] {
  if (!Array.isArray(raw.builds) || raw.builds.length === 0) {
    throw new DraftError("draft must have at least one build in builds");
  }

  return raw.builds.map(parseBuild);
}

function checkBuildIds(builds: readonly DraftBuild[]): void {
  const seen = new Set<string>();

  for (const { id } of builds) {
    if (seen.has(id)) throw new DraftError(`build ${id} is listed in builds twice`);

    seen.add(id);
  }
}

function checkRunsAreUnique(builds: readonly DraftBuild[]): void {
  const owners = new Map<string, string>();
  const claims = builds.flatMap((build) => build.runs.map((run) => ({ run, buildId: build.id })));

  for (const { run, buildId } of claims) {
    const owner = owners.get(run);

    if (owner !== undefined && owner !== buildId) {
      throw new DraftError(`run ${run} is listed in two builds: ${owner} and ${buildId}`);
    }

    owners.set(run, buildId);
  }
}

function isEditable(event: DraftEvent): event is EditableDraftEvent {
  return (
    event.type === "draft_prompt" ||
    event.type === "draft_message" ||
    event.type === "draft_intervention"
  );
}

function checkEventBuilds(builds: readonly DraftBuild[], events: readonly DraftEvent[]): void {
  const known = new Set(builds.map(({ id }) => id));

  events.forEach((event, index) => {
    if (!isEditable(event)) return;
    if (event.build !== undefined && !known.has(event.build)) {
      throw new DraftError(`event #${index}: unknown build ${event.build}`);
    }
  });
}

/**
 * Checks a draft read from a file: the editor edited it, so it cannot be trusted.
 * Clean prompt versions may still be empty; publishing checks them. An old draft
 * without `builds` is read as one build with the draft `id`.
 * @param {unknown} raw Parsed draft JSON.
 * @returns {Draft} Checked draft.
 * @throws {DraftError} If fields of the draft, its builds, prompts or messages have the wrong type,
 *   there are no builds, a build `id` repeats, a run is named in two builds or an event refers
 *   to an unknown build.
 * @throws {RecordError} If a factory event in the draft does not match the core format.
 */
export function parseDraft(raw: unknown): Draft {
  if (!isObject(raw)) throw new DraftError("draft must be an object");

  const { id, startedAt, events } = raw;

  if (typeof id !== "string" || typeof startedAt !== "string") {
    throw new DraftError("draft must have id and startedAt");
  }

  const builds = parseBuilds(raw);

  checkBuildIds(builds);
  checkRunsAreUnique(builds);

  if (!Array.isArray(events)) throw new DraftError("draft has no events");

  const parsedEvents = events.map(parseDraftEvent);

  checkEventBuilds(builds, parsedEvents);

  return { id, startedAt, builds, events: parsedEvents };
}

// An edit of a rebuilt draft is recognized by time and original text: for the same session
// they do not change, and a new event matches nothing.
function sameSaid(a: EditableDraftEvent, b: EditableDraftEvent): boolean {
  return a.type === b.type && a.t === b.t && a.said === b.said;
}

function editableEventsOf(draft: Draft): EditableDraftEvent[] {
  return draft.events.filter(isEditable);
}

// A prompt counts as edited if anything of its clean version is filled in, it is merged
// into the previous one or the editor assigned it a build; a message and an intervention, if
// the line or text is filled in or a build is assigned.
function isEdited(event: EditableDraftEvent): boolean {
  switch (event.type) {
    case "draft_prompt":
      return (
        event.goal !== "" ||
        event.requirements.length > 0 ||
        event.joined === true ||
        event.build !== undefined
      );
    case "draft_message":
    case "draft_intervention":
      return event.line !== "" || event.text !== "" || event.build !== undefined;
    default:
      return event satisfies never;
  }
}

function editedEventsOf(draft: Draft): EditableDraftEvent[] {
  return editableEventsOf(draft).filter(isEdited);
}

// A value the editor filled in the previous draft beats the value from the log.
function filledOr(earlier: string, fresh: string): string {
  return earlier === "" ? fresh : earlier;
}

function buildMark(earlier: { build?: string }): { build?: string } {
  return earlier.build === undefined ? {} : { build: earlier.build };
}

function carryOverPrompt(earlier: DraftPrompt, fresh: DraftPrompt): DraftPrompt {
  // Agents delete old transcripts: a model found earlier must not be lost.
  const model = fresh.model ?? earlier.model;

  return {
    ...fresh,
    goal: earlier.goal,
    requirements: [...earlier.requirements],
    ...(model === undefined ? {} : { model }),
    ...(earlier.joined === undefined ? {} : { joined: earlier.joined }),
    ...buildMark(earlier),
  };
}

function carryOverMessage(earlier: DraftMessage, fresh: DraftMessage): DraftMessage {
  return { ...fresh, line: earlier.line, text: earlier.text, ...buildMark(earlier) };
}

function carryOverIntervention(
  earlier: DraftIntervention,
  fresh: DraftIntervention,
): DraftIntervention {
  return { ...fresh, line: earlier.line, text: earlier.text, ...buildMark(earlier) };
}

function carryOverEvent(event: DraftEvent, edited: readonly EditableDraftEvent[]): DraftEvent {
  if (!isEditable(event)) return event;

  const earlier = edited.find((candidate) => sameSaid(candidate, event));

  if (earlier === undefined) return event;
  // sameSaid checked that the types match, but the compiler cannot narrow the pair through it.
  if (event.type === "draft_prompt" && earlier.type === "draft_prompt") {
    return carryOverPrompt(earlier, event);
  }
  if (event.type === "draft_message" && earlier.type === "draft_message") {
    return carryOverMessage(earlier, event);
  }
  if (event.type === "draft_intervention" && earlier.type === "draft_intervention") {
    return carryOverIntervention(earlier, event);
  }

  return event;
}

// The log knows the project and harness version only of the first build (the session ran on it);
// the editor created the other builds and fills in their header too.
function carryOverBuilds(previous: Draft, next: Draft): DraftBuild[] {
  const fresh = next.builds[0];

  return previous.builds.map((build) =>
    fresh?.id === build.id
      ? {
          ...build,
          project: filledOr(build.project, fresh.project),
          harness: filledOr(build.harness, fresh.harness),
          workflow: filledOr(build.workflow, fresh.workflow),
        }
      : build,
  );
}

/**
 * Carries editing from the previous draft of the same session into the rebuilt one: builds with
 * their titles, projects, factory versions, task labels and runs, clean prompts, "merged" marks,
 * messages, interventions and builds of prompts, messages and interventions. An empty project
 * and harness version of the build with the `id` of the rebuilt draft's first build come from
 * the log. New prompts and messages stay empty.
 * @param {Draft} previous Previous draft with editing already done.
 * @param {Draft} next Draft just built from the log.
 * @returns {Draft} Rebuilt draft with the editing carried over.
 */
export function carryOverEdits(previous: Draft, next: Draft): Draft {
  const edited = editedEventsOf(previous);
  const events = next.events.map((event) => carryOverEvent(event, edited));

  return { ...next, builds: carryOverBuilds(previous, next), events };
}

/**
 * Finds draft build header fields that still await editing: title, language, project,
 * harness version and workflow.
 * @param {Draft} draft Recordings draft.
 * @returns {UnfilledBuild[]} One element per build with empty fields, fields in header
 *   order; filled builds are skipped.
 */
export function unfilledHeader(draft: Draft): UnfilledBuild[] {
  return draft.builds.flatMap((build) => {
    const fields = HEADER_FIELDS.filter((field) => build[field] === "");

    return fields.length === 0 ? [] : [{ buildId: build.id, fields }];
  });
}

/**
 * Finds editing in the previous draft that has nothing to carry over to: the rebuilt draft has no
 * such prompt or message, for example because the original text was fixed by hand.
 * @param {Draft} previous Previous draft with editing already done.
 * @param {Draft} next Draft just built from the log.
 * @returns {EditableDraftEvent[]} Edited prompts and messages of the previous draft
 *   without a pair.
 */
export function orphanedEdits(previous: Draft, next: Draft): EditableDraftEvent[] {
  const nextEvents = editableEventsOf(next);

  return editedEventsOf(previous).filter(
    (event) => !nextEvents.some((candidate) => sameSaid(event, candidate)),
  );
}

/**
 * Finds runs the editor named in builds that are not in the log: for example, a run
 * written with a typo in `agentId`.
 * @param {Draft} draft Recordings draft.
 * @returns {string[]} Runs from build `runs` that have no `draft_run` window in the events.
 */
export function orphanedRuns(draft: Draft): string[] {
  const runs = draft.events.flatMap((event) => (event.type === "draft_run" ? [event.run] : []));
  const known = new Set(runs);

  return draft.builds.flatMap((build) => build.runs).filter((run) => !known.has(run));
}

/**
 * Finds messages whose route changed on recalculation although the editor already wrote a
 * line for them: it was written for the previous route and must be reread.
 * @param {Draft} previous Previous draft with editing.
 * @param {Draft} next Rebuilt draft with recalculated routes.
 * @returns {DraftMessage[]} Messages of the rebuilt draft with a filled line whose
 *   `from` or `to` differ from the previous ones.
 */
export function reroutedMessages(previous: Draft, next: Draft): DraftMessage[] {
  const earlier = previous.events.filter((event) => event.type === "draft_message");

  return next.events.flatMap((event) => {
    if (event.type !== "draft_message" || event.line === "") return [];

    const was = earlier.find((candidate) => sameSaid(candidate, event));

    return was !== undefined && (was.from !== event.from || was.to !== event.to) ? [event] : [];
  });
}

function toPublishedPrompt(
  prompt: Pick<DraftPrompt, "goal" | "requirements" | "model">,
  t: number,
): SessionEvent {
  const { goal, requirements, model } = prompt;

  return { t, type: "prompt", goal, requirements, ...(model === undefined ? {} : { model }) };
}

function toPublishedIntervention(
  intervention: Pick<InterventionEvent, "reason" | "line" | "text">,
  t: number,
): SessionEvent {
  const { reason, line, text } = intervention;

  return { t, type: "intervention", reason, line, text };
}

function toPublishedMessage(
  message: Pick<DraftMessage, "from" | "to" | "line" | "text">,
  t: number,
): SessionEvent {
  const { from, to, line, text } = message;

  return { t, type: "message", from, to, line, text };
}

// Tokens stay where the draft put them, so a stage's cost can be told from the recording. They do
// not take part in the build time: one may stand before the build's first event or inside a
// shrunk pause, so its time is held between the previous published event and the build end.
function toPublishedUsage(
  usage: UsageEvent,
  previousT: number,
  timeline: BuildTimeline,
): UsageEvent {
  const { tokens, model, breakdown } = usage;
  const t = Math.min(Math.max(timeline.at(usage.t), previousT), timeline.end);

  return withOptional<UsageEvent>({ t, type: "usage", tokens }, { model, breakdown });
}

// A merged prompt went into the previous unmerged one, so without that one it has nowhere to go.
// A repeat of the stage the build is already at does not go into the recording: two runs in a row
// gave it.
// `timeline` converts event time: from the build's first event and without long pauses.
function toPublishedEvents(events: readonly DraftEvent[], timeline: BuildTimeline): SessionEvent[] {
  const { at } = timeline;
  const published: SessionEvent[] = [];
  let hasPrompt = false;
  let currentStage: Stage | undefined;

  events.forEach((event, index) => {
    switch (event.type) {
      case "draft_prompt":
        if (event.joined !== true) {
          hasPrompt = true;
          published.push(toPublishedPrompt(event, at(event.t)));
        } else if (!hasPrompt) {
          throw new DraftError(`event #${index}: joined prompt has no previous prompt`);
        }

        return;
      case "prompt":
        hasPrompt = true;
        published.push(toPublishedPrompt(event, at(event.t)));

        return;
      case "draft_message":
      case "message":
        published.push(toPublishedMessage(event, at(event.t)));

        return;
      case "draft_intervention":
      case "intervention":
        published.push(toPublishedIntervention(event, at(event.t)));

        return;
      case "stage_enter":
        if (event.stage === currentStage) return;

        currentStage = event.stage;
        published.push(
          withOptional<StageEnterEvent>(
            { t: at(event.t), type: "stage_enter", stage: event.stage },
            { model: event.model },
          ),
        );

        return;
      case "stage_fail":
        published.push({
          t: at(event.t),
          type: "stage_fail",
          stage: event.stage,
          reason: event.reason,
        });

        return;
      case "usage":
        published.push(toPublishedUsage(event, published.at(-1)?.t ?? 0, timeline));

        return;
      case "draft_run":
      case "draft_check":
      case "build_start":
      case "build_end":
        return;
      default:
        return event satisfies never;
    }
  });

  return published;
}

function textsOf(event: SessionEvent): string[] {
  switch (event.type) {
    case "prompt":
      return [
        event.goal,
        ...event.requirements,
        ...(event.model === undefined ? [] : [event.model]),
      ];
    case "stage_fail":
      return [event.reason];
    case "message":
    case "intervention":
      return [event.line, event.text];
    case "stage_enter":
    case "usage":
      return event.model === undefined ? [] : [event.model];
    case "build_start":
    case "build_end":
      return [];
    default:
      // A new event type does not compile until it is decided here whether it has text for the
      // site.
      return event satisfies never;
  }
}

// The build outcome is the last verdict or checks run; without checks the build counts as
// successful.
function checksPassed(events: readonly DraftEvent[]): boolean {
  return events.findLast((event) => event.type === "draft_check")?.ok ?? true;
}

function buildOf(draft: Draft, buildId: string): DraftBuild {
  const build = draft.builds.find(({ id }) => id === buildId);

  if (build === undefined) throw new DraftError(`draft has no build ${buildId}`);

  return build;
}

// An empty label is the same as none: the editor may leave the field blank.
function taskMark({ task }: DraftBuild): { task?: string } {
  return task === undefined || task === "" ? {} : { task };
}

function checkNoLeaks({ data }: SessionRecord, buildId: string): void {
  const header = [
    data.title,
    data.harness,
    data.workflow,
    ...(data.task === undefined ? [] : [data.task]),
  ];
  const texts = [...header, ...data.events.flatMap(textsOf)];
  const leaks = texts.flatMap((text) => findLeaks(text).map((kind) => ({ kind, text })));

  if (leaks.length === 0) return;

  throw new KitError((messages) => {
    const described = leaks.map(({ kind, text }) =>
      messages.errors.leakIn({ kind: messages.leakKinds[kind], text }),
    );

    return messages.errors.leaksFound({ buildId, leaks: described.join("; ") });
  });
}

/**
 * The events that belong to one build, in draft order, by the ownership rules of `eventBuilds`.
 * @param {Draft} draft Draft with at least one build.
 * @param {string} buildId Id of the build.
 * @returns {DraftEvent[]} Events of the build.
 */
export function eventsOfBuild(draft: Draft, buildId: string): DraftEvent[] {
  const owners = eventBuilds(draft);

  return draft.events.filter((_event, index) => owners[index] === buildId);
}

/**
 * Turns the given events of one build into a recording: time from its first event and without long
 * pauses, without the original texts of prompts and messages, without the original texts of
 * interventions, without `project` and `run` tags, without merged prompts and draft service events.
 * Token `usage` events stay at their places with the model and the breakdown: they are not summed.
 * The text is not checked for leaks. It is `recordOfBuild` with the choice of events left to the
 * caller, for a caller that has to change them after the build ownership is known.
 * @param {Draft} draft Draft whose build header and start time the recording takes.
 * @param {string} buildId Id of the build.
 * @param {readonly DraftEvent[]} events Events of the build: `eventsOfBuild` or derived from it.
 * @param {RecordSource} source Who made the build: the agent that ran the session.
 * @returns {SessionRecord} Recording with the build `id` that passed the core format check.
 * @throws {RecordError} If the title, project, harness version, a clean prompt or a message
 *   of the build is empty or the recording does not match the core format.
 * @throws {DraftError} If there is no such build or a merged prompt has no preceding unmerged one.
 * @throws {KitError} If the build has no events.
 */
export function recordOfEvents(
  draft: Draft,
  buildId: string,
  events: readonly DraftEvent[],
  source: RecordSource,
): SessionRecord {
  const build = buildOf(draft, buildId);
  const timeline = buildTimeline(events);

  if (timeline === undefined) {
    throw new KitError((messages) => messages.errors.buildHasNoEvents(buildId));
  }

  const published: SessionEvent[] = [
    { t: 0, type: "build_start" },
    ...toPublishedEvents(events, timeline),
    { t: timeline.end, type: "build_end", ok: checksPassed(events) },
  ];
  const record = parseRecord({
    version: RECORD_VERSION,
    type: "session",
    id: build.id,
    timestamp: new Date(Date.parse(draft.startedAt) + timeline.start).toISOString(),
    projectId: build.project,
    source,
    data: {
      title: build.title,
      language: build.language,
      workflow: build.workflow,
      harness: build.harness,
      ...taskMark(build),
      events: published,
    },
  });

  if (record.type !== "session") {
    throw new DraftError(`build ${buildId} was not published as a session`);
  }

  return record;
}

/**
 * Turns one build of a draft into a recording: only events of this build, time from its first
 * event and without long pauses, without the original texts of prompts and messages, without the
 * original texts of interventions, without `project` and `run` tags, without merged prompts and
 * draft service events. Token `usage` events stay at their places with the model and the
 * breakdown: they are not summed. The text is not checked for leaks: `publishBuild` does that.
 * @param {Draft} draft Draft with the title, project, harness version, clean prompts and messages
 *   of the build filled in.
 * @param {string} buildId Id of the build.
 * @param {RecordSource} source Who made the build: the agent that ran the session.
 * @returns {SessionRecord} Recording with the build `id` that passed the core format check.
 * @throws {RecordError} If the title, project, harness version, a clean prompt or a message
 *   of the build is empty or the recording does not match the core format.
 * @throws {DraftError} If there is no such build or a merged prompt has no preceding unmerged one.
 * @throws {KitError} If the build has no events.
 */
export function recordOfBuild(draft: Draft, buildId: string, source: RecordSource): SessionRecord {
  return recordOfEvents(draft, buildId, eventsOfBuild(draft, buildId), source);
}

/**
 * Turns one build of an edited draft into a recording for the site: `recordOfBuild` plus the check
 * that no address, key or personal path is left in the texts to publish.
 * @param {Draft} draft Draft with the title, project, harness version,
 *   clean prompts and messages of the published build filled in.
 * @param {string} buildId Id of the published build.
 * @param {RecordSource} source Who made the build: the agent that ran the session.
 * @returns {SessionRecord} Recording with the build `id` that passed the core format check.
 * @throws {RecordError} If the title, project, harness version, a clean prompt or a message
 *   of the build is empty or the recording does not match the core format.
 * @throws {DraftError} If there is no such build or a merged prompt has no preceding unmerged one.
 * @throws {KitError} If the build has no events or the text to publish looks like an address,
 *   a key or a personal path.
 */
export function publishBuild(draft: Draft, buildId: string, source: RecordSource): SessionRecord {
  const record = recordOfBuild(draft, buildId, source);

  checkNoLeaks(record, buildId);

  return record;
}

/**
 * Turns all draft builds into recordings for the site; throws if any one is not ready.
 * @param {Draft} draft Draft with all builds filled in.
 * @param {RecordSource} source Who made the builds: the agent that ran the session.
 * @returns {SessionRecord[]} Recordings in the order of the draft's builds.
 * @throws {RecordError} If a build does not match the core format.
 * @throws {DraftError} For the same reasons as `publishBuild`.
 * @throws {KitError} For the same reasons as `publishBuild`.
 */
export function publishDraft(draft: Draft, source: RecordSource): SessionRecord[] {
  return draft.builds.map((build) => publishBuild(draft, build.id, source));
}
