// Syncs the project's Codex files with the harness and config: what is generated anew is
// overwritten; what was generated earlier and is no longer needed is deleted; what the human wrote
// is not touched without explicit permission. The shared part lives in the adapter kit.

import {
  applySyncPlan,
  captureDirectories,
  contentHash,
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
  SettingsError,
  settingsText,
  type CandidateSource,
  type GeneratedFile,
  type KitError,
  type LocatedProject,
  type Manifest,
  type ManifestOwner,
  type PlannedProject,
  type Settings,
  type SyncPlan,
  type SyncReport,
} from "@cyberzavod/adapter-kit";
import type { Harness } from "@cyberzavod/core";
import { workflowOf } from "@cyberzavod/storage";
import { CODEX_AGENT, type CodexGenerateError } from "./codex.ts";
import { CONFIG_FILE, codexFiles, type CodexProject, type CodexTemplates } from "./files.ts";
import { codexHooks, HOOKS_FILE, mergeHooksFile, unparsedHooks } from "./hooks-config.ts";

/** Directories of the project that hold only Codex files; cleanup of emptied parents stays in them. */
export const CODEX_DIRECTORIES: readonly string[] = [".codex", ".agents"];

/** The Codex section of the shared manifest: its files are in `.codex/` and `.agents/`. */
export const CODEX_MANIFEST_OWNER: ManifestOwner = {
  agent: CODEX_AGENT,
  ownsFile: (file) => CODEX_DIRECTORIES.some((directory) => file.startsWith(`${directory}/`)),
};

const GENERATED_DIRECTORIES: readonly CandidateSource[] = [
  { directory: ".codex/agents", extensions: [".toml"] },
  { directory: ".agents/skills", extensions: [".md", ".yaml"] },
];

// The hooks file and the manifest are shared: the generator edits only its part of the hooks file;
// the manifest is its own.
const SHARED_FILES: ReadonlySet<string> = new Set([HOOKS_FILE, MANIFEST_FILE]);

/** What to generate from: the harness and templates of the running Cyberzavod version. */
export interface CodexInstallation {
  harness: Harness;
  templates: CodexTemplates;
}

/** What to do: only compare or write, and whether what the human wrote may be overwritten. */
export interface SyncOptions {
  /** Directory inside the project. */
  projectDirectory: string;
  installation: CodexInstallation;
  /** Only compare the files on disk with the generated ones, writing nothing. */
  check?: boolean;
  /** Overwrite files written by the human rather than the generator. */
  force?: boolean;
}

function codexProjectOf(project: LocatedProject, installation: CodexInstallation): CodexProject {
  const { harness, templates } = installation;
  const capture = captureDirectories(project.journal, CODEX_AGENT);

  return {
    config: project.config,
    harness,
    workflow: workflowOf(harness, project.config.workflow),
    capture: {
      raw: relativeTo(project.root, capture.raw),
      drafts: relativeTo(project.root, capture.drafts),
    },
    cli: pinnedCliCommand(project.config.harness),
    templates,
  };
}

/**
 * Reads the project's Codex hooks file.
 * @param {string} root Project root.
 * @returns {Promise<Settings>} The contents; an empty object if there is no file.
 * @throws {KitError} If the file is not JSON or not an object.
 */
export async function readHooksFile(root: string): Promise<Settings> {
  return parseSettings(await readOptional(fileAt(root, HOOKS_FILE)), HOOKS_FILE);
}

/**
 * Reads the Codex section of the manifest of generated output.
 * @param {string} root Project root.
 * @returns {Promise<Manifest>} The section; empty if there is no file or no section.
 * @throws {KitError} If the manifest cannot be parsed.
 */
export async function readManifest(root: string): Promise<Manifest> {
  return parseManifest(await readOptional(fileAt(root, MANIFEST_FILE)), CODEX_MANIFEST_OWNER);
}

/**
 * The hooks file as it will be after sync: the project's own handlers and the adapter's.
 * @param {Settings} current Contents of the hooks file now.
 * @param {string} version Cyberzavod version from the project config.
 * @returns {string} Text of the file to write.
 * @throws {KitError} If `hooks` has the wrong shape.
 */
export function hooksFileText(current: Settings, version: string): string {
  try {
    return settingsText(mergeHooksFile(current, codexHooks(version)));
  } catch (err) {
    if (err instanceof SettingsError) throw unparsedHooks(err);

    throw err;
  }
}

/**
 * Files the generator wrote earlier: with the generated mark or from the manifest.
 * @param {string} root Project root.
 * @param {Manifest} manifest Manifest of generated output.
 * @returns {Promise<string[]>} Paths from the root with `/`; the file at a path may be gone.
 */
export async function generatedCandidatesOf(root: string, manifest: Manifest): Promise<string[]> {
  return generatedCandidates(root, manifest, GENERATED_DIRECTORIES, [CONFIG_FILE]);
}

function manifestOf(files: GeneratedFile[]): Manifest {
  const owned = files.filter((file) => file.path !== HOOKS_FILE);
  const hashes = owned.map((file) => [file.path, contentHash(file.content)] as const);

  return { files: Object.fromEntries(hashes), deny: [] };
}

async function planSync(
  project: LocatedProject,
  installation: CodexInstallation,
  force: boolean,
): Promise<SyncPlan> {
  const manifest = await readManifest(project.root);
  const hooksFile = {
    path: HOOKS_FILE,
    content: hooksFileText(await readHooksFile(project.root), project.config.harness),
  };
  const generated = [...codexFiles(codexProjectOf(project, installation)), hooksFile];
  const manifestSource = await readOptional(fileAt(project.root, MANIFEST_FILE));
  const manifestFile = {
    path: MANIFEST_FILE,
    content: manifestTextWith(manifestSource, CODEX_MANIFEST_OWNER, manifestOf(generated)),
  };
  const files = [...generated, manifestFile];

  return planSyncFiles({
    root: project.root,
    files,
    manifest,
    force,
    sharedFiles: SHARED_FILES,
    candidates: await generatedCandidatesOf(project.root, manifest),
  });
}

/**
 * Brings the project's Codex files in line with the harness and config: the working rules, role
 * agents, skills, hooks, and the manifest of generated output.
 * @param {SyncOptions} options Project and mode.
 * @returns {Promise<SyncReport>} What was written and deleted or, in a check, what is outdated.
 * @throws {CodexGenerateError} If the config assigns a stage to another agent.
 * @throws {KitError} If the generator would write over human-written or hand-edited files
 *   without `force`, or the hooks file cannot be parsed.
 */
export async function syncCodex(options: SyncOptions): Promise<SyncReport> {
  const project = await requireProject(options.projectDirectory);
  const plan = await planSync(project, options.installation, options.force === true);

  if (options.check !== true) await applySyncPlan(project.root, plan);

  return plan.report;
}

/**
 * What the generator will do in the project with this config, writing nothing: this way `init`
 * learns before its first write whether it would have to write over the human's files.
 * @param {PlannedProject} planned Root and config of the future project.
 * @param {CodexInstallation} installation Harness and templates of the running version.
 * @returns {Promise<SyncReport>} What will appear, what will be updated, and what conflicts.
 * @throws {CodexGenerateError} If the config assigns a stage to another agent.
 * @throws {KitError} If the hooks file cannot be parsed.
 */
export async function previewCodex(
  planned: PlannedProject,
  installation: CodexInstallation,
): Promise<SyncReport> {
  const plan = await planSync(locatedFromPlanned(planned), installation, false);

  return plan.report;
}
