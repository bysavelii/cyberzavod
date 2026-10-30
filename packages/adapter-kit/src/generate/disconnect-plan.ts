// Disconnecting an adapter, the part the agents share: its own untouched file is deleted, its own
// hand-edited file stays; only its own hooks leave the hooks file.

import { rm, writeFile } from "node:fs/promises";
import type { KitError } from "../errors.ts";
import { fileAt, filesOnDisk, readOptional, removeEmptyParents } from "./file-plan.ts";
import { withoutOwnHooks, type Settings, type SettingsError } from "./hook-config.ts";
import {
  MANIFEST_FILE,
  manifestTextWithout,
  type Manifest,
  type ManifestOwner,
} from "./manifest.ts";

/**
 * What happens to the agent's hooks file: there is none or the adapter is not in it
 * (`unchanged`), someone else's entries remain (`updated`), nothing remains (`removed`).
 */
export type SettingsOutcome = "unchanged" | "updated" | "removed";

/**
 * What happens to the manifest: there is none or the adapter has no section in it (`unchanged`),
 * other agents' sections remain (`updated`), nothing remains (`removed`).
 */
export type ManifestOutcome = "unchanged" | "updated" | "removed";

/** What the adapter removes from the project: paths from the root with `/`. */
export interface DisconnectPlan {
  /** Generated files not touched by hand: they are deleted. */
  removed: string[];
  /** Generated but hand-edited files: they stay. */
  edited: string[];
  settings: SettingsOutcome;
  /** The manifest is shared by the agents: the adapter removes only its own section. */
  manifest: ManifestOutcome;
}

/** What to disconnect and how: only view the plan or carry it out. */
export interface DisconnectOptions {
  /** Directory inside the project. */
  projectDirectory: string;
  /** Only draw up the plan without changing anything. */
  check?: boolean;
}

/**
 * Settings text to write to disk.
 * @param {Settings} settings Settings.
 * @returns {string} JSON with a trailing newline.
 */
export function settingsText(settings: Settings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/**
 * Settings without the adapter's hooks; an emptied `hooks` is dropped.
 * @param {Settings} settings Settings of the project's hooks file.
 * @returns {Settings} Settings without the adapter's hooks.
 * @throws {SettingsError} If `hooks` has the wrong shape.
 */
export function withoutAdapterHooks(settings: Settings): Settings {
  const { hooks, ...rest } = settings;
  const remaining = withoutOwnHooks(hooks);

  return Object.keys(remaining).length === 0 ? rest : { ...rest, hooks: remaining };
}

/**
 * Whether the settings are empty: then the file is deleted rather than rewritten.
 * @param {Settings} settings Settings.
 * @returns {boolean} true if nothing remains.
 */
export function isEmptySettings(settings: Settings): boolean {
  return Object.keys(settings).length === 0;
}

/**
 * What happens to the settings file.
 * @param {string | undefined} text File contents; undefined if there is no file.
 * @param {Settings} cleaned Settings without the adapter.
 * @returns {SettingsOutcome} `unchanged`, `updated` or `removed`.
 */
export function settingsOutcomeOf(text: string | undefined, cleaned: Settings): SettingsOutcome {
  if (text === undefined) return "unchanged";
  if (isEmptySettings(cleaned)) return "removed";

  const isSame = JSON.stringify(JSON.parse(text)) === JSON.stringify(cleaned);

  return isSame ? "unchanged" : "updated";
}

/**
 * What happens to the manifest when the agent leaves.
 * @param {string | undefined} previousText Manifest on disk; undefined if there is no file.
 * @param {ManifestOwner} owner The agent that leaves.
 * @returns {ManifestOutcome} `unchanged`, `updated` or `removed`.
 * @throws {KitError} If the manifest cannot be parsed.
 */
export function manifestOutcomeOf(
  previousText: string | undefined,
  owner: ManifestOwner,
): ManifestOutcome {
  if (previousText === undefined) return "unchanged";

  const remaining = manifestTextWithout(previousText, owner);

  if (remaining === undefined) return "removed";

  return remaining === previousText ? "unchanged" : "updated";
}

/** What the adapter's files plan to remove. */
export interface FilesDisconnectSource {
  root: string;
  manifest: Manifest;
  /** The agent that leaves: only its section is removed from the manifest. */
  owner: ManifestOwner;
  /** Paths where generated files may lie, from `generatedCandidates`. */
  candidates: readonly string[];
}

/**
 * Which generated files disconnecting deletes, which it leaves as edited by hand, and what
 * happens to the manifest.
 * @param {FilesDisconnectSource} source Root, the agent's manifest section and candidates.
 * @returns {Promise<Pick<DisconnectPlan, "removed" | "edited" | "manifest">>} Files to delete,
 *   hand-edited files and the manifest outcome.
 */
export async function plannedDisconnectFiles(
  source: FilesDisconnectSource,
): Promise<Pick<DisconnectPlan, "removed" | "edited" | "manifest">> {
  const { root, manifest, owner, candidates } = source;
  const owned = await filesOnDisk(root, candidates, manifest);
  const generated = owned.filter(({ ownership }) => ownership === "generated");
  const manifestSource = await readOptional(fileAt(root, MANIFEST_FILE));

  return {
    removed: generated.map((file) => file.path).sort(),
    edited: owned.filter(({ ownership }) => ownership === "edited").map((file) => file.path),
    manifest: manifestOutcomeOf(manifestSource, owner),
  };
}

/** What to write to the settings file when disconnecting. */
export interface SettingsDisconnect {
  root: string;
  /** Path of the hooks file from the root with `/`. */
  file: string;
  plan: DisconnectPlan;
  /** Settings without the adapter. */
  settings: Settings;
  /** The agent that leaves. */
  owner: ManifestOwner;
  /** Directories the cleanup of emptied parents stays inside. */
  boundaries: readonly string[];
}

/**
 * Carries out a disconnect plan: rewrites or deletes the settings file, deletes the generated
 * files and the directories emptied by it, removes the agent's section from the manifest.
 * @param {SettingsDisconnect} source Plan, settings without the adapter, the agent and the
 *   boundaries.
 * @returns {Promise<void>} Done when everything is carried out.
 */
export async function applyDisconnect(source: SettingsDisconnect): Promise<void> {
  const { root, file, plan, settings, owner, boundaries } = source;
  const settingsPath = fileAt(root, file);

  switch (plan.settings) {
    case "unchanged":
      break;
    case "updated":
      await writeFile(settingsPath, settingsText(settings));
      break;
    case "removed":
      await rm(settingsPath);
      await removeEmptyParents(root, settingsPath, boundaries);
      break;
    default:
      return plan.settings satisfies never;
  }

  for (const removed of plan.removed) {
    const target = fileAt(root, removed);

    await rm(target);
    await removeEmptyParents(root, target, boundaries);
  }

  await applyManifestOutcome(root, plan.manifest, owner);
}

async function applyManifestOutcome(
  root: string,
  outcome: ManifestOutcome,
  owner: ManifestOwner,
): Promise<void> {
  const manifestPath = fileAt(root, MANIFEST_FILE);

  switch (outcome) {
    case "unchanged":
      break;

    case "updated": {
      const remaining = manifestTextWithout(await readOptional(manifestPath), owner);

      if (remaining !== undefined) await writeFile(manifestPath, remaining);

      break;
    }

    case "removed":
      await rm(manifestPath);
      break;
    default:
      return outcome satisfies never;
  }
}
