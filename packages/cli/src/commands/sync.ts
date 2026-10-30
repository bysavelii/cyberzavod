// `cyberzavod sync`: looks at the stack again, sets the current harness version in the config and
// brings the agent files in line with the harness. `--check` and `--diff` only show what will
// change: the first exits with code 1 if anything is outdated (so project checks catch outdated
// files), the second with code 0.

import type { SyncReport } from "@cyberzavod/adapter-kit";
import type { ProjectConfig } from "@cyberzavod/core";
import { LEGACY_TOOL_FILE, PROJECT_CONFIG_FILE, writeProjectConfig } from "@cyberzavod/storage";
import type {
  AgentAdapter,
  CarriedOver,
  FilesRequest,
  UserConfigChange,
} from "../agents/agent-adapter.ts";
import { connectedAdaptersOf, type NonEmpty } from "../agents/host-agent.ts";
import type { Adapters } from "../agents/registry.ts";
import { detectProject, stackOf } from "../detect.ts";
import { HARNESS_VERSION, type Installation } from "../installation/installation.ts";
import { printJson } from "../json-output.ts";
import type { CliMessages } from "../messages/cli-messages.ts";
import { hasLegacyTool, removeLegacyTool } from "./legacy-tool.ts";
import { requireProjectAt, type ProjectAt } from "./project.ts";

/** What sync needs: whether to overwrite the human's files, Cyberzavod version and texts. */
export interface SyncCommandOptions {
  /** Overwrite files the human wrote or edited by hand. */
  force: boolean;
  /** The running Cyberzavod version. */
  installation: Installation;
  /** Messages in the chosen language. */
  messages: CliMessages;
  /** Adapters of the agents the CLI can drive. */
  adapters: Adapters;
}

/** How to show what sync will change: as text for the human or as JSON for scripts. */
export interface PreviewOptions {
  installation: Installation;
  messages: CliMessages;
  adapters: Adapters;
  isJson: boolean;
}

/**
 * State of the agent files: everything matches (`current`), sync will update them (`outdated`),
 * sync will stop at files written or edited by the human (`blocked`).
 */
export type FilesStatus = "current" | "outdated" | "blocked";

async function refreshedConfig(root: string, config: ProjectConfig): Promise<ProjectConfig> {
  const detected = await detectProject(root);

  return { ...config, harness: HARNESS_VERSION, stack: stackOf(detected) };
}

function printFiles(title: string, files: readonly string[]): void {
  if (files.length === 0) return;

  const lines = files.map((file) => `  ${file}`);

  console.log(`${title}:\n${lines.join("\n")}`);
}

function printWrittenReport(report: SyncReport, messages: CliMessages): void {
  const { sync } = messages;

  printFiles(sync.added, report.added);
  printFiles(sync.updated, report.updated);
  printFiles(sync.removed, report.removed);

  if (isClean(report)) console.log(sync.upToDate);
}

function printPreview(
  report: SyncReport,
  adapters: readonly AgentAdapter[],
  messages: CliMessages,
): void {
  const { sync } = messages;

  printFiles(sync.willAdd, report.added);
  printFiles(sync.willUpdate, report.updated);
  printFiles(sync.willRemove, report.removed);
  printFiles(sync.yours, report.conflicts);
  printFiles(sync.edited, report.edited);

  for (const adapter of adapters) console.log(sync.neverTouched(adapter.terms));
}

function withLegacyTool(report: SyncReport, isLegacyToolRemoved: boolean): SyncReport {
  return isLegacyToolRemoved
    ? { ...report, removed: [LEGACY_TOOL_FILE, ...report.removed] }
    : report;
}

// The agents share files such as the manifest: each agent reports it, the human sees it once.
function mergedFiles(reports: readonly SyncReport[], list: keyof SyncReport): string[] {
  const files = reports.flatMap((report) => report[list]);

  return [...new Set(files)];
}

function mergedReport(reports: readonly SyncReport[]): SyncReport {
  return {
    added: mergedFiles(reports, "added"),
    updated: mergedFiles(reports, "updated"),
    removed: mergedFiles(reports, "removed"),
    conflicts: mergedFiles(reports, "conflicts"),
    edited: mergedFiles(reports, "edited"),
  };
}

function isClean(report: SyncReport): boolean {
  const lists = [report.added, report.updated, report.removed, report.conflicts, report.edited];

  return lists.every((files) => files.length === 0);
}

/**
 * State of the agent files from the comparison report.
 * @param {SyncReport} report `sync` report in check mode.
 * @returns {FilesStatus} Match, outdated, or sync will stop at someone else's files.
 */
export function filesStatusOf(report: SyncReport): FilesStatus {
  if (report.conflicts.length + report.edited.length > 0) return "blocked";

  return isClean(report) ? "current" : "outdated";
}

/** What differs from the running version: the agent files and the harness version in the config. */
export interface ProjectFilesInspection {
  /** Agent files that are outdated, extra, written by the human or edited by hand. */
  report: SyncReport;
  /** Harness version in the project config. */
  configVersion: string;
  /** The config version does not match the running CLI version. */
  isHarnessOutdated: boolean;
}

/**
 * Compares the project's agent files with what the running version would build, writing nothing.
 * @param {ProjectAt} project Connected project.
 * @param {Installation} installation The running Cyberzavod version.
 * @param {readonly AgentAdapter[]} adapters Adapters of the agents that drive the project.
 * @returns {Promise<ProjectFilesInspection>} File and version differences of all the agents.
 * @throws {Error} If the agent files cannot be built.
 */
