// Adapter hooks in the agent's hooks file. The file belongs to the project: the adapter replaces
// only its own handlers (their command runs, via npx, the package version recorded in the config)
// and leaves the rest as is. The format of a handler and a group is the same for the agents.

import { LEGACY_TOOL_FILE } from "@cyberzavod/storage";
import { PACKAGE_NAME } from "../cli-command.ts";
import { KitError } from "../errors.ts";
import { isObject } from "../object.ts";

/** Agent hook handler. */
export interface HookHandler {
  type: "command";
  command: string;
  async?: boolean;
  timeout?: number;
  statusMessage?: string;
}

/** Group of handlers for one hook event. */
export interface HookGroup {
  matcher?: string;
  hooks: HookHandler[];
}

/** Adapter handlers by hook event. */
export type AdapterHooks = Readonly<Record<string, HookGroup[]>>;

/** Hooks file contents: parsed JSON; the adapter reads only its own parts of it. */
export type Settings = Record<string, unknown>;

/** Settings error: the project file has the wrong shape to install hooks into. */
export class SettingsError extends Error {}

/**
 * Adapter error from a diagnostic of malformed settings: the format text, framed by the catalog.
 * @param {SettingsError} err Diagnostic of malformed `hooks` or `permissions`.
 * @param {string} file Path of the file with the diagnosed settings.
 * @returns {KitError} Error the CLI prints as one line.
 */
export function unparsedSettings(err: SettingsError, file: string): KitError {
  const reason = err.message;

  return new KitError((messages) => messages.errors.settingsNotParsed({ file, reason }), {
    cause: err,
  });
}

function parseJson(text: string, file: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    const reason = (err as Error).message;

    throw new KitError((messages) => messages.errors.settingsNotParsed({ file, reason }), {
      cause: err,
    });
  }
}

/**
 * Parses the text of an agent's settings file.
 * @param {string | undefined} text File contents; undefined if there is no file.
 * @param {string} file File path for the error message.
 * @returns {Settings} The settings; an empty object if there is no file.
 * @throws {KitError} If the text is not JSON or not an object.
 */
export function parseSettings(text: string | undefined, file: string): Settings {
  if (text === undefined) return {};

  const parsed = parseJson(text, file);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new KitError((messages) => messages.errors.settingsNotObject(file));
  }

  return parsed as Settings;
}

/** Seconds a `turn-start` hook may run. */
export const TURN_START_TIMEOUT_SECONDS = 30;

/** Seconds a `stop` hook may run: it runs the project checks. */
export const STOP_GATE_TIMEOUT_SECONDS = 180;

/** Status line the agent shows while the project checks run on stop. */
export const STOP_STATUS_MESSAGE = "Running project checks…";

/** Fallback for hooks that may be skipped: without network, capture and turn start are silent. */
export const SKIP_ON_FAILURE = "true";

// The fallback also fires when the stop hook failed internally, so the text does not promise a
// cause. No apostrophes: the command sits in single quotes.
const STOP_FAILURE_MESSAGE =
  "Cyberzavod: the stop hook failed or could not start (for example, npx without network). Project checks were skipped.";

/**
 * Fallback command of the stop hook: lets the agent go and tells the human that the checks were
 * skipped.
 * @returns {string} Shell command that prints the JSON `systemMessage`.
 */
export function stopFailureCommand(): string {
  return `echo '${JSON.stringify({ systemMessage: STOP_FAILURE_MESSAGE })}'`;
}

// The npx flags between `npx` and the package may change in later versions: hooks of earlier
// versions are recognized by the package and hook name, not by the full command prefix. This is the
// one place that knows the shape `npx … cyberzavod@<version> hook <name> …` that `hookCommand`
// writes, bare or wrapped by `inPosixShell`.
const POSIX_SHELL_PREFIX = "sh -c '";
const NPX_HANDLER_PATTERN = new RegExp(
  `^(?:${POSIX_SHELL_PREFIX})?npx\\s.*\\s${PACKAGE_NAME}@(\\S+) hook ([\\w-]*)`,
);

/** What an own handler's command says: the package version it runs and the hook it calls. */
interface OwnCommand {
  /** The version of the package; the former in-project CLI is named as `LEGACY_TOOL_FILE`. */
  version: string;
  /** Hook name for `cyberzavod hook`; undefined for the former in-project CLI. */
  hook: string | undefined;
}

