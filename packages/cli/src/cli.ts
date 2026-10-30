// Command line parsing: the command name picks a handler from the table, the handler gets the
// arguments and the directory the CLI was run from, and returns the exit code.

import { homedir, tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { RecordError, type InterfaceLanguage, type LocalizedText } from "@cyberzavod/core";
import { JournalError, ProjectFileError } from "@cyberzavod/storage";
import { DEFAULT_AGENT_NAME, type AgentAdapter } from "./agents/agent-adapter.ts";
import { adapterNamed, adaptersAt, agentNamed, type NonEmpty } from "./agents/host-agent.ts";
import { createAdapters, type Adapters } from "./agents/registry.ts";
import { projectChecksWith, runDoctor, type DoctorOptions } from "./commands/doctor.ts";
import { galleryAccessOf, showGallery } from "./commands/gallery.ts";
import { initProject } from "./commands/init.ts";
import { recordDecision, recordNote } from "./commands/journal.ts";
import { login, logout } from "./commands/login.ts";
import { requireProjectAt } from "./commands/project.ts";
import { shareRecording, unshareRecording } from "./commands/share.ts";
import { printStatus } from "./commands/status.ts";
import { previewProject, syncProject } from "./commands/sync.ts";
import { startView } from "./commands/view.ts";
import { disconnectProject } from "./commands/disconnect.ts";
import type { ProjectCheck } from "./doctor/check.ts";
import { commandsFoundCheck } from "./doctor/commands-found.ts";
import { commandsPassCheck } from "./doctor/commands-pass.ts";
import { isProgramAvailable } from "./doctor/programs.ts";
import { runCommandInShell } from "./doctor/run-command.ts";
import { closestName } from "./closest-name.ts";
import { confirmWithoutAsking, terminalConfirmation, type Confirmation } from "./confirmation.ts";
import { CommandError } from "./errors.ts";
import { commandHelp, generalHelp, listedCommandNames, type CommandPlacement } from "./help.ts";
import type { InitOverrides } from "./initial-config.ts";
import {
  HARNESS_VERSION,
  readInstallation,
  type Installation,
} from "./installation/installation.ts";
import { CLI_MESSAGES } from "./messages/catalog.ts";
import { COMMAND_NAMES, type CliMessages, type CommandName } from "./messages/cli-messages.ts";
import { extractLanguageFlag, languageOf, type Environment } from "./messages/language.ts";
import { ApiError } from "./sharing/api.ts";
import { createSharing, type Sharing } from "./sharing/services.ts";
import { credentialsFile, FileCredentialsStore } from "./sharing/settings.ts";
import { openInBrowser } from "./viewer/browser.ts";
import { locateViewer } from "./viewer/locate-viewer.ts";
import { viewerInvocationOf } from "./viewer/viewer-package.ts";

const SUCCESS = 0;
const FAILURE = 1;
const GENERAL_HELP_REQUESTS: readonly string[] = ["help", "--help", "-h"];
const COMMAND_HELP_FLAGS: readonly string[] = ["--help", "-h"];
const VERSION_REQUESTS: readonly string[] = ["--version", "-v"];
const OPTIONS_END = "--";
const DEBUG_VARIABLE = "CYBERZAVOD_DEBUG";
const STOP_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

/**
 * How a command was run: its arguments, the directory it was called from, the environment and
 * texts in the chosen language.
 */
interface Invocation {
  args: string[];
  directory: string;
  env: Environment;
  messages: CliMessages;
  language: InterfaceLanguage;
  adapters: Adapters;
}

// A command's help lives in the message catalog: a command without help does not compile. The
// section is the command's place in the general help; service commands (`service`) are not listed.
interface Command {
  section: CommandPlacement;
  run(invocation: Invocation): Promise<number>;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);

  return Buffer.concat(chunks).toString("utf8");
}

function requiredText(value: string | undefined, missing: LocalizedText<CliMessages>): string {
  if (value === undefined || value.trim() === "") throw new CommandError(missing);

  return value;
}

