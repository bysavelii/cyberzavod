// Syncs the project's Claude Code files with the harness and config: what is generated anew is
// overwritten; what was generated earlier and is no longer needed is deleted; what the human wrote
// is not touched without explicit permission. The shared part lives in the adapter kit.

import {
  applySyncPlan,
  captureDirectories,
  directoriesWith,
  fileAt,
  generatedCandidates,
  locatedFromPlanned,
  MANIFEST_FILE,
  manifestTextWith,
  parseManifest,
  parseSettings,
  pinnedCliCommand,
  planSyncFiles,
  readOptional,
  relativeTo,
  requireProject,
  settingsText,
  contentHash,
  type GeneratedFile,
  type KitError,
  type LocatedProject,
  type Manifest,
  type ManifestOwner,
  type PlannedProject,
  SettingsError,
  type Settings,
  type SyncPlan,
  type SyncReport,
} from "@cyberzavod/adapter-kit";
import type { Harness } from "@cyberzavod/core";
import { workflowOf } from "@cyberzavod/storage";
import { CLAUDE_AGENT, type GenerateError } from "./claude.ts";
import { claudeFiles, type ClaudeProject, type ClaudeTemplates } from "./files.ts";
import {
  adapterHooks,
  mergeSettings,
  missingAdapterDeny,
  SETTINGS_FILE,
  unparsedSettings,
} from "./settings.ts";

const RULES_FILE = "AGENTS.md";
const ENTRYPOINT_FILE = "CLAUDE.md";
const GENERATED_DIRECTORIES = [".claude/agents", ".claude/skills"].map((directory) => ({
  directory,
  extensions: [".md"],
}));

function isInGeneratedDirectory(file: string): boolean {
  return GENERATED_DIRECTORIES.some(({ directory }) => file.startsWith(`${directory}/`));
}

function isEntrypoint(file: string): boolean {
  return file === ENTRYPOINT_FILE || file.endsWith(`/${ENTRYPOINT_FILE}`);
}

/** The Claude Code section of the shared manifest: its files are in `.claude/` and `CLAUDE.md`. */
export const CLAUDE_MANIFEST_OWNER: ManifestOwner = {
  agent: CLAUDE_AGENT,
  ownsFile: (file) => isInGeneratedDirectory(file) || isEntrypoint(file),
};

/** What to generate from: the harness and templates of the running Cyberzavod version. */
export interface ClaudeInstallation {
  harness: Harness;
  templates: ClaudeTemplates;
}

/** What to do: only compare or write, and whether what the human wrote may be overwritten. */
export interface SyncOptions {
  /** Directory inside the project. */
  projectDirectory: string;
  installation: ClaudeInstallation;
  /** Only compare the files on disk with the generated ones, writing nothing. */
  check?: boolean;
  /** Overwrite files written by the human rather than the generator. */
  force?: boolean;
}

function inDirectory(directory: string, fileName: string): string {
  return directory === "" ? fileName : `${directory}/${fileName}`;
}

async function claudeProjectOf(
  project: LocatedProject,
  installation: ClaudeInstallation,
): Promise<ClaudeProject> {
  const { harness, templates } = installation;
  const capture = captureDirectories(project.journal, CLAUDE_AGENT);

  return {
    config: project.config,
    harness,
    workflow: workflowOf(harness, project.config.workflow),
    rules: await directoriesWith(project.root, RULES_FILE, project.journal),
    capture: {
      raw: relativeTo(project.root, capture.raw),
      drafts: relativeTo(project.root, capture.drafts),
    },
    cli: pinnedCliCommand(project.config.harness),
    templates,
  };
}

function settingsWithAdapterHooks(current: Settings, version: string): Settings {
  try {
    return mergeSettings(current, adapterHooks(version));
  } catch (err) {
    if (err instanceof SettingsError) throw unparsedSettings(err);

    throw err;
  }
}

function settingsFile(current: Settings, version: string): GeneratedFile {
  return {
    path: SETTINGS_FILE,
    content: settingsText(settingsWithAdapterHooks(current, version)),
  };
}

// Settings and manifest are shared: the generator edits only its part of the settings; the
// manifest is its own.
const SHARED_FILES: ReadonlySet<string> = new Set([SETTINGS_FILE, MANIFEST_FILE]);

/**
 * Files the generator wrote earlier: with the generated mark or from the manifest.
 * @param {LocatedProject} project Project.
 * @param {Manifest} manifest Manifest of generated output.
 * @returns {Promise<string[]>} Paths from the root with `/`; the file at a path may be gone.
 */
