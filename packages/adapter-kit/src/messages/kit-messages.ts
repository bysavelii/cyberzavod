// Texts the adapters share, for the human and the agent: the stop hook (the agent reads its message
// as a task), the capture hook, drafting, previewing and publishing recordings, and errors of the
// shared code.
// A value is a string or a function; with two or more parameters, one object with named fields.
// The sets live in `en.ts` and `ru.ts`; the CLI picks the language.

import type { InterventionReason, UnknownCostReason } from "@cyberzavod/core";
import type { HeaderField } from "../capture/draft.ts";
import type { LeakKind } from "../capture/leaks.ts";

/** Stop hook texts: the agent receives them as the hook's message. */
export interface StopMessages {
  configUnreadable(params: { file: string; reason: string }): string;
  gitUnavailable(reason: string): string;
  counterNotSaved(file: string): string;
  checksFailing(params: {
    command: string;
    attempt: number;
    maxAttempts: number;
    output: string;
  }): string;
  humanCalled(maxAttempts: number): string;
  markerNotSaved: string;
}

/** Session capture hook texts. */
export interface RecordMessages {
  sessionNotRecorded(reason: string): string;
  markerNotClaimed(params: { file: string; reason: string }): string;
}

/** Texts of the `draft` command. */
export interface DraftMessages {
  configNotRead(reason: string): string;
  transcriptNotRead(params: { file: string; reason: string }): string;
  transcriptsMissing(count: number): string;
  transcriptCompressed(file: string): string;
  sessionTranscriptNotRead(reason: string): string;
  stationTranscriptsMissing(count: number): string;
  /** Intervention label in warnings and in the list awaiting editing. */
  intervention(params: { reason: InterventionReason; text: string }): string;
  editNotCarried(title: string): string;
  assignmentNotFound: string;
  draftFile(file: string): string;
  counts(params: { prompts: number; messages: number; interventions: number }): string;
  build(params: {
    id: string;
    project: string;
    harness: string;
    workflow: string;
    runs: number;
    events: number;
  }): string;
  unfilledHeader(params: { buildId: string; fields: string }): string;
  projectWithoutBuild(project: string): string;
  directoryOutsideProject(directory: string): string;
  waiting(count: number): string;
  unassignedRuns(count: number): string;
  unassignedRun(params: { agent: string; run: string; clock: string; line: string }): string;
  orphanedRun(run: string): string;
  reroutedMessage(params: { line: string; from: string; to: string }): string;
}

/** Texts of the `publish` command. */
export interface PublishMessages {
  published(file: string): string;
  notReady(params: { file: string; problems: string }): string;
  buildProblem(params: { buildId: string; reason: string }): string;
  /** Cost of a published recording at API prices; `pricesAsOf` is the day the prices were checked. */
  cost(params: { usd: number; pricesAsOf: string }): string;
  /** Why the cost of a published recording cannot be told. */
  costUnknown(reason: UnknownCostReason): string;
}

/** Texts of previewing drafts as recordings. */
export interface PreviewMessages {
  /** Title of a build the editor has not titled yet. */
  untitled(buildId: string): string;
  /** A draft or a build that cannot be shown; the file is relative to the project. */
  skipped(params: { file: string; buildId?: string; reason: string }): string;
}

/** Texts of errors that come from generating agent files and from recordings, the same for every agent. */
export interface KitErrorMessages {
  fileConflicts(files: string): string;
  settingsNotObject(file: string): string;
  settingsNotParsed(params: { file: string; reason: string }): string;
  manifestNotParsed(params: { file: string; reason: string }): string;
  unknownPlaceholder(placeholder: string): string;
  projectNotFound(directory: string): string;
  noDrafts: string;
  noRawLogs(directory: string): string;
  earlierDraftNotParsed(file: string): string;
  noBuild(buildId: string): string;
  buildHasNoEvents(buildId: string): string;
  leaksFound(params: { buildId: string; leaks: string }): string;
  leakIn(params: { kind: string; text: string }): string;
}

/** All texts shared by the adapters. */
export interface KitMessages {
  stop: StopMessages;
  record: RecordMessages;
  draft: DraftMessages;
  publish: PublishMessages;
  preview: PreviewMessages;
  errors: KitErrorMessages;
  /** Names of the kinds of content that must not be published: for the leak message. */
  leakKinds: Readonly<Record<LeakKind, string>>;
  /** Names of the build header fields: what the editor has not filled in yet. */
  headerFields: Readonly<Record<HeaderField, string>>;
}