// `view` runs until the human stops it.
function untilStopped(): Promise<void> {
  return new Promise((resolve) => {
    for (const signal of STOP_SIGNALS) process.once(signal, () => resolve());
  });
}

function defaultSharing(env: Environment): Sharing {
  return createSharing({ env, platform: process.platform, homeDirectory: homedir() });
}

/** What `doctor` is run with: the project's adapters and the chosen commands check. */
interface DoctorPlan {
  adapters: NonEmpty<AgentAdapter>;
  commandsCheck: ProjectCheck;
}

// The machine and program lookup use the calling environment: PATH comes from it, not process.env.
function doctorOptionsOf(
  invocation: Pick<Invocation, "directory" | "env" | "messages" | "language">,
  installation: Installation,
  doctorPlan: DoctorPlan,
): Omit<DoctorOptions, "isJson"> {
  const { directory, env, messages, language } = invocation;
  const { adapters, commandsCheck } = doctorPlan;
  const platform = process.platform;
  const credentials = new FileCredentialsStore(
    credentialsFile({ env, platform, homeDirectory: homedir() }),
  );

  return {
    machine: {
      nodeVersion: process.versions.node,
      credentials,
      isProgramAvailable: (name) => isProgramAvailable({ name, root: directory, env, platform }),
    },
    projectChecks: projectChecksWith(commandsCheck, adapters),
    projectTools: {
      isProgramAvailable: (name, root) => isProgramAvailable({ name, root, env, platform }),
      runCommand: runCommandInShell,
    },
    installation,
    messages,
    adapters,
    language,
  };
}

// Without a terminal disconnect does not delete without an explicit `--yes`: irreversible only with
// consent.
function refuseWithoutTerminal(isConfirmed: boolean, messages: CliMessages): Confirmation {
  if (isConfirmed) return confirmWithoutAsking;

  return () => {
    console.log(messages.disconnect.needsConfirmation);

    return Promise.resolve(false);
  };
}

interface InitFlags {
  id?: string | undefined;
  check?: string[] | undefined;
  journal?: string | undefined;
}

function initOverridesOf(flags: InitFlags): InitOverrides {
  return {
    ...(flags.id === undefined ? {} : { projectId: flags.id }),
    ...(flags.check === undefined ? {} : { checks: flags.check }),
    ...(flags.journal === undefined ? {} : { journal: flags.journal }),
  };
}