export async function generatedCandidatesOf(
  project: LocatedProject,
  manifest: Manifest,
): Promise<string[]> {
  const { root, journal } = project;
  const entrypointDirectories = await directoriesWith(root, ENTRYPOINT_FILE, journal);
  const entrypoints = entrypointDirectories.map((directory) =>
    inDirectory(directory, ENTRYPOINT_FILE),
  );

  return generatedCandidates(root, manifest, GENERATED_DIRECTORIES, entrypoints);
}

function manifestOf(files: GeneratedFile[], deny: readonly string[]): Manifest {
  const owned = files.filter((file) => file.path !== SETTINGS_FILE);
  const hashes = owned.map((file) => [file.path, contentHash(file.content)] as const);

  return { files: Object.fromEntries(hashes), deny };
}

/**
 * Reads the Claude Code section of the manifest of generated output.
 * @param {string} root Project root.
 * @returns {Promise<Manifest>} The section; empty if there is no file or no section.
 * @throws {KitError} If the manifest cannot be parsed.
 */
export async function readManifest(root: string): Promise<Manifest> {
  return parseManifest(await readOptional(fileAt(root, MANIFEST_FILE)), CLAUDE_MANIFEST_OWNER);
}

/**
 * Reads the project's Claude Code settings.
 * @param {string} root Project root.
 * @returns {Promise<Settings>} The settings; an empty object if there is no file.
 * @throws {KitError} If the file is not JSON or not an object.
 */
export async function readSettings(root: string): Promise<Settings> {
  return parseSettings(await readOptional(fileAt(root, SETTINGS_FILE)), SETTINGS_FILE);
}

function addedDeny(settings: Settings): string[] {
  try {
    return missingAdapterDeny(settings);
  } catch (err) {
    if (err instanceof SettingsError) throw unparsedSettings(err);

    throw err;
  }
}

async function planSync(
  project: LocatedProject,
  installation: ClaudeInstallation,
  force: boolean,
): Promise<SyncPlan> {
  const claudeProject = await claudeProjectOf(project, installation);
  const manifest = await readManifest(project.root);
  const settings = await readSettings(project.root);
  const deny = [...new Set([...manifest.deny, ...addedDeny(settings)])];
  const generated = [...claudeFiles(claudeProject), settingsFile(settings, project.config.harness)];
  const manifestSource = await readOptional(fileAt(project.root, MANIFEST_FILE));
  const manifestFile = {
    path: MANIFEST_FILE,
    content: manifestTextWith(manifestSource, CLAUDE_MANIFEST_OWNER, manifestOf(generated, deny)),
  };
  const files = [...generated, manifestFile];

  return planSyncFiles({
    root: project.root,
    files,
    manifest,
    force,
    sharedFiles: SHARED_FILES,
    candidates: await generatedCandidatesOf(project, manifest),
  });
}

/**
 * Brings the project's Claude Code files in line with the harness and config: CLAUDE.md next to
 * each AGENTS.md, role agents, skills, hooks in the settings, and the manifest of generated output.
 * @param {SyncOptions} options Project and mode.
 * @returns {Promise<SyncReport>} What was written and deleted or, in a check, what is outdated.
 * @throws {GenerateError} If the config gives a Claude Code stage another provider.
 * @throws {KitError} If the generator would write over human-written or hand-edited files
 *   without `force`, or the project settings cannot be parsed.
 */
export async function syncClaude(options: SyncOptions): Promise<SyncReport> {
  const project = await requireProject(options.projectDirectory);
  const plan = await planSync(project, options.installation, options.force === true);

  if (options.check !== true) await applySyncPlan(project.root, plan);

  return plan.report;
}

/**
 * What the generator will do in the project with this config, writing nothing: this way `init`
 * learns before its first write whether it would have to write over the human's files.
 * @param {PlannedProject} planned Root and config of the future project.
 * @param {ClaudeInstallation} installation Harness and templates of the running version.
 * @returns {Promise<SyncReport>} What will appear, what will be updated, and what conflicts.
 * @throws {GenerateError} If the config gives a Claude Code stage another provider.
 * @throws {KitError} If the project settings cannot be parsed.
 */
export async function previewClaude(
  planned: PlannedProject,
  installation: ClaudeInstallation,
): Promise<SyncReport> {
  const plan = await planSync(locatedFromPlanned(planned), installation, false);

  return plan.report;
}