// The former in-project CLI has no version and no `hook <name>` shape, and is recognized by file
// name. Someone else's handler gives undefined.
function ownCommandOf(handler: HookHandler): OwnCommand | undefined {
  const [, version, hook] = NPX_HANDLER_PATTERN.exec(handler.command) ?? [];

  if (version !== undefined) return { version, hook };

  return handler.command.includes(LEGACY_TOOL_FILE)
    ? { version: LEGACY_TOOL_FILE, hook: undefined }
    : undefined;
}

/**
 * Whether the handler is one of the adapter's: it runs the Cyberzavod package via npx, with any
 * version, or is the former in-project CLI.
 * @param {HookHandler} handler Handler from the project's hooks file.
 * @returns {boolean} true for an adapter handler.
 */
export function isOwnHandler(handler: HookHandler): boolean {
  return ownCommandOf(handler) !== undefined;
}

/**
 * The hook an adapter handler calls: `record`, `stop` and so on.
 * @param {HookHandler} handler Handler from the project's hooks file.
 * @returns {string | undefined} Hook name; undefined for someone else's handler and for the former
 *   in-project CLI, which has no such name.
 */
export function hookNameOf(handler: HookHandler): string | undefined {
  const name = ownCommandOf(handler)?.hook;

  return name === "" ? undefined : name;
}

/** What a hook command needs: how npx is run, which version, which hook, what if it fails. */
export interface HookCommandSource {
  /** `npx` with its flags, up to the package. */
  runner: string;
  /** Cyberzavod version from the project config. */
  version: string;
  /** Hook name for `cyberzavod hook`. */
  hook: string;
  /** Flag that names the agent for `cyberzavod hook`; undefined if the default agent runs. */
  agentFlag?: string;
  /** Shell command that runs when the hook command fails. */
  onFailure: string;
}

/**
 * Command of an adapter hook. `|| …` fires on any non-zero code, so the fallback is only for "npx
 * did not start": the stop hook blocks with a JSON decision and code 0, not code 2. POSIX syntax.
 * @param {HookCommandSource} source Runner, version, hook, agent flag and fallback.
 * @returns {string} Shell command for the hooks file.
 */
export function hookCommand(source: HookCommandSource): string {
  const { runner, version, hook, agentFlag, onFailure } = source;
  const flag = agentFlag === undefined ? "" : ` ${agentFlag}`;

  return `${runner} ${PACKAGE_NAME}@${version} hook ${hook}${flag} || ${onFailure}`;
}

/**
 * Wraps a command so that it runs as POSIX shell whatever the login shell is: an agent that runs
 * a hook as `$SHELL -lc <command>` would hand `$(…)` and `||` to fish before 3.4 or to tcsh, which
 * do not understand them. The command goes into single quotes; a quote inside it is closed,
 * escaped and opened again, which fish, tcsh and POSIX shells read alike.
 * @param {string} command POSIX shell command.
 * @returns {string} A command that starts `sh` with it.
 */
export function inPosixShell(command: string): string {
  return `${POSIX_SHELL_PREFIX}${command.replaceAll("'", "'\\''")}'`;
}

function isHookGroup(value: unknown): value is HookGroup {
  return (
    isObject(value) &&
    Array.isArray(value.hooks) &&
    value.hooks.every((handler) => isObject(handler) && typeof handler.command === "string")
  );
}

/**
 * The groups of one event, checked: a list of groups, each with a list of command handlers.
 * @param {string} event Event name, for the error text.
 * @param {unknown} value The event's value in the hooks file.
 * @returns {HookGroup[]} The groups.
 * @throws {SettingsError} If the value has the wrong shape.
 */
export function groupsOf(event: string, value: unknown): HookGroup[] {
  if (!Array.isArray(value) || !value.every(isHookGroup)) {
    throw new SettingsError(`hooks.${event} must be a list of groups with handlers`);
  }

  return value;
}

function withoutOwnHandlers(groups: HookGroup[]): HookGroup[] {
  return groups
    .map((group) => ({ ...group, hooks: group.hooks.filter((handler) => !isOwnHandler(handler)) }))
    .filter((group) => group.hooks.length > 0);
}

/**
 * Hooks of the project plus the adapter's: earlier adapter handlers are replaced; other handlers
 * stay.
 * @param {unknown} existing The `hooks` value of the project's hooks file.
 * @param {AdapterHooks} own Adapter handlers.
 * @returns {Record<string, HookGroup[]>} The new `hooks` value.
 * @throws {SettingsError} If `existing` has the wrong shape.
 */
