// Disconnecting the adapter: remove from the project what the generator wrote, and nothing else.
// Its own untouched file is deleted, its own hand-edited file stays; only its own handlers leave
// the hooks file.

import {
  applyDisconnect,
  fileAt,
  plannedDisconnectFiles,
  readOptional,
  requireProject,
  SettingsError,
  settingsOutcomeOf,
  withoutAdapterHooks,
  type DisconnectOptions,
  type DisconnectPlan,
  type KitError,
  type Settings,
} from "@cyberzavod/adapter-kit";
import { HOOKS_FILE, unparsedHooks } from "./hooks-config.ts";
import {
  CODEX_DIRECTORIES,
  CODEX_MANIFEST_OWNER,
  generatedCandidatesOf,
  readHooksFile,
  readManifest,
} from "./sync.ts";

function cleanedHooks(settings: Settings): Settings {
  try {
    return withoutAdapterHooks(settings);
  } catch (err) {
    if (err instanceof SettingsError) throw unparsedHooks(err);

    throw err;
  }
}

/**
 * Removes the adapter's files and handlers from the project or, with `check`, only says what it
 * will remove. Hand-edited files, other hooks, `AGENTS.md` and the journal stay.
 * @param {DisconnectOptions} options Project and mode.
 * @returns {Promise<DisconnectPlan>} What was or will be deleted, and what will stay.
 * @throws {KitError} If there is no project.
 * @throws {KitError} If the hooks file or the manifest cannot be parsed: then nothing changes.
 */
export async function disconnectCodex(options: DisconnectOptions): Promise<DisconnectPlan> {
  const project = await requireProject(options.projectDirectory);
  const { root } = project;
  const manifest = await readManifest(root);
  const hooksSource = await readOptional(fileAt(root, HOOKS_FILE));
  const hooks = cleanedHooks(await readHooksFile(root));
  const candidates = await generatedCandidatesOf(root, manifest);
  const files = await plannedDisconnectFiles({
    root,
    manifest,
    owner: CODEX_MANIFEST_OWNER,
    candidates,
  });
  const plan: DisconnectPlan = { ...files, settings: settingsOutcomeOf(hooksSource, hooks) };

  if (options.check === true) return plan;

  await applyDisconnect({
    root,
    file: HOOKS_FILE,
    plan,
    settings: hooks,
    owner: CODEX_MANIFEST_OWNER,
    boundaries: CODEX_DIRECTORIES,
  });

  return plan;
}
