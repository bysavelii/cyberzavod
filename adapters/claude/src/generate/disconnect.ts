// Disconnecting the adapter: remove from the project what the generator wrote, and nothing else.
// Its own untouched file is deleted, its own hand-edited file stays; only its own hooks and the
// deny rules the generator added itself leave the settings.

import {
  applyDisconnect,
  fileAt,
  plannedDisconnectFiles,
  readOptional,
  requireProject,
  SettingsError,
  settingsOutcomeOf,
  type DisconnectOptions,
  type DisconnectPlan,
  type KitError,
  type Settings,
} from "@cyberzavod/adapter-kit";
import { SETTINGS_FILE, unparsedSettings, withoutAdapterSettings } from "./settings.ts";
import {
  CLAUDE_MANIFEST_OWNER,
  generatedCandidatesOf,
  readManifest,
  readSettings,
} from "./sync.ts";

const CLAUDE_DIRECTORY = ".claude";

function cleanedSettings(settings: Settings, deny: readonly string[]): Settings {
  try {
    return withoutAdapterSettings(settings, deny);
  } catch (err) {
    if (err instanceof SettingsError) throw unparsedSettings(err);

    throw err;
  }
}

/**
 * Removes the adapter's files and settings from the project or, with `check`, only says what it
 * will remove. Hand-edited files, other hooks and deny rules, `AGENTS.md` and the journal stay.
 * @param {DisconnectOptions} options Project and mode.
 * @returns {Promise<DisconnectPlan>} What was or will be deleted, and what will stay.
 * @throws {KitError} If there is no project.
 * @throws {KitError} If the settings or the manifest cannot be parsed: then nothing changes.
 */
export async function disconnectClaude(options: DisconnectOptions): Promise<DisconnectPlan> {
  const project = await requireProject(options.projectDirectory);
  const { root } = project;
  const manifest = await readManifest(root);
  const settingsSource = await readOptional(fileAt(root, SETTINGS_FILE));
  const settings = cleanedSettings(await readSettings(root), manifest.deny);
  const candidates = await generatedCandidatesOf(project, manifest);
  const files = await plannedDisconnectFiles({
    root,
    manifest,
    owner: CLAUDE_MANIFEST_OWNER,
    candidates,
  });
  const plan: DisconnectPlan = {
    ...files,
    settings: settingsOutcomeOf(settingsSource, settings),
  };

  if (options.check === true) return plan;

  await applyDisconnect({
    root,
    file: SETTINGS_FILE,
    plan,
    settings,
    owner: CLAUDE_MANIFEST_OWNER,
    boundaries: [CLAUDE_DIRECTORY],
  });

  return plan;
}