const COMMANDS: Readonly<Record<CommandName, Command>> = {
  init: {
    section: "start",
    run: async ({ args, directory, messages, adapters }) => {
      const { values } = parseArgs({
        args,
        options: {
          yes: { type: "boolean", short: "y" },
          agent: { type: "string" },
          id: { type: "string" },
          check: { type: "string", multiple: true },
          journal: { type: "string" },
        },
      });
      const canAsk = values.yes !== true && process.stdin.isTTY === true;
      const confirm = canAsk
        ? terminalConfirmation({ input: process.stdin, output: process.stdout })
        : confirmWithoutAsking;

      const isReady = await initProject(directory, {
        confirm,
        overrides: initOverridesOf(values),
        installation: await readInstallation(),
        messages,
        adapters,
        agent: values.agent,
      });

      return isReady ? SUCCESS : FAILURE;
    },
  },
  sync: {
    section: "maintenance",
    run: async ({ args, directory, messages, adapters }) => {
      const { values } = parseArgs({
        args,
        options: {
          check: { type: "boolean" },
          diff: { type: "boolean" },
          json: { type: "boolean" },
          force: { type: "boolean" },
        },
      });
      const installation = await readInstallation();
      const isPreview = values.check === true || values.diff === true;

      if (isPreview) {
        const isJson = values.json === true;
        const isUpToDate = await previewProject(directory, {
          installation,
          messages,
          adapters,
          isJson,
        });
        const isCheckFailed = values.check === true && !isUpToDate;

        return isCheckFailed ? FAILURE : SUCCESS;
      }

      if (values.json === true) throw new CommandError((m) => m.errors.jsonNeedsPreview);

      await syncProject(directory, {
        force: values.force === true,
        installation,
        messages,
        adapters,
      });

      return SUCCESS;
    },
  },
  doctor: {
    section: "maintenance",
    run: async (invocation) => {
      const { values } = parseArgs({
        args: invocation.args,
        options: { "run-checks": { type: "boolean" }, json: { type: "boolean" } },
      });
      const commandsCheck = values["run-checks"] === true ? commandsPassCheck : commandsFoundCheck;
      const adapters = await adaptersAt(invocation.directory, invocation.adapters);
      const options = {
        ...doctorOptionsOf(invocation, await readInstallation(), { adapters, commandsCheck }),
        isJson: values.json === true,
      };
      const isHealthy = await runDoctor(invocation.directory, options);

      return isHealthy ? SUCCESS : FAILURE;
    },
  },
  disconnect: {
    section: "maintenance",
    run: async ({ args, directory, messages, adapters }) => {
      const { values } = parseArgs({
        args,
        options: { yes: { type: "boolean", short: "y" }, agent: { type: "string" } },
      });
      const isTerminal = process.stdin.isTTY === true;
      const canAsk = values.yes !== true && isTerminal;
      const confirm = canAsk
        ? terminalConfirmation({ input: process.stdin, output: process.stdout })
        : refuseWithoutTerminal(values.yes === true, messages);
      const outcome = await disconnectProject(directory, {
        confirm,
        messages,
        adapters,
        agent: values.agent,
      });
      const isRefused = outcome === "cancelled" && !canAsk;

      return isRefused ? FAILURE : SUCCESS;
    },
  },
  status: {
    section: "start",
    run: async ({ args, directory, messages }) => {
      const { values } = parseArgs({ args, options: { json: { type: "boolean" } } });
      const installation = await readInstallation();

      await printStatus(directory, { installation, messages, isJson: values.json === true });

      return SUCCESS;
    },
  },
  decision: {
    section: "journal",
    run: async ({ args, directory, messages }) => {
      const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        options: { why: { type: "string" } },
      });

      const title = requiredText(positionals.join(" "), (m) => m.errors.missingDecisionText);

      await recordDecision({ directory, title, description: values.why ?? "", messages });

      return SUCCESS;
    },
  },
  note: {
    section: "journal",
    run: async ({ args, directory, messages }) => {
      const { positionals } = parseArgs({ args, allowPositionals: true });

      const text = requiredText(positionals.join(" "), (m) => m.errors.missingNoteText);

      await recordNote(directory, text, messages);

      return SUCCESS;
    },
  },
  view: {
    section: "journal",
    run: async ({ args, directory, env, messages, language, adapters }) => {
      const { values } = parseArgs({ args, options: { "no-open": { type: "boolean" } } });
      const server = await startView(directory, {
        messages,
        language,
        adapters,
        env,
        locate: (spec, root) => locateViewer(viewerInvocationOf(spec, process.platform), root, env),
        open: openInBrowser,
        isOpening: values["no-open"] !== true,
      });

      await untilStopped();
      await server.close();

      return SUCCESS;
    },
  },
  draft: {
    section: "service",
    run: async ({ args, directory, language, adapters }) => {
      const { positionals, values } = parseArgs({
        args,
        allowPositionals: true,
        options: { agent: { type: "string" } },
      });
      const [rawPath] = positionals;
      const { config } = await requireProjectAt(directory);

      await adapterNamed(config, adapters, values.agent).draftSession({
        projectDirectory: directory,
        language,
        ...(rawPath === undefined ? {} : { rawPath }),
      });

      return SUCCESS;
    },
  },
  publish: {
    section: "service",
    run: async ({ args, directory, language, adapters }) => {
      const { values } = parseArgs({
        args,
        options: {
          agent: { type: "string" },
          draft: { type: "string" },
          build: { type: "string" },
        },
      });
      const { config } = await requireProjectAt(directory);
      const published = await adapterNamed(config, adapters, values.agent).publishSessions({
        projectDirectory: directory,
        language,
        ...(values.draft === undefined ? {} : { draftPath: values.draft }),
        ...(values.build === undefined ? {} : { buildId: values.build }),
      });

      return published ? SUCCESS : FAILURE;
    },
  },
  login: {
    section: "gallery",
    run: async ({ env, messages }) => {
      await login(defaultSharing(env), messages);

      return SUCCESS;
    },
  },
  logout: {
    section: "gallery",
    run: async ({ env, messages }) => {
      await logout(defaultSharing(env), messages);

      return SUCCESS;
    },
  },
  share: {
    section: "gallery",
    run: async ({ args, directory, env, messages }) => {
      const { positionals } = parseArgs({ args, allowPositionals: true });
      const [id] = positionals;

      const recordId = requiredText(id, (m) => m.errors.missingRecordId);

      await shareRecording(defaultSharing(env), { directory, id: recordId, messages });

      return SUCCESS;
    },
  },
  unshare: {
    section: "gallery",
    run: async ({ args, env, messages }) => {
      const { positionals } = parseArgs({ args, allowPositionals: true });
      const [id] = positionals;

      const recordId = requiredText(id, (m) => m.errors.missingRecordId);

      await unshareRecording(defaultSharing(env), recordId, messages);

      return SUCCESS;
    },
  },
  gallery: {
    section: "gallery",
    run: async ({ args, env, messages }) => {
      const { values } = parseArgs({
        args,
        options: { public: { type: "boolean" }, private: { type: "boolean" } },
      });
      const access = galleryAccessOf(values.public === true, values.private === true);

      await showGallery(defaultSharing(env), access, messages);

      return SUCCESS;
    },
  },
  hook: {
    section: "service",
    run: async ({ args, directory, env, language, adapters }) => {
      const { positionals, values } = parseArgs({
        args,
        allowPositionals: true,
        options: { agent: { type: "string" } },
      });
      const [name = ""] = positionals;
      const adapter = adapters[agentNamed(values.agent ?? DEFAULT_AGENT_NAME)];

      if (!adapter.hookNames.includes(name)) {
        throw new CommandError((m) => m.errors.unknownHook(name));
      }

      const payload = await readStdin();
      const outcome = await adapter.runHook(name, {
        payload,
        directory,
        env,
        tmpDir: tmpdir(),
        language,
      });

      process.stdout.write(outcome.stdout);
      process.stderr.write(outcome.stderr);

      return outcome.exitCode;
    },
  },
};

