// Adapter hooks and deny rules in the project's `.claude/settings.json`. The settings belong to the
// project: the adapter replaces only its own handlers (see the kit's hook config) and adds its own
// deny rules, leaving the rest as is.

import {
  hookCommand,
  inspectHooks as inspectKitHooks,
  isObject,
  mergedHooks,
  NPX_CACHE_FIRST_FLAGS,
  SettingsError,
  SKIP_ON_FAILURE,
  STOP_GATE_TIMEOUT_SECONDS,
  STOP_STATUS_MESSAGE,
  stopFailureCommand,
  TURN_START_TIMEOUT_SECONDS,
  unparsedSettings as unparsedKitSettings,
  withoutOwnHooks,
  type AdapterHooks,
  type HookHandler,
  type HooksInspection,
  type KitError,
  type Settings,
} from "@cyberzavod/adapter-kit";
import type { HookName } from "../hooks/index.ts";

/** Path of the Claude Code settings relative to the project root. */
export const SETTINGS_FILE = ".claude/settings.json";

/**
 * Adapter error from a diagnostic of malformed settings: the format text, framed by the catalog.
 * @param {SettingsError} err Diagnostic of malformed `hooks` or `permissions`.
 * @returns {KitError} Error the CLI prints as one line.
 */
export function unparsedSettings(err: SettingsError): KitError {
  return unparsedKitSettings(err, SETTINGS_FILE);
}

/** Adapter deny rules: secrets are neither read nor edited, raw session logs are not edited. */
export const ADAPTER_DENY = [
  "Read(**/.env)",
  "Read(**/.env.*)",
  "Edit(**/.env)",
  "Edit(**/.env.*)",
  "Edit(**/capture/claude/raw/**)",
] as const;

// The npx cache-first flags (see `NPX_CACHE_FIRST_FLAGS`) take a package from the npm cache without
// contacting the registry. --prefix is $CLAUDE_PROJECT_DIR, not the current directory (the session
// may have run cd), so the package in the project's node_modules is found from any subdirectory.
// The quotes allow spaces in the path.
const HOOK_RUNNER = `npx ${NPX_CACHE_FIRST_FLAGS} --prefix "$CLAUDE_PROJECT_DIR"`;

// On Windows Claude Code runs hooks through Git Bash; PowerShell is not supported.
function commandOf(version: string, hook: HookName, onFailure: string): string {
  return hookCommand({ runner: HOOK_RUNNER, version, hook, onFailure });
}

/**
 * Adapter handlers for the Cyberzavod version from the project config: session capture on every
 * event, turn start, and checks on stop.
 * @param {string} version Cyberzavod version from the project config.
 * @returns {AdapterHooks} Handlers by event.
 */
export function adapterHooks(version: string): AdapterHooks {
  const record: HookHandler = {
    type: "command",
    command: commandOf(version, "record", SKIP_ON_FAILURE),
    async: true,
  };
  const turnStart: HookHandler = {
    type: "command",
    command: commandOf(version, "turn-start", SKIP_ON_FAILURE),
    timeout: TURN_START_TIMEOUT_SECONDS,
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
    PostToolUse: recordOnly,
    PostToolUseFailure: recordOnly,
    SubagentStart: recordOnly,
    SubagentStop: recordOnly,
    Stop: [{ hooks: [record, stopGate] }],
  };
}

function mergedPermissions(existing: unknown): Record<string, unknown> {
  if (existing !== undefined && !isObject(existing)) {
    throw new SettingsError("permissions must be an object");
  }

  const { deny = [] } = existing ?? {};

  if (!Array.isArray(deny) || !deny.every((rule) => typeof rule === "string")) {
    throw new SettingsError("permissions.deny must be a list of strings");
  }

  const missing = ADAPTER_DENY.filter((rule) => !deny.includes(rule));

  return { ...existing, deny: [...deny, ...missing] };
}

/**
 * Installs the adapter hooks and deny rules into the project settings: earlier adapter handlers are
 * replaced; other handlers, deny rules and other settings stay.
 * @param {Settings} settings Project settings; an empty object if there is no file.
 * @param {AdapterHooks} hooks Adapter handlers.
 * @returns {Settings} The new settings.
 * @throws {SettingsError} If `hooks` or `permissions` in the settings have the wrong shape.
 */
export function mergeSettings(settings: Settings, hooks: AdapterHooks): Settings {
  return {
    ...settings,
    permissions: mergedPermissions(settings.permissions),
    hooks: mergedHooks(settings.hooks, hooks),
  };
}

/**
 * Compares the hooks in the project settings with those the adapter installs for the config
 * version. Other handlers and other settings are not taken into account.
 * @param {Settings} settings Project settings; an empty object if there is no file.
 * @param {string} version Cyberzavod version from the project config.
 * @returns {HooksInspection} Hook state.
 * @throws {SettingsError} If `hooks` in the settings has the wrong shape.
 */
export function inspectHooks(settings: Settings, version: string): HooksInspection {
  return inspectKitHooks({ hooks: settings.hooks, expected: adapterHooks(version), version });
}

function denyOf(permissions: unknown): string[] {
  if (permissions !== undefined && !isObject(permissions)) {
    throw new SettingsError("permissions must be an object");
  }

  const { deny = [] } = permissions ?? {};

  if (!Array.isArray(deny) || !deny.every((rule) => typeof rule === "string")) {
    throw new SettingsError("permissions.deny must be a list of strings");
  }

  return deny;
}

/**
 * Adapter deny rules not yet in the project settings: sync will add them.
 * @param {Settings} settings Project settings; an empty object if there is no file.
 * @returns {string[]} Missing deny rules in `ADAPTER_DENY` order.
 * @throws {SettingsError} If `permissions` in the settings has the wrong shape.
 */
export function missingAdapterDeny(settings: Settings): string[] {
  const deny = denyOf(settings.permissions);

  return ADAPTER_DENY.filter((rule) => !deny.includes(rule));
}

function withoutRules(permissions: unknown, rules: readonly string[]): Record<string, unknown> {
  const deny = denyOf(permissions).filter((rule) => !rules.includes(rule));
  const others = Object.entries(isObject(permissions) ? permissions : {}).filter(
    ([key]) => key !== "deny",
  );
  const rest = Object.fromEntries(others);

  return deny.length === 0 ? rest : { ...rest, deny };
}

function isEmptyObject(value: unknown): boolean {
  return isObject(value) && Object.keys(value).length === 0;
}

/**
 * Removes from the project settings what the adapter installed: its own hook handlers and the
 * listed deny rules. Other handlers, deny rules and other settings stay; emptied `hooks` and
 * `permissions` are removed.
 * @param {Settings} settings Project settings.
 * @param {readonly string[]} deny Deny rules the adapter added.
 * @returns {Settings} Settings without the adapter; an empty object if nothing else remains.
 * @throws {SettingsError} If `hooks` or `permissions` in the settings have the wrong shape.
 */
export function withoutAdapterSettings(settings: Settings, deny: readonly string[]): Settings {
  const { hooks, permissions, ...rest } = settings;
  const remainingHooks = withoutOwnHooks(hooks);
  const remainingPermissions = withoutRules(permissions, deny);

  return {
    ...rest,
    ...(isEmptyObject(remainingPermissions) ? {} : { permissions: remainingPermissions }),
    ...(isEmptyObject(remainingHooks) ? {} : { hooks: remainingHooks }),
  };
}
