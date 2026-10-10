// Shared code of the agent adapters: ownership of generated files, hooks files, the manifest,
// templates and the texts both agents use. It knows no agent by name; each adapter builds on it.

export { CLI_COMMAND, PACKAGE_NAME, pinnedCliCommand } from "./cli-command.ts";
export { KitError } from "./errors.ts";
export {
  MAX_COMMAND_LENGTH,
  parseRawLog,
  RawLogError,
  subagentNameOf,
  UNKNOWN_NAME,
  verdictOf,
  withOptional,
  type RawEvent,
} from "./capture/raw-event.ts";
export { isHumanPrompt } from "./capture/service-messages.ts";
export {
  carryOverEdits,
  DraftError,
  orphanedEdits,
  orphanedRuns,
  parseDraft,
  publishBuild,
  publishDraft,
  reroutedMessages,
  unfilledHeader,
  type Draft,
  type DraftBuild,
  type DraftCheck,
  type DraftEvent,
  type DraftIntervention,
  type DraftMessage,
  type DraftPrompt,
  type DraftRun,
  type EditableDraftEvent,
  type HeaderField,
  type MessageSource,
  type UnfilledBuild,
} from "./capture/draft.ts";
export {
  buildTimeline,
  eventBuilds,
  IDLE_GAP_MS,
  projectsWithoutBuild,
  unassignedRuns,
} from "./capture/builds.ts";
export { findLeaks, type LeakKind } from "./capture/leaks.ts";
export {
  directoriesOutsideProjects,
  routeMessages,
  runTranscriptPaths,
  sessionTranscriptPath,
  sessionTranscriptPaths,
  stationTranscriptPaths,
  toDraft,
  toolDirectories,
  type DraftMeta,
} from "./capture/to-draft.ts";
export type {
  AgentAssignment,
  AgentReport,
  ModelReply,
  TokenUsage,
  TranscriptText,
} from "./capture/transcript-model.ts";
export {
  readTranscriptFile,
  transcriptsOf,
  withToolOutcomes,
  type DraftInputs,
  type SessionTranscripts,
  type TranscriptFormat,
  type TranscriptMeta,
  type TranscriptRead,
  type TranscriptReader,
} from "./capture/transcripts.ts";
export {
  draftSession,
  type AgentDraftOptions,
  type DraftSessionOptions,
  type SessionCapture,
} from "./commands/draft.ts";
export {
  publishSessions,
  type AgentPublishOptions,
  type PublishSessionsOptions,
} from "./commands/publish.ts";
export { SILENT_EXIT, type HookContext, type HookOutcome } from "./hooks/hook.ts";
export { recordEvent, RecordHookError, type RawEventSource } from "./hooks/record.ts";
export { hookStatePath } from "./hooks/state.ts";
export { gateStop } from "./hooks/stop-gate.ts";
export { startTurn } from "./hooks/turn-start.ts";
export { isObject, stringField } from "./object.ts";
export {
  applyDisconnect,
  isEmptySettings,
  plannedDisconnectFiles,
  settingsOutcomeOf,
  settingsText,
  withoutAdapterHooks,
  type DisconnectOptions,
  type DisconnectPlan,
  type FilesDisconnectSource,
  type SettingsDisconnect,
  type SettingsOutcome,
} from "./generate/disconnect-plan.ts";
export {
  applySyncPlan,
  directoriesWith,
  fileAt,
  filesOnDisk,
  generatedCandidates,
  ownershipOf,
  planSyncFiles,
  readOptional,
  relativeTo,
  removeEmptyParents,
  removeGeneratedFiles,
  requireWritable,
  type CandidateSource,
  type FileOnDisk,
  type Ownership,
  type PlanSource,
  type SyncPlan,
  type SyncReport,
} from "./generate/file-plan.ts";
export {
  hookCommand,
  hookNameOf,
  groupsOf,
  inPosixShell,
  inspectHooks,
  isOwnHandler,
  mergedHooks,
  parseSettings,
  SettingsError,
  SKIP_ON_FAILURE,
  STOP_GATE_TIMEOUT_SECONDS,
  STOP_STATUS_MESSAGE,
  stopFailureCommand,
  TURN_START_TIMEOUT_SECONDS,
  unparsedSettings,
  withoutOwnHooks,
  type AdapterHooks,
  type HookCommandSource,
  type HookGroup,
  type HookHandler,
  type HooksComparison,
  type HooksInspection,
  type Settings,
} from "./generate/hook-config.ts";
export {
  contentHash,
  EMPTY_MANIFEST,
  MANIFEST_FILE,
  manifestText,
  parseManifest,
  type Manifest,
} from "./generate/manifest.ts";
export {
  GENERATED_MARK,
  HASH_GENERATED_COMMENT,
  isGenerated,
  LEGACY_GENERATED_MARK,
  MARKDOWN_GENERATED_COMMENT,
  type GeneratedFile,
} from "./generate/marks.ts";
export {
  recordingTemplateValues,
  renderTemplate,
  templateValues,
  type RecordingFragments,
  type RecordingTemplateSource,
  type RecordingTerms,
  type TemplateSource,
} from "./generate/template.ts";
export {
  ownStageSections,
  stageGuidesOf,
  stageTable,
  workingRulesParagraphs,
  type WorkingRulesSource,
} from "./generate/workflow-text.ts";
export { KIT_MESSAGES } from "./messages/catalog.ts";
export type {
  DraftMessages,
  KitErrorMessages,
  KitMessages,
  PublishMessages,
  RecordMessages,
  StopMessages,
} from "./messages/kit-messages.ts";
export {
  captureDirectories,
  findProjectId,
  locatedFromPlanned,
  locateProject,
  newestFile,
  requireProject,
  type CaptureDirectories,
  type LocatedProject,
  type PlannedProject,
} from "./paths.ts";