const EXPECTED_ERRORS = [CommandError, ApiError, ProjectFileError, JournalError, RecordError];
const ARGUMENT_ERROR_PREFIX = "ERR_PARSE_ARGS";

// Errors the human fixes themselves: the message is enough. parseArgs reports invalid arguments
// with an ERR_PARSE_ARGS_* error code. Adapter errors are expected too, but they are recognized by
// the adapters themselves (`describeError`).
function isExpected(err: unknown): err is Error {
  if (EXPECTED_ERRORS.some((kind) => err instanceof kind)) return true;

  const code = err instanceof Error && "code" in err ? err.code : undefined;

  return typeof code === "string" && code.startsWith(ARGUMENT_ERROR_PREFIX);
}

// Errors with catalog text are printed in the chosen language; the rest as is: server texts and
// file format diagnostics are not translated.
function expectedErrorText(err: Error, messages: CliMessages): string {
  if (err instanceof CommandError) return err.describe(messages);

  return err.message;
}

// The text of an error that belongs to one of the adapters, in the chosen language.
function adapterErrorText(
  err: unknown,
  adapters: Adapters,
  language: InterfaceLanguage,
): string | undefined {
  for (const adapter of Object.values(adapters)) {
    const text = adapter.describeError(err, language);

    if (text !== undefined) return text;
  }

  return undefined;
}

interface UnexpectedError {
  name: CommandName;
  err: unknown;
  env: Environment;
  messages: CliMessages;
}