export async function inspectProjectFiles(
  project: ProjectAt,
  installation: Installation,
  adapters: readonly AgentAdapter[],
): Promise<ProjectFilesInspection> {
  const reports = await Promise.all(
    adapters.map((adapter) => adapter.inspectFiles(project.root, installation)),
  );
  const adapterReport = mergedReport(reports);
  const isLegacyToolPresent = await hasLegacyTool(project.root);

  return {
    report: withLegacyTool(adapterReport, isLegacyToolPresent),
    configVersion: project.config.harness,
    isHarnessOutdated: project.config.harness !== HARNESS_VERSION,
  };
}

function printPreviewText(
  inspection: ProjectFilesInspection,
  adapters: readonly AgentAdapter[],
  messages: CliMessages,
): void {
  const { report, configVersion, isHarnessOutdated } = inspection;
  const status = filesStatusOf(report);

  if (isHarnessOutdated) {
    console.log(
      messages.sync.harnessMismatch({
        file: PROJECT_CONFIG_FILE,
        configVersion,
        cliVersion: HARNESS_VERSION,
      }),
    );
  }

  printPreview(report, adapters, messages);
  console.log(conclusionOf(status, isHarnessOutdated, messages));
}

function conclusionOf(status: FilesStatus, isHarnessOutdated: boolean, messages: CliMessages) {
  switch (status) {
    case "current":
      return isHarnessOutdated ? messages.sync.filesOutdated : messages.sync.upToDate;
    case "outdated":
      return messages.sync.filesOutdated;
    case "blocked":
      return messages.sync.blocked;
    default:
      return status satisfies never;
  }
}

function printPreviewJson(inspection: ProjectFilesInspection): void {
  const { report, configVersion, isHarnessOutdated } = inspection;
  const status = filesStatusOf(report);
  const overall = status === "current" && isHarnessOutdated ? "outdated" : status;

  printJson("sync", {
    status: overall,
    harness: { config: configVersion, cli: HARNESS_VERSION, isOutdated: isHarnessOutdated },
    files: report,
  });
}

/**
 * Shows what sync will change, writing nothing.
 * @param {string} directory Directory inside the project.
 * @param {PreviewOptions} options Version, messages, adapters and output format.
 * @returns {Promise<boolean>} true if there is nothing to sync.
 * @throws {Error} If there is no project or the agent files cannot be built.
 */
export async function previewProject(directory: string, options: PreviewOptions): Promise<boolean> {
  const { installation, messages, adapters, isJson } = options;
  const project = await requireProjectAt(directory);
  const connected = connectedAdaptersOf(project.config, adapters);
  const inspection = await inspectProjectFiles(project, installation, connected);

  if (isJson) printPreviewJson(inspection);
  else printPreviewText(inspection, connected, messages);

  return isClean(inspection.report) && !inspection.isHarnessOutdated;
}

/**
 * Syncs the agent's files; an agent that asks the human to approve its hooks keeps the approval
 * for the new hooks.
 * @param {AgentAdapter} adapter The agent.
 * @param {FilesRequest} request Which files to write and whether the human's may be overwritten.
 * @returns {Promise<CarriedOver<SyncReport>>} What was written and the approval that moved.
 * @throws {Error} If the agent files cannot be built or the agent's own config cannot be read.
 */
async function syncFilesCarryingTrust(
  adapter: AgentAdapter,
  request: FilesRequest,
): Promise<CarriedOver<SyncReport>> {
  const writeFiles = () => adapter.syncFiles(request);

  if (adapter.userConfig === undefined) return { value: await writeFiles(), change: undefined };

  return adapter.userConfig.carryOver(request.projectDirectory, writeFiles);
}

async function requireWritableFiles(
  project: ProjectAt,
  config: ProjectConfig,
  installation: Installation,
  adapters: NonEmpty<AgentAdapter>,
): Promise<void> {
  for (const adapter of adapters) {
    adapter.requireWritable(
      await adapter.previewFiles({ root: project.root, config }, installation),
    );
  }
}

/**
 * Syncs the project with the harness: updates the config and the files of every connected agent,
 * removes the CLI of earlier versions. If a generator runs into the human's files, nothing
 * changes, the config included.
 * @param {string} directory Directory inside the project.
 * @param {SyncCommandOptions} options Whether to overwrite the human's files, version, messages,
 *   adapters.
 * @returns {Promise<void>} Done when everything is written.
 * @throws {Error} If there is no project or the agent files cannot be built.
 */
export async function syncProject(directory: string, options: SyncCommandOptions): Promise<void> {
  const { force, installation, messages, adapters } = options;
  const project = await requireProjectAt(directory);
  const connected = connectedAdaptersOf(project.config, adapters);
  const config = await refreshedConfig(project.root, project.config);

  // The human's files are looked for before the first write: on a conflict the config stays as it
  // was.
  if (!force) await requireWritableFiles(project, config, installation, connected);

  await writeProjectConfig(project.root, config);

  const isLegacyToolPresent = await hasLegacyTool(project.root);

  if (isLegacyToolPresent) await removeLegacyTool(project.root);

  const reports: SyncReport[] = [];
  const changes: UserConfigChange[] = [];

  for (const adapter of connected) {
    const request = { projectDirectory: project.root, installation, force };
    const { value, change } = await syncFilesCarryingTrust(adapter, request);

    reports.push(value);

    if (change !== undefined) changes.push(change);
  }

  printWrittenReport(withLegacyTool(mergedReport(reports), isLegacyToolPresent), messages);

  for (const change of changes) console.log(messages.sync.trustRefreshed(change.file));
}