export function mergedHooks(existing: unknown, own: AdapterHooks): Record<string, HookGroup[]> {
  if (existing !== undefined && !isObject(existing)) {
    throw new SettingsError("hooks must be an object");
  }

  const merged: Record<string, HookGroup[]> = {};

  for (const [event, groups] of Object.entries(existing ?? {})) {
    merged[event] = withoutOwnHandlers(groupsOf(event, groups));
  }

  for (const [event, groups] of Object.entries(own)) {
    merged[event] = [...(merged[event] ?? []), ...groups];
  }

  const nonEmpty = Object.entries(merged).filter(([, groups]) => groups.length > 0);

  return Object.fromEntries(nonEmpty);
}

/**
 * Hooks of the project without the adapter's: other handlers stay.
 * @param {unknown} hooks The `hooks` value of the project's hooks file.
 * @returns {Record<string, HookGroup[]>} Hooks without the adapter's; emptied events are dropped.
 * @throws {SettingsError} If `hooks` has the wrong shape.
 */
export function withoutOwnHooks(hooks: unknown): Record<string, HookGroup[]> {
  if (hooks !== undefined && !isObject(hooks)) {
    throw new SettingsError("hooks must be an object");
  }

  const entries = Object.entries(hooks ?? {}).map(
    ([event, groups]) => [event, withoutOwnHandlers(groupsOf(event, groups))] as const,
  );
  const nonEmpty = entries.filter(([, groups]) => groups.length > 0);

  return Object.fromEntries(nonEmpty);
}

/**
 * Adapter hooks in the project's hooks file: all in place (`installed`), none of its own
 * (`missing`), its own refer to other versions (`otherVersion`; the former in-project CLI is named
 * as `LEGACY_TOOL_FILE`), or the `events` lack some handler of this version (`incomplete`).
 */
export type HooksInspection =
  | { kind: "installed" }
  | { kind: "missing" }
  | { kind: "otherVersion"; found: string[] }
  | { kind: "incomplete"; events: string[] };

interface OwnHandler {
  event: string;
  command: string;
  version: string;
}

function ownHandlersOf(hooks: Record<string, unknown>): OwnHandler[] {
  return Object.entries(hooks).flatMap(([event, value]) => {
    const handlers = groupsOf(event, value).flatMap((group) => group.hooks);

    return handlers.flatMap((handler) => {
      const own = ownCommandOf(handler);

      return own === undefined ? [] : [{ event, command: handler.command, version: own.version }];
    });
  });
}

function isEventComplete(event: string, groups: HookGroup[], own: OwnHandler[]): boolean {
  const present = own.filter((handler) => handler.event === event).map(({ command }) => command);
  const expected = groups.flatMap((group) => group.hooks.map(({ command }) => command));

  return expected.every((command) => present.includes(command));
}

/** The hooks the adapter expects for a version, and the project's `hooks` value to compare. */
export interface HooksComparison {
  /** The `hooks` value of the project's hooks file; undefined if the file has none. */
  hooks: unknown;
  /** Handlers the adapter installs for the config version. */
  expected: AdapterHooks;
  /** Cyberzavod version from the project config. */
  version: string;
}

/**
 * Compares the hooks in the project's hooks file with those the adapter installs for the config
 * version. Other handlers and other settings are not taken into account.
 * @param {HooksComparison} comparison The project's hooks, the expected ones and the version.
 * @returns {HooksInspection} Hook state.
 * @throws {SettingsError} If `hooks` has the wrong shape.
 */
export function inspectHooks(comparison: HooksComparison): HooksInspection {
  const { hooks, expected, version } = comparison;

  if (hooks !== undefined && !isObject(hooks)) throw new SettingsError("hooks must be an object");

  const own = ownHandlersOf(hooks ?? {});

  if (own.length === 0) return { kind: "missing" };

  const otherVersions = own.map((handler) => handler.version).filter((found) => found !== version);

  if (otherVersions.length > 0) return { kind: "otherVersion", found: [...new Set(otherVersions)] };

  const events = Object.entries(expected)
    .filter(([event, groups]) => !isEventComplete(event, groups, own))
    .map(([event]) => event);

  return events.length === 0 ? { kind: "installed" } : { kind: "incomplete", events };
}