// An error the human does not expect is also printed without a stack trace: what happened and
// where to get details. The trace only with CYBERZAVOD_DEBUG.
function printUnexpectedError({ name, err, env, messages }: UnexpectedError): number {
  const reason = err instanceof Error ? err.message : String(err);
  const isDebug = Boolean(env[DEBUG_VARIABLE]);

  console.error(`cyberzavod ${name}: ${messages.errors.unexpected(reason)}`);

  if (isDebug && err instanceof Error && err.stack !== undefined) console.error(err.stack);
  else console.error(messages.errors.debugHint(DEBUG_VARIABLE));

  return FAILURE;
}

function isCommandName(name: string): name is CommandName {
  return (COMMAND_NAMES as readonly string[]).includes(name);
}

function hasHelpFlag(args: readonly string[]): boolean {
  const optionEnd = args.indexOf(OPTIONS_END);
  const options = optionEnd === -1 ? args : args.slice(0, optionEnd);

  return options.some((argument) => COMMAND_HELP_FLAGS.includes(argument));
}

// Service commands are not suggested: the human does not type them.
function printUnknownCommand(name: string, messages: CliMessages): number {
  const suggestion = closestName(name, listedCommandNames(COMMANDS));
  const text =
    suggestion === undefined
      ? messages.errors.unknownCommand(name)
      : messages.errors.unknownCommandWithSuggestion({ name, suggestion });

  console.error(`cyberzavod: ${text}`);

  return FAILURE;
}

/** The chosen language and the arguments without the `--lang` flag. */
interface LanguageChoice {
  language: InterfaceLanguage;
  rest: string[];
}

// A language flag error is returned, not thrown: it has to be printed in a language without the
// flag.
function chooseLanguage(argv: string[], env: Environment): LanguageChoice | CommandError {
  try {
    const { flag, rest } = extractLanguageFlag(argv);

    return { language: languageOf({ flag, env }), rest };
  } catch (err) {
    if (err instanceof CommandError) return err;

    throw err;
  }
}

function printLanguageError(err: CommandError, env: Environment): number {
  const messages = CLI_MESSAGES[languageOf({ flag: undefined, env })];

  console.error(`cyberzavod: ${err.describe(messages)}`);

  return FAILURE;
}

/**
 * Runs a CLI command.
 * @param {string[]} argv Arguments after the program name.
 * @param {string} directory Directory the CLI was run from.
 * @param {Environment} env Process environment: message language, server address, hook project
 *   directory.
 * @returns {Promise<number>} Exit code.
 */
export async function runCli(argv: string[], directory: string, env: Environment): Promise<number> {
  const choice = chooseLanguage(argv, env);

  if (choice instanceof CommandError) return printLanguageError(choice, env);

  const messages = CLI_MESSAGES[choice.language];
  const { language } = choice;
  const adapters = createAdapters({ env, homeDirectory: homedir() });
  const [name, ...args] = choice.rest;

  if (name === undefined || GENERAL_HELP_REQUESTS.includes(name)) {
    console.log(generalHelp(messages, COMMANDS));

    return SUCCESS;
  }

  // The version is printed as a bare number, like npm does: scripts and the release check read it.
  if (VERSION_REQUESTS.includes(name)) {
    console.log(HARNESS_VERSION);

    return SUCCESS;
  }

  if (!isCommandName(name)) return printUnknownCommand(name, messages);

  if (hasHelpFlag(args)) {
    console.log(commandHelp(name, messages));

    return SUCCESS;
  }

  try {
    return await COMMANDS[name].run({ args, directory, env, messages, language, adapters });
  } catch (err) {
    const adapterText = adapterErrorText(err, adapters, language);

    if (adapterText !== undefined) {
      console.error(`cyberzavod ${name}: ${adapterText}`);

      return FAILURE;
    }

    if (!isExpected(err)) return printUnexpectedError({ name, err, env, messages });

    console.error(`cyberzavod ${name}: ${expectedErrorText(err, messages)}`);

    return FAILURE;
  }
}
