// English CLI texts.

import { CLI_COMMAND } from "@cyberzavod/adapter-kit";
import { AGENT_NAMES, DEFAULT_AGENT_NAME } from "../agents/agent-adapter.ts";
import { API_URL_VARIABLE, DEFAULT_API_URL } from "../sharing/services.ts";
import { VIEWER_PACKAGE_NAME, VIEWER_PACKAGE_VARIABLE } from "../viewer/viewer-package.ts";
import type { CliMessages } from "./cli-messages.ts";
import { ALL_HOOK_NAMES } from "./hook-names.ts";

/** CLI texts in English. */
export const en: CliMessages = {
  help: {
    title: "Cyberzavod — a local-first development harness for AI coding agents.",
    quickStart: `Start: ${CLI_COMMAND} init [--agent codex], /setup, /feature (Codex: $name).`,
    sections: {
      start: "Getting started",
      journal: "Journal",
      gallery: "Gallery",
      maintenance: "Maintenance",
    },
    parametersTitle: "Parameters:",
    footer: (languages) =>
      `Command details: ${CLI_COMMAND} <command> --help · language: --lang ${languages}`,
  },
  commands: {
    init: {
      usage: "init [options]",
      summary: "set up the project: config, AGENTS.md, agent files",
      parameters: [
        { name: "--yes, -y", description: "do not ask for confirmation" },
        {
          name: "--agent <agent>",
          description: `agent: ${AGENT_NAMES.join(", ")}; default: ${DEFAULT_AGENT_NAME}`,
        },
        { name: "--id <id>", description: "project id; default: package or directory name" },
        {
          name: "--check <command>",
          description: "check command, repeatable; replaces the detected ones",
        },
        { name: "--journal <path>", description: "journal directory from the project root" },
      ],
    },
    sync: {
      usage: "sync [--check | --diff] [--json] [--force]",
      summary: "detect the stack again and rebuild the agent files",
      parameters: [
        { name: "--check", description: "only show what would change; exit 1 if anything would" },
        { name: "--diff", description: "only show what would change; exit 0" },
        { name: "--json", description: "with --check or --diff: print JSON for scripts" },
        {
          name: "--force",
          description: "overwrite your files and generated files you edited by hand",
        },
      ],
    },
    doctor: {
      usage: "doctor [--run-checks] [--json]",
      summary: "check the setup and say how to fix each problem",
      parameters: [
        {
          name: "--run-checks",
          description: "run the check commands instead of only looking for them",
        },
        { name: "--json", description: "print JSON for scripts" },
      ],
    },
    disconnect: {
      usage: "disconnect [--yes]",
      summary: "remove Cyberzavod from the project; code, AGENTS.md, journal stay",
      parameters: [{ name: "--yes, -y", description: "do not ask for confirmation" }],
    },
    status: {
      usage: "status [--json]",
      summary: "project, workflow, stage agents, checks and the journal",
      parameters: [{ name: "--json", description: "print JSON for scripts" }],
    },
    decision: {
      usage: 'decision "<what was decided>" [--why "<why>"]',
      summary: "record a decision in the journal",
      parameters: [
        { name: '"<what was decided>"', description: "the decision text" },
        { name: "--why", description: "the reason, saved with the decision" },
      ],
    },
    note: {
      usage: 'note "<text>"',
      summary: "record a note in the journal",
      parameters: [{ name: '"<text>"', description: "the note text" }],
    },
    view: {
      usage: "view [--no-open]",
      summary: "show your recordings and drafts on the factory floor",
      parameters: [
        { name: "--no-open", description: "do not open the browser, only print the address" },
        {
          name: VIEWER_PACKAGE_VARIABLE,
          description: `${VIEWER_PACKAGE_NAME} spec or archive path`,
        },
      ],
    },
    draft: {
      usage: "draft [--agent <agent>] [<raw session log>]",
      summary: "build a recording draft from an agent session log",
      parameters: [
        {
          name: "--agent <agent>",
          description: "agent whose log it is; needed when several are connected",
        },
        {
          name: "<raw session log>",
          description: "path to the log; default — the newest raw log",
        },
      ],
    },
    publish: {
      usage: "publish [--agent <agent>] [--draft <draft>] [--build <build id>]",
      summary: "publish the edited draft as records in the journal",
      parameters: [
        {
          name: "--agent <agent>",
          description: "agent whose draft it is; needed when several are connected",
        },
        { name: "--draft", description: "path to the draft; default — the newest one" },
        { name: "--build", description: "draft build to publish; default — all" },
      ],
    },
    login: {
      usage: "login",
      summary: "sign in with GitHub to publish recordings to your gallery",
      parameters: [
        {
          name: API_URL_VARIABLE,
          description: `server address; default ${DEFAULT_API_URL}`,
        },
      ],
    },
    logout: {
      usage: "logout",
      summary: "forget the saved GitHub token",
      parameters: [],
    },
    share: {
      usage: "share <recording id>",
      summary: "send a recording from the journal to your gallery",
      parameters: [{ name: "<recording id>", description: "id of a session recording" }],
    },
    unshare: {
      usage: "unshare <recording id>",
      summary: "remove a recording from your gallery",
      parameters: [{ name: "<recording id>", description: "id of a recording in the gallery" }],
    },
    gallery: {
      usage: "gallery [--public | --private]",
      summary: "your gallery: recordings, limit, links; open or close it",
      parameters: [
        { name: "--public", description: "open the gallery" },
        { name: "--private", description: "close the gallery" },
      ],
    },
    hook: {
      usage: `hook <${ALL_HOOK_NAMES.join("|")}> [--agent <agent>]`,
      summary: "agent hook: the agent's hook file calls it, not a person",
      parameters: [
        { name: "<hook name>", description: "the event arrives on stdin" },
        {
          name: "--agent <agent>",
          description: `agent whose hook it is: ${AGENT_NAMES.join(", ")}; default: ${DEFAULT_AGENT_NAME}`,
        },
      ],
    },
  },
  init: {
    summaryTitle: "Cyberzavod will set up this project:",
    projectId: (id) => `Project id: ${id}`,
    checks: (commands) => `Checks: ${commands}`,
    checksMissing: ({ file, terms }) =>
      `Checks: none found — ${terms.skill("setup")} or edit ${file}`,
    rulesStarter: (file) => `Agent rules: ${file} — a starter set, fill it in`,
    rulesMoved: ({ from, to }) => `Agent rules: your ${from} becomes ${to}`,
    rulesKept: (file) => `Agent rules: ${file} already exists, it stays as is`,
    journal: (path) => `Session journal: ${path}`,
    files: (paths) => `Will appear: ${paths}`,
    trustProject: (file) => `Trust: the project will be marked trusted in ${file}`,
    trustHooks: (file) => `Trust: the project hooks will be approved in ${file}`,
    overrideHint: `Change: --id, --check, --journal — details: ${CLI_COMMAND} init --help`,
    confirm: "Continue? [Y/n]",
    cancelled: "Cancelled: nothing was written",
    done: "Done: the project is set up.",
    commit: (paths) => `Commit: ${paths}`,
    nextSteps: (terms) =>
      `Next: open ${terms.product} and run ${terms.skill("setup")}, then ${terms.skill("feature")} <task>.`,
    alreadyConnected: "Cyberzavod is already initialized in this project.",
    configValid: "✓ Configuration valid",
    filesCurrent: "✓ Generated files current",
    filesOutdated: "✗ Generated files are out of date",
    nothingToDo: "Nothing to do.",
    runSync: `Run:\n  ${CLI_COMMAND} sync`,
  },
  sync: {
    added: "Added",
    updated: "Updated",
    removed: "Removed",
    willAdd: "Will add",
    willUpdate: "Will update",
    willRemove: "Will remove",
    yours: "Will NOT touch (your files where generated ones go)",
    edited: "Will NOT touch (generated files you edited by hand)",
    neverTouched: (terms) =>
      `Never touched: AGENTS.md, your own ${terms.product} settings and hooks, the journal, your code.`,
    trustRefreshed: (file) => `Hook approval in ${file} moved to the new hooks.`,
    upToDate: "Up to date: nothing to change.",
    harnessMismatch: ({ file, configVersion, cliVersion }) =>
      `${file}: harness ${configVersion}, but the CLI is ${cliVersion}`,
    filesOutdated: `Out of date. Run:\n  ${CLI_COMMAND} sync`,
    blocked: `sync will stop on the files above and change nothing. Fix: move your edits to AGENTS.md and delete those files, or overwrite them:\n  ${CLI_COMMAND} sync --force`,
  },
  doctor: {
    fix: (text) => `How to fix: ${text}`,
    hint: (text) => `Hint: ${text}`,
    allPassed: "All good.",
    problems: (count) => `Problems: ${count}.`,
    node: {
      passed: (version) => `Node.js ${version}`,
      tooOld: ({ version, minimum }) =>
        `Node.js ${version} is too old: ${minimum} or newer is needed`,
      install: (minimum) => `install Node.js ${minimum} or newer`,
    },
    git: {
      passed: "git is installed",
      missing: "git was not found in PATH",
      install: "install git and make sure it is in PATH",
    },
    claudeCode: {
      passed: "Claude Code is installed",
      missing:
        "Claude Code (claude) was not found in PATH: fine if you use the desktop app or an IDE extension",
      install: "install Claude Code: https://claude.com/claude-code",
    },
    codex: {
      passed: "Codex is installed",
      missing:
        "Codex (codex) was not found in PATH: fine if you use the desktop app or an IDE extension",
      install: "install Codex: https://developers.openai.com/codex/cli",
    },
    gallery: {
      signedIn: "gallery: signed in",
      notSignedIn: "gallery: not signed in (needed only to publish recordings)",
      signIn: `to publish recordings, run ${CLI_COMMAND} login`,
      corrupt: "gallery: the saved sign-in file is corrupted",
      signInAgain: `run ${CLI_COMMAND} login again`,
    },
    config: {
      passed: ({ file, projectId, harness }) => `${file}: project ${projectId}, harness ${harness}`,
      notFound: (directory) => `no Cyberzavod project found from ${directory}`,
      init: `run ${CLI_COMMAND} init in the project root`,
      invalid: (reason) => `the project config cannot be used: ${reason}`,
      repair: (file) => `correct ${file} following the message above`,
      agents: (reason) => `the agents in the project config cannot be used: ${reason}`,
      fixAgents: (file) => `edit agents in ${file}`,
    },
    hooks: {
      passed: (version) => `agent hooks are installed for ${version}`,
      missing: (file) => `agent hooks are not installed in ${file}`,
      otherVersion: ({ file, found, configVersion }) =>
        `agent hooks in ${file} are for ${found}, but the config says ${configVersion}`,
      incomplete: (events) => `agent hooks are incomplete: nothing is set for ${events}`,
      unreadable: (reason) => `agent hooks cannot be checked: ${reason}`,
      sync: `run ${CLI_COMMAND} sync`,
      repairSettings: (file) => `fix the JSON in ${file}, then run ${CLI_COMMAND} sync`,
    },
    trust: {
      passed: (file) => `the project and its hooks are trusted in ${file}`,
      projectUntrusted: ({ file, terms }) =>
        `the project is not trusted in ${file}: ${terms.product} ignores its hooks`,
      trustProject: ({ file, projectKey, terms }) =>
        `open ${terms.product} in the project and trust it, or add [projects.${JSON.stringify(projectKey)}] trust_level = "trusted" to ${file}`,
      hooksUntrusted: ({ events, terms }) =>
        `${terms.product} has not approved the project hooks: ${events}`,
      approveHooks: (terms) => `open ${terms.product} and approve the hooks with /hooks`,
      unreadable: (reason) => `trust cannot be checked: ${reason}`,
      repairConfig: `fix the file named above, then run ${CLI_COMMAND} doctor`,
    },
    files: {
      upToDate: "agent files are up to date",
      versionsDiffer: ({ file, configVersion, cliVersion }) =>
        `${file} says harness ${configVersion}, but this CLI is ${cliVersion}: the agent files cannot be compared`,
      matchVersion: (configVersion) =>
        `run ${CLI_COMMAND} sync, or run ${CLI_COMMAND}@${configVersion} doctor`,
      outdated: (count) => `agent files are outdated or extra: ${count}`,
      sync: `run ${CLI_COMMAND} sync (${CLI_COMMAND} sync --check lists the files)`,
      writtenByHuman: (files) => `agent files that are yours or edited by hand: ${files}`,
      moveToRules: (rulesFile) =>
        `move your edits to ${rulesFile} and run ${CLI_COMMAND} sync --force`,
      cannotCheck: (reason) => `agent files cannot be checked: ${reason}`,
      fixCause: `remove the cause above and run ${CLI_COMMAND} sync --check`,
    },
    rules: {
      passed: (file) => `${file} is filled in`,
      missing: (file) => `${file} does not exist`,
      create: (terms) => `create it or run ${terms.skill("setup")} in ${terms.product}`,
      unfilled: (file) => `${file} still has starter placeholders`,
      fill: (terms) => `run ${terms.skill("setup")} in ${terms.product}`,
    },
    commands: {
      noneSet: (file) => `no check commands are set in ${file}`,
      setUp: ({ file, terms }) =>
        `run ${terms.skill("setup")} in ${terms.product} or add the commands to ${file}`,
      programsFound: (programs) =>
        `programs ${programs} found; the commands were not run — ${CLI_COMMAND} doctor --run-checks`,
      programsMissing: (programs) => `check programs not found: ${programs}`,
      fixPrograms: (file) =>
        `install the programs or correct the commands in ${file}; a command that starts with a shell builtin (cd web && …) is not recognised: wrap it in a make target or a script, or run ${CLI_COMMAND} doctor --run-checks`,
      allPassed: (count) => `check commands pass: ${count}`,
      quoted: (command) => `“${command}”`,
      exited: ({ command, code }) => `“${command}” (exit ${code})`,
      notStarted: ({ command, reason }) => `“${command}” (not started: ${reason})`,
      failed: (commands) => `check commands failed: ${commands}`,
      runYourself: (commands) => `run ${commands} yourself and read the error`,
    },
    gitignore: {
      passed: (entry) => `.gitignore ignores ${entry}`,
      nothingToIgnore: "the journal is outside the project: nothing to ignore",
      missing: (entry) => `.gitignore has no line ${entry}: raw session logs may get committed`,
      add: ({ entry, file }) => `add the line ${entry} to ${file}`,
    },
  },
  disconnect: {
    willRemove: "Cyberzavod will remove:",
    willKeep: "Will keep:",
    settingsUpdated: (file) =>
      `Cyberzavod hooks and permission rules in ${file} (the rest of the file stays)`,
    settingsRemoved: (file) => `${file} (it holds only Cyberzavod hooks and rules)`,
    keepSource: "your project source",
    keepJournal: (path) => `the journal: ${path} (sessions, decisions, notes)`,
    keepIgnoreEntry: (entry) => `the .gitignore line ${entry} (keeps raw session logs out of git)`,
    keepSettings: (terms) => `your own ${terms.product} settings, hooks and permission rules`,
    untrustProject: (file) => `the trust Cyberzavod gave the project in ${file}`,
    untrustHooks: (file) => `the approval of the project hooks in ${file}`,
    keepProjectTrust: (file) => `the trust you gave the project in ${file}`,
    editedFile: (file) => `${file} (generated, but you edited it by hand)`,
    confirm: "Continue? [Y/n]",
    cancelled: "Cancelled: nothing was changed.",
    needsConfirmation: `Nothing was changed: there is no terminal to ask in. To remove without asking, run:\n  ${CLI_COMMAND} disconnect --yes`,
    done: "Done: Cyberzavod was removed from this project. Review and commit the changes.",
    agentRulesHint: ({ rulesFile, terms, agentRulesFile }) =>
      `${terms.product} reads ${agentRulesFile}: to keep your ${rulesFile} rules in ${terms.product}, create ${agentRulesFile} with the single line @${rulesFile}.`,
  },
  status: {
    recordTypes: { session: "sessions", decision: "decisions", note: "notes" },
    foreman: "lead",
    checksNone: "none set",
    project: ({ id, root }) => `Project: ${id} (${root})`,
    harness: (version) => `Harness: ${version}`,
    harnessOutdated: ({ version, cliVersion }) =>
      `Harness: ${version} (CLI is ${cliVersion}, run ${CLI_COMMAND} sync)`,
    workflow: (name) => `Workflow: ${name}`,
    checks: (commands) => `Checks: ${commands}`,
    journal: ({ path, counts }) => `Journal: ${path} — ${counts}`,
    latestRecord: ({ timestamp, type }) => `Latest record: ${timestamp} (${type})`,
  },
  journal: {
    recorded: (path) => `recorded: ${path}`,
  },
  view: {
    preparing: (spec) =>
      `Getting the factory floor (${spec}); the first run downloads it, later runs need no network`,
    address: (url) => `factory floor: ${url}`,
    stopHint: "Press Ctrl+C to stop.",
    openFailed: "could not open the browser: open the address above yourself",
    requestFailed: (reason) => `could not answer the browser: ${reason}`,
  },
  login: {
    openVerification: ({ url, code }) => `Open ${url} and enter the code ${code}`,
    waiting: "Waiting for confirmation…",
    loggedIn: (login) => `signed in: ${login}`,
    loggedOut: "signed out: the token was removed",
    wasNotLoggedIn: "you were not signed in",
  },
  share: {
    sent: (id) => `recording ${id} sent`,
    replaced: (id) => `recording ${id} replaced`,
    link: (url) => `link: ${url}`,
    galleryClosed: "the gallery is closed: the recording is visible only by this link",
    openGalleryHint: `open the gallery: ${CLI_COMMAND} gallery --public`,
    removed: (id) => `recording ${id} removed from the gallery`,
    galleryRecordings: ({ count, limit }) => `Recordings in the gallery (${count} of ${limit}):`,
    freeUpSpace: `Free up space with ${CLI_COMMAND} unshare <id>`,
  },
  gallery: {
    closed: (login) => `${login}'s gallery: closed, recordings are visible only by links`,
    open: (login) => `${login}'s gallery: open`,
    recordings: ({ count, limit }) => `Recordings: ${count} of ${limit}`,
    openHint: `Open the gallery: ${CLI_COMMAND} gallery --public`,
    closeHint: `Close the gallery: ${CLI_COMMAND} gallery --private`,
    page: (url) => `Gallery page: ${url}`,
    badge: (markdown) => `README badge: ${markdown}`,
  },
  errors: {
    missingDecisionText: "the decision text is required",
    missingNoteText: "the note text is required",
    missingRecordId: "the recording id is required",
    unknownHook: (name) => `no hook named ${name}`,
    unknownAgent: ({ agent, supported }) =>
      `unknown agent ${agent} in --agent: supported agents are ${supported}`,
    agentRequired: (agents) =>
      `several agents are connected (${agents}): name one with --agent <agent>`,
    agentNotConnected: ({ agent, agents }) =>
      `the agent ${agent} is not connected to this project (connected: ${agents}): ${CLI_COMMAND} init --agent ${agent} adds it`,
    unsupportedAgent: ({ agent, supported }) =>
      `the agent “${agent}” is not supported: available are ${supported}`,
    unknownCommand: (name) => `unknown command “${name}”: all commands — ${CLI_COMMAND} --help`,
    unknownCommandWithSuggestion: ({ name, suggestion }) =>
      `unknown command “${name}”: did you mean ${CLI_COMMAND} ${suggestion}? All commands: ${CLI_COMMAND} --help`,
    languageFlagWithoutValue: "--lang has no value: give a language, for example --lang en",
    unsupportedLanguage: ({ value, supported }) =>
      `language “${value}” is not supported: available are ${supported}`,
    projectNotFound: (directory) =>
      `${directory} is not in a Cyberzavod project: run ${CLI_COMMAND} init first`,
    viewerUnavailable: (spec) =>
      `could not get the factory floor package ${spec}: the first run needs network access to download it`,
    viewerBroken: (directory) =>
      `the factory floor package is incomplete: no index.html in ${directory}`,
    unexpected: (reason) => `unexpected error: ${reason}`,
    debugHint: (variable) =>
      `Run ${CLI_COMMAND} doctor to check the setup. For the full trace, run again with ${variable}=1 and report it at https://github.com/bysavelii/cyberzavod/issues`,
    packageJsonInvalid: ({ file, reason }) =>
      `${file} is not valid JSON (${reason}). Nothing was changed. Fix ${file} and run the command again`,
    jsonNeedsPreview: `--json works only with --check or --diff: ${CLI_COMMAND} sync --check --json`,
    initBlocked: ({ files, rulesFile }) =>
      `could not initialize this project.\n\nThese files already exist and are not managed by Cyberzavod: ${files}\n\nNothing was changed.\n\nFix: move their content into ${rulesFile}, delete them, then run again:\n  ${CLI_COMMAND} init`,
    blankOption: (option) => `${option} is empty: give a value`,
    journalIsProjectRoot: (path) =>
      `--journal ${path} is the project root: give a directory for the journal, for example .cyberzavod/journal`,
    absoluteJournal: (path) =>
      `--journal must be a path from the project root, not an absolute one: ${path}`,
    invalidRecordId: (id) =>
      `${id} does not look like a recording id: only letters, digits, “_” and “-”`,
    recordMissing: ({ id, file }) =>
      `no recording ${id} in the journal: the file ${file} does not exist`,
    recordInvalid: ({ id, reason }) => `recording ${id} failed validation: ${reason}`,
    recordNotSession: ({ id, type }) =>
      `recording ${id} failed validation: its type is ${type}, a session is required`,
    galleryAccessConflict: "--public and --private cannot be combined: pick one",
    notLoggedIn: `not signed in: sign in with ${CLI_COMMAND} login`,
    tokenRejected: `the server did not accept the token: sign in again with ${CLI_COMMAND} login`,
    limitReached: "the gallery already holds the maximum number of recordings",
    credentialsCorrupt: (file) =>
      `the file ${file} is corrupted: sign in again with ${CLI_COMMAND} login`,
    loginCodeExpired: `the sign-in code expired: run ${CLI_COMMAND} login again`,
    loginDenied: "sign-in was denied on the GitHub page",
    noConnection: ({ origin, reason }) => `cannot reach ${origin}: ${reason}`,
    githubUnexpectedField: (name) => `GitHub returned an unexpected response: no field ${name}`,
    githubNoDeviceCode: "GitHub did not issue a device code",
    githubNoToken: "GitHub did not issue a token",
    githubRejected: (reason) => `GitHub rejected the sign-in: ${reason}`,
    serverUnexpectedResponse: (field) =>
      `the server returned an unexpected response: no valid field ${field}`,
    serverStatus: (status) => `the server answered ${status}`,
  },
};
