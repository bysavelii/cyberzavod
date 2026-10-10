// Adapter hooks in the project's `.codex/hooks.json`. The file belongs to the project: the adapter
// replaces only its own handlers (see the kit's hook config) and leaves the rest as is.

import {
  hookCommand,
  inPosixShell,
  inspectHooks as inspectKitHooks,
  mergedHooks,
  SKIP_ON_FAILURE,
  STOP_GATE_TIMEOUT_SECONDS,
  STOP_STATUS_MESSAGE,
  stopFailureCommand,
  TURN_START_TIMEOUT_SECONDS,
  unparsedSettings as unparsedKitSettings,
  type AdapterHooks,
  type HookHandler,
  type HooksInspection,
  type KitError,
  type SettingsError,
  type Settings,
} from "@cyberzavod/adapter-kit";
import { PATCH_TOOL, SHELL_TOOL } from "./codex.ts";

/** Path of the Codex hooks file relative to the project root. */
export const HOOKS_FILE = ".codex/hooks.json";

/** Name of this agent in `cyberzavod hook … --agent`. */
export const HOOK_AGENT_FLAG = "--agent codex";

/** Tools the `.env` guard looks at: the shell and file edits. */
export const GUARDED_TOOLS = `${SHELL_TOOL}|${PATCH_TOOL}`;

const GUARD_TIMEOUT_SECONDS = 30;

// Codex starts a hook in the session directory, which may be a subdirectory of the project, and
// gives it no variable with the project directory (Claude has $CLAUDE_PROJECT_DIR). The project root
// is where Codex itself looks for `.codex/` first: the nearest `.git` upward, which is what
// `git rev-parse --show-toplevel` answers. Outside a repository Codex uses the session directory,
// and so does the fallback `pwd`. --prefer-offline and --fetch-retries=0: a package in the npm cache
// is taken without contacting the registry, and without network or cache npx fails at once rather
// than after minutes. The root is the git root, so a project that lives in a subdirectory of a
// larger repository does not find its local package there and takes it from the npm cache.
//
// Codex runs a hook as `$SHELL -lc <command>`, and fish before 3.4 and tcsh do not read `$(…)` or
// `||`: the command goes through `sh -c` (see `inPosixShell`) and works in any login shell.
const PROJECT_ROOT_COMMAND = "$(git rev-parse --show-toplevel 2>/dev/null || pwd)";
const HOOK_RUNNER = `npx -y --prefer-offline --fetch-retries=0 --prefix "${PROJECT_ROOT_COMMAND}"`;

/**
 * Adapter error from a diagnostic of malformed hooks: the format text, framed by the catalog.
 * @param {SettingsError} err Diagnostic of a malformed `hooks`.
 * @returns {KitError} Error the CLI prints as one line.
 */
export function unparsedHooks(err: SettingsError): KitError {
  return unparsedKitSettings(err, HOOKS_FILE);
}

function commandOf(version: string, hook: string, onFailure: string): string {
  return inPosixShell(
    hookCommand({
      runner: HOOK_RUNNER,
      version,
      hook,
      agentFlag: HOOK_AGENT_FLAG,
      onFailure,
    }),
  );
}

/**
 * Adapter handlers for the Cyberzavod version from the project config: session capture on every
 * event, turn start, the `.env` guard, and checks on stop. Codex has no failed-tool event.
 * @param {string} version Cyberzavod version from the project config.
 * @returns {AdapterHooks} Handlers by event.
 */
export function codexHooks(version: string): AdapterHooks {
  const record: HookHandler = {
    type: "command",
    command: commandOf(version, "record", SKIP_ON_FAILURE),
    async: true,
  };
  // Asynchronous hooks are aborted when `codex exec` exits, so the last record is synchronous.
  const stopRecord: HookHandler = { type: "command", command: record.command };
  const turnStart: HookHandler = {
    type: "command",
    command: commandOf(version, "turn-start", SKIP_ON_FAILURE),
    timeout: TURN_START_TIMEOUT_SECONDS,
  };
  const guard: HookHandler = {
    type: "command",
    command: commandOf(version, "guard", SKIP_ON_FAILURE),
    timeout: GUARD_TIMEOUT_SECONDS,
  };
  const stopGate: HookHandler = {
    type: "command",
    command: commandOf(version, "stop", stopFailureCommand()),
    timeout: STOP_GATE_TIMEOUT_SECONDS,
    statusMessage: STOP_STATUS_MESSAGE,
  };
  const recordOnly = [{ hooks: [record] }];

  return {
    SessionStart: recordOnly,
    UserPromptSubmit: [{ hooks: [record, turnStart] }],
    PreToolUse: [{ matcher: GUARDED_TOOLS, hooks: [guard] }],
    PostToolUse: recordOnly,
    SubagentStart: recordOnly,
    SubagentStop: recordOnly,
    Stop: [{ hooks: [stopRecord, stopGate] }],
  };
}

/**
 * Installs the adapter hooks into the project's hooks file: earlier adapter handlers are replaced;
 * other handlers and other keys stay.
 * @param {Settings} settings Contents of the hooks file; an empty object if there is no file.
 * @param {AdapterHooks} hooks Adapter handlers.
 * @returns {Settings} The new contents.
 * @throws {SettingsError} If `hooks` has the wrong shape.
 */
export function mergeHooksFile(settings: Settings, hooks: AdapterHooks): Settings {
  return { ...settings, hooks: mergedHooks(settings.hooks, hooks) };
}

/**
 * Compares the hooks in the project's hooks file with those the adapter installs for the config
 * version. Other handlers and other keys are not taken into account.
 * @param {Settings} settings Contents of the hooks file; an empty object if there is no file.
 * @param {string} version Cyberzavod version from the project config.
 * @returns {HooksInspection} Hook state.
 * @throws {SettingsError} If `hooks` has the wrong shape.
 */
export function inspectHooksFile(settings: Settings, version: string): HooksInspection {
  return inspectKitHooks({ hooks: settings.hooks, expected: codexHooks(version), version });
}
